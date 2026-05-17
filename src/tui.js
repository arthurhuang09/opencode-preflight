import { listPreflightActions } from "./engine.js";

function getSessionID(api) {
	return api.route.current.name === "session" ? api.route.current.params.sessionID : undefined;
}

function requireSession(api, command) {
	const sessionID = getSessionID(api);
	if (sessionID) return sessionID;

	api.ui.toast({
		message: `Open a session first, then run /${command}.`,
		variant: "warning",
	});
	return undefined;
}

function sendPrompt(api, sessionID, text) {
	api.client.session.promptAsync({
		sessionID,
		parts: [{ type: "text", text }],
	});
}

export async function tui(api) {
	api.command.register(() => [
		{
			title: "Configure OpenCode Preflight",
			value: "preflight-config",
			description: "Create or repair .opencode/preflight config files",
			category: "Preflight",
			slash: { name: "preflight-config" },
			onSelect: () => {
				const sessionID = requireSession(api, "preflight-config");
				if (!sessionID) return;

				sendPrompt(
					api,
					sessionID,
					"Call the preflight_config tool to create or repair this project's OpenCode preflight configuration. If files already exist, do not overwrite them unless I explicitly confirm. After finishing, briefly list the created and skipped files.",
				);
			},
		},
		{
			title: "List Preflight Actions",
			value: "preflight-action-list",
			description: "List configured preflight actions and their current status",
			category: "Preflight",
			slash: { name: "preflight-action-list" },
			onSelect: () => {
				const sessionID = requireSession(api, "preflight-action-list");
				if (!sessionID) return;

				const result = listPreflightActions(api.cwd ?? process.cwd());
				const lines = [
					"Review the configured OpenCode preflight actions below.",
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

				lines.push(
					"",
					"Ask me which action to run next using AskUserQuestion/question. Include a `Do not run anything for now` option. If I choose an action, tell me to run `/preflight-action-run <action-id>` or continue only after I confirm.",
				);

				sendPrompt(api, sessionID, lines.join("\n"));
			},
		},
		{
			title: "Run Preflight Action",
			value: "preflight-action-run",
			description: "Choose and run a configured preflight action",
			category: "Preflight",
			slash: { name: "preflight-action-run" },
			onSelect: () => {
				const sessionID = requireSession(api, "preflight-action-run");
				if (!sessionID) return;

				const result = listPreflightActions(api.cwd ?? process.cwd());
				const ids = result.actions.map((action) => action.id).join(", ") || "(none)";
				sendPrompt(
					api,
					sessionID,
					[
						"Ask me which OpenCode preflight action id to run using AskUserQuestion/question.",
						"",
						`Available action ids: ${ids}`,
						"",
						"After I choose an action id, read `.opencode/preflight.jsonc`, load that action's `promptFile` and memory settings, then follow the action instructions. Do not run commands or edit files before I confirm if the action mode is `ask-before-execute`.",
					].join("\n"),
				);
			},
		},
	]);
}

export default { tui };
