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
					"Call the preflight_config tool. Create missing OpenCode preflight files, do not overwrite existing files unless I confirm, then list created and skipped files.",
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
					"List the configured OpenCode preflight actions and ask what to run.",
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
					"Use AskUserQuestion/question with each action id and `Do not run anything for now`. Do not run an action until I confirm.",
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
						"Ask which OpenCode preflight action id to run.",
						"",
						`Available action ids: ${ids}`,
						"",
						"Use AskUserQuestion/question. After I choose, read `.opencode/preflight.jsonc`, load the action `promptFile` and memory, then follow the action mode. For `ask-before-execute`, confirm before commands or edits.",
					].join("\n"),
				);
			},
		},
	]);
}

export default { tui };
