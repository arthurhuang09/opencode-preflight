import { OpencodeClient } from "@opencode-ai/sdk/v2";
import { tool } from "@opencode-ai/plugin";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { configurePreflight } from "./configure.js";
import { buildPreflight } from "./engine.js";

const injectedSessions = new Set();
const AUTO_STARTED_KEY = "__opencodePreflightAutoStarted";

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
  return event?.properties?.sessionID || event?.data?.sessionID || "";
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

export default async function opencodePreflight({ directory, client }) {
  let cachedPrompt = null;
  globalThis[AUTO_STARTED_KEY] ??= new Set();

  function getPrompt() {
    if (cachedPrompt !== null) return cachedPrompt;
    const result = buildPreflight(directory);
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
		if (globalThis[AUTO_STARTED_KEY].has(directory)) return;
		globalThis[AUTO_STARTED_KEY].add(directory);

    const prompt = getPrompt();
    if (!prompt) return;

    const v2 = makeV2Client(client);
    if (!v2) return;

    try {
      const created = await v2.session.create({
        directory,
        title: "Startup Preflight",
      });
      const session = unwrapData(created);
      const sessionId = session?.id;
      if (!sessionId) return;

      injectedSessions.add(sessionId);
      await sendStartupPrompt({ v2, client, directory, sessionId, prompt });
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
				},
				async execute(args) {
					const result = configurePreflight(directory, { force: args.force === true });
					return [
						"Preflight configuration complete.",
						`Created/updated: ${result.created.length ? result.created.join(", ") : "(none)"}`,
						`Skipped existing: ${result.skipped.length ? result.skipped.join(", ") : "(none)"}`,
					].join("\n");
				},
			}),
		},

		"experimental.chat.system.transform": async (_input, output) => {
      const prompt = getPrompt();
      if (!prompt) return;
      output.system.push(prompt);
    },

    event: async ({ event }) => {
      if (!isSessionCreatedEvent(event)) return;

      const sessionId = getSessionId(event);
      if (injectedSessions.has(sessionId)) return;
      injectedSessions.add(sessionId);
    },
  };
}

export { buildPreflight } from "./engine.js";
