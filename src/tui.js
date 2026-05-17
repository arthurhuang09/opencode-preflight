export async function tui(api) {
	api.command.register(() => [
		{
			title: "Configure OpenCode Preflight",
			value: "preflight-config",
			description: "Create or repair .opencode/preflight config files",
			category: "Preflight",
			slash: { name: "preflight-config" },
			onSelect: () => {
				const sessionID = api.route.current.name === "session" ? api.route.current.params.sessionID : undefined;
				if (!sessionID) {
					api.ui.toast({
						message: "Open a session first, then run /preflight-config.",
						variant: "warning",
					});
					return;
				}

				api.client.session.promptAsync({
					sessionID,
					parts: [
						{
							type: "text",
							text: "Call the preflight_config tool to create or repair this project's OpenCode preflight configuration. If files already exist, do not overwrite them unless I explicitly confirm. After finishing, briefly list the created and skipped files.",
						},
					],
				});
			},
		},
	]);
}

export default { tui };
