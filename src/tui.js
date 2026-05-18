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

function inactiveActionMessage(result) {
	if (result.inactiveReason === "missing-config") {
		return "OpenCode preflight is not configured in this project. Run /preflight-config first.";
	}
	if (result.inactiveReason === "invalid-config") {
		return "OpenCode preflight configuration could not be parsed. Fix the warnings before running actions.";
	}
	if (result.inactiveReason === "disabled") {
		return "OpenCode preflight is disabled in this project. Enable it in .opencode/preflight.jsonc before running actions.";
	}
	return "No OpenCode preflight actions are configured in this project.";
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
					"List the configured OpenCode preflight actions. This is status-only; do not ask what to run.",
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

				lines.push("", "Do not run an action or ask me to choose one from this list command.");

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
				const availableActions = result.actions.filter((action) => action.available);
				const warnings = result.warnings.length > 0
					? ["", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`)]
					: [];

				if (!result.active) {
					sendPrompt(
						api,
						sessionID,
						[
							inactiveActionMessage(result),
							"",
							"Do not ask me to choose an action.",
							...warnings,
						].join("\n"),
					);
					return;
				}

				if (availableActions.length === 0) {
					sendPrompt(
						api,
						sessionID,
						[
							"No OpenCode preflight actions are currently available to run.",
							"",
							"Do not ask me to choose an action. Explain that actions may be suppressed by run state or unavailable because of configuration warnings.",
							...warnings,
						].join("\n"),
					);
					return;
				}

				const ids = availableActions.map((action) => action.id).join(", ");
				sendPrompt(
					api,
					sessionID,
					[
						"Ask which OpenCode preflight action id to run.",
						"",
						`Available action ids: ${ids}`,
						...warnings,
						"",
						"Use AskUserQuestion/question. After I choose, call the preflight_action_prompt tool with that action id, then follow the returned prompt. For ask-before-execute actions, confirm before commands or edits.",
					].join("\n"),
				);
			},
		},
	]);
}

export default { tui };
