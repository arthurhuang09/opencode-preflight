import { OpencodeClient } from "@opencode-ai/sdk/v2";
import { tool } from "@opencode-ai/plugin";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { configurePreflight, DEFAULT_ACTION_IDS } from "./configure.js";
import { buildPreflight, buildPreflightActionPrompt, listPreflightActions } from "./engine.js";

const injectedSessions = new Set();
const AUTO_STARTED_KEY = "__opencodePreflightAutoStarted";
const MAX_TRACKED_SESSIONS = 100;

function rememberSession(set, sessionID) {
  set.add(sessionID);
  while (set.size > MAX_TRACKED_SESSIONS) {
    set.delete(set.values().next().value);
  }
}

function hasExplicitSessionArg(argv = process.argv) {
	return argv.some((arg) => arg === "-s" || arg === "--session" || arg.startsWith("--session="));
}

function latestOpenCodeMainLaunchArgs() {
	try {
		const logDir = path.join(homedir(), ".local/share/opencode/log");
		if (!existsSync(logDir)) return [];

		const logs = readdirSync(logDir)
			.filter((name) => name.endsWith(".log"))
			.sort()
			.reverse()
			.slice(0, 20);

		for (const log of logs) {
			const firstLine = readFileSync(path.join(logDir, log), "utf8").split("\n")[0] ?? "";
			if (!firstLine.includes("process_role=main")) continue;

			const match = firstLine.match(/args=(\[[^\]]*\])/);
			return match ? JSON.parse(match[1]) : [];
		}
	} catch {
	}

	return [];
}

function shouldAutoStart() {
	return (
		process.env.OPENCODE_PREFLIGHT_AUTOSTART !== "0" &&
		!hasExplicitSessionArg() &&
		!hasExplicitSessionArg(latestOpenCodeMainLaunchArgs())
	);
}

async function logDebug(client, message) {
	await client?.app
		?.log?.({
			body: {
				service: "opencode-preflight",
				level: "debug",
				message,
			},
		})
		.catch?.(() => {});
}

function createStartupUserPrompt(preflightPrompt) {
	return [
		"Run the startup check according to the following OpenCode Startup Preflight content.",
		"",
		"First briefly explain the matched triggers, then immediately use the AskUserQuestion/question tool to ask which action I want to run. Do not ask using plain text only.",
		"",
		"The AskUserQuestion/question options should include each Available Action label plus a `Do not run anything for now` option.",
		"",
		"Do not run ask-before-execute actions until I confirm through AskUserQuestion/question.",
		"",
		preflightPrompt,
	].join("\n");
}

function makeV2Client(client) {
  const transport = client?._client;
  return transport ? new OpencodeClient({ client: transport }) : undefined;
}

function isSessionCreatedEvent(event) {
  return event?.type === "session.created" || event?.name === "session.created.1";
}

function getSessionId(event) {
  return event?.properties?.sessionID || event?.properties?.info?.id || event?.data?.sessionID || "";
}

function unwrapData(result) {
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new Error(JSON.stringify(result.error));
  }
  return result?.data;
}

async function sessionHasMessages(v2, directory, sessionID) {
  const result = await v2.session.messages({ directory, sessionID, limit: 1 });
  const messages = unwrapData(result);
  return Array.isArray(messages) && messages.length > 0;
}

export function isChildSession(session) {
  return Boolean(session?.parentID);
}

async function sessionIsChild(v2, directory, sessionID) {
  if (!sessionID) return false;
  const result = await v2.session.get({ directory, sessionID });
  return isChildSession(unwrapData(result));
}

async function sendStartupPrompt({ v2, client, directory, sessionId, prompt }) {
  const text = createStartupUserPrompt(prompt);
  if (await sessionHasMessages(v2, directory, sessionId)) return false;

  await v2.session.promptAsync({
    sessionID: sessionId,
    directory,
    parts: [{ type: "text", text }],
  });

  for (const delayMs of [500, 2500, 5000]) {
    setTimeout(() => {
      client?.tui
        ?.publish?.({
          directory,
          body: { type: "tui.session.select", properties: { sessionID: sessionId } },
        })
        .catch?.(() => {});
    }, delayMs);
  }

  return true;
}

export async function appendPreflightSystemPrompt({ v2, client, directory, sessionID, getPrompt, output }) {
  if (!v2) return;

  try {
    if (sessionID && (await sessionIsChild(v2, directory, sessionID))) return;
  } catch (error) {
    await logDebug(
      client,
      `child session detection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const prompt = getPrompt();
  if (!prompt) return;
  output.system.push(prompt);
}

export async function handleSessionCreatedPreflight({ event, v2, client, directory, getPrompt }) {
  if (!isSessionCreatedEvent(event)) return false;

  const sessionId = getSessionId(event);
  if (!sessionId) return false;
  if (injectedSessions.has(sessionId)) return false;
  rememberSession(injectedSessions, sessionId);

  try {
    const prompt = getPrompt();
    if (!prompt || !v2) return false;

    if (await sessionIsChild(v2, directory, sessionId)) return false;
    const submitted = await sendStartupPrompt({ v2, client, directory, sessionId, prompt });
    if (!submitted) return false;

    await client?.app
      ?.log?.({
        body: {
          service: "opencode-preflight",
          level: "info",
          message: `session.created prompt submitted to ${sessionId}`,
        },
      })
      .catch?.(() => {});
    return true;
  } catch (error) {
    await client?.app
      ?.log?.({
        body: {
          service: "opencode-preflight",
          level: "error",
          message: `session.created prompt failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
      .catch?.(() => {});
    return false;
  }
}

export default async function opencodePreflight({ directory, worktree, client }) {
  const root = worktree || directory;
  let cachedPrompt = null;
  globalThis[AUTO_STARTED_KEY] ??= new Set();
  const pendingSessionsKey = "__opencodePreflightPendingSessions";
  globalThis[pendingSessionsKey] ??= new Set();
  const pendingSessions = globalThis[pendingSessionsKey];

  function getPrompt() {
    if (cachedPrompt !== null) return cachedPrompt;
    const result = buildPreflight(root);
    cachedPrompt = result.active ? result.prompt : "";
    return cachedPrompt;
  }

	async function autoStartFromPluginLoad() {
		await logDebug(
			client,
			`startup argv=${JSON.stringify(process.argv)} sessionEnvKeys=${JSON.stringify(
				Object.keys(process.env).filter((key) => /SESSION|OPENCODE/i.test(key)).sort(),
			)}`,
		);

		if (!shouldAutoStart()) return;
		if (globalThis[AUTO_STARTED_KEY].has(root)) return;
		globalThis[AUTO_STARTED_KEY].add(root);

    const prompt = getPrompt();
    if (!prompt) return;

    const v2 = makeV2Client(client);
    if (!v2) return;

    try {
      const created = await v2.session.create({
        directory: root,
        title: "Startup Preflight",
      });
      const session = unwrapData(created);
      const sessionId = session?.id;
      if (!sessionId) return;

      rememberSession(injectedSessions, sessionId);
      await sendStartupPrompt({ v2, client, directory: root, sessionId, prompt });
      await client?.app
        ?.log?.({
          body: {
            service: "opencode-preflight",
            level: "info",
            message: `autostart prompt submitted to ${sessionId}`,
          },
        })
        .catch?.(() => {});
    } catch (error) {
      await client?.app
        ?.log?.({
          body: {
            service: "opencode-preflight",
            level: "error",
            message: `autostart failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        })
        .catch?.(() => {});
    }
  }

  setTimeout(() => {
    autoStartFromPluginLoad().catch(() => {});
  }, 1000);

	return {
		tool: {
			preflight_config: tool({
				description:
					"Create or repair the project-local OpenCode preflight config files under .opencode/preflight.",
				args: {
					force: tool.schema
						.boolean()
						.optional()
						.describe("Overwrite existing preflight files when true. Defaults to false."),
					actions: tool.schema
						.array(tool.schema.enum(DEFAULT_ACTION_IDS))
						.optional()
						.describe("Default action templates to create. Defaults to all templates."),
				},
				async execute(args) {
					const result = configurePreflight(root, { force: args.force === true, actions: args.actions });
					return [
						"Preflight configuration complete.",
						`Created/updated: ${result.created.length ? result.created.join(", ") : "(none)"}`,
						`Skipped existing: ${result.skipped.length ? result.skipped.join(", ") : "(none)"}`,
					].join("\n");
				},
			}),
			preflight_action_prompt: tool({
				description:
					"Build and record the prompt for one configured OpenCode preflight action.",
				args: {
					actionID: tool.schema.string().describe("The configured preflight action id to run."),
				},
				execute(args) {
					const result = buildPreflightActionPrompt(root, args.actionID, { recordEvent: "selected" });
					if (result.active) return result.prompt;

					return [
						`Preflight action '${args.actionID}' is not available.`,
						...(result.warnings.length > 0 ? ["", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`)] : []),
					].join("\n");
				},
			}),
			preflight_action_list: tool({
				description: "List configured OpenCode preflight actions, matched triggers, availability, and warnings.",
				args: {},
				execute() {
					const result = listPreflightActions(root);
					const lines = [
						`Active: ${result.active}`,
						...(result.inactiveReason ? [`Inactive reason: ${result.inactiveReason}`] : []),
						"",
						"Matched triggers:",
						...(result.triggers.length
							? result.triggers.map((trigger) => `- ${trigger.id}: ${trigger.label ?? trigger.id}`)
							: ["- (none)"]),
						"",
						"Actions:",
						...(result.actions.length
							? result.actions.map(
									(action) =>
										`- ${action.id}: ${action.label} [mode=${action.mode}, matched=${action.matched}, available=${action.available}]`,
								)
							: ["- (none)"]),
					];

					if (result.warnings.length > 0) {
						lines.push("", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`));
					}

					return lines.join("\n");
				},
			}),
		},

    "experimental.chat.system.transform": async (input, output) => {
      await appendPreflightSystemPrompt({
        v2: makeV2Client(client),
        client,
        directory: root,
        sessionID: input.sessionID,
        getPrompt,
        output,
      });
    },

    event: async ({ event }) => {
      if (!isSessionCreatedEvent(event)) return;

      const sessionId = getSessionId(event);
      if (!sessionId || pendingSessions.has(sessionId)) return;
      rememberSession(pendingSessions, sessionId);

      try {
        await handleSessionCreatedPreflight({
          event,
          v2: makeV2Client(client),
          client,
          directory: root,
          getPrompt,
        });
      } finally {
        pendingSessions.delete(sessionId);
      }
    },
  };
}

export { buildPreflight } from "./engine.js";
