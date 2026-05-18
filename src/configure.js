import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_ACTION_IDS = ["issue-review", "project-readiness", "task-progress-review"];

const ACTION_DEFINITIONS = {
	"issue-review": {
		label: "Review issue status",
		mode: "ask-before-execute",
		promptFile: ".opencode/preflight/actions/issue-review.md",
		memory: {
			read: ["project-issues"],
			write: ["project-issues"],
			updateInstructionFile: ".opencode/preflight/actions/issue-memory.md",
		},
	},
	"project-readiness": {
		label: "Check project startup readiness",
		mode: "ask-before-execute",
		promptFile: ".opencode/preflight/actions/project-readiness.md",
	},
	"task-progress-review": {
		label: "Summarize current task progress",
		mode: "auto-summarize-then-ask",
		promptFile: ".opencode/preflight/actions/task-progress-review.md",
	},
};

const ACTION_FILES = {
	"issue-review": {
		".opencode/preflight/actions/issue-review.md": `Review the current issue-related status. First perform read-only checks and report:

- Items waiting for the user to reply
- Items waiting for someone else to reply
- Items that can be closed
- Items that need attention today

Do not modify files or run destructive operations before the user confirms.
`,
		".opencode/preflight/actions/issue-memory.md": `After completing the issue status review, update the \`project-issues\` topic if the user confirms the memory update:

- Keep records that are still valid.
- Remove records that are resolved or closed.
- Update \`lastSeenAt\` and \`notes\` for items waiting on replies.
`,
	},
	"project-readiness": {
		".opencode/preflight/actions/project-readiness.md": `Check project startup readiness. First report what you plan to inspect, then wait for the user to choose before executing.

Suggested checks:

- Whether the worktree is clean
- Whether dependencies need to be installed
- Whether test or build commands are known
- Whether README or AGENTS contains startup notes
`,
	},
	"task-progress-review": {
		".opencode/preflight/actions/task-progress-review.md": `Summarize the current branch task progress using read-only checks:

- Recent commits
- Worktree change summary
- Possible next steps

After summarizing, ask the user whether to continue with one of the next steps.
`,
	},
};

const MEMORY_FILE = `{
  "version": 1,
  "updatedAt": "1970-01-01T00:00:00.000Z",
  "topics": {
    "project-issues": {
      "updatedAt": "1970-01-01T00:00:00.000Z",
      "records": []
    }
  }
}
`;

function normalizeActionIds(actionIds) {
	const requested = Array.isArray(actionIds) && actionIds.length > 0 ? actionIds : DEFAULT_ACTION_IDS;
	return [...new Set(requested)].filter((actionId) => DEFAULT_ACTION_IDS.includes(actionId));
}

function buildPreflightConfig(actionIds) {
	const selected = normalizeActionIds(actionIds);
	const defaultBranchActions = selected.filter((actionId) => ["issue-review", "project-readiness"].includes(actionId));
	const featureBranchActions = selected.filter((actionId) => actionId === "task-progress-review");
	const triggers = [];

	if (defaultBranchActions.length > 0) {
		triggers.push({
			id: "default-branch",
			label: "Default branch preflight",
			when: { git: { insideWorkTree: true, branch: { matchesDefault: true } } },
			actions: defaultBranchActions,
		});
	}

	if (featureBranchActions.length > 0) {
		triggers.push({
			id: "feature-branch",
			label: "Feature branch preflight",
			when: { git: { insideWorkTree: true, branch: { matchesDefault: false } } },
			actions: featureBranchActions,
		});
	}

	const config = {
		enabled: true,
		language: "zh-TW",
		defaultBranches: ["main", "master"],
		triggers,
		actions: Object.fromEntries(selected.map((actionId) => [actionId, ACTION_DEFINITIONS[actionId]])),
	};

	if (selected.includes("issue-review")) {
		config.memoryStores = {
			default: { type: "json-file", path: ".opencode/preflight/memory.json" },
		};
		config.memoryTopics = {
			"project-issues": {
				store: "default",
				description: "Tracks pending replies and follow-up status for project issues.",
			},
		};
	}

	return `${JSON.stringify(config, null, 2)}\n`;
}

function defaultFiles(actionIds) {
	const selected = normalizeActionIds(actionIds);
	const files = { ".opencode/preflight.jsonc": buildPreflightConfig(selected) };

	for (const actionId of selected) {
		Object.assign(files, ACTION_FILES[actionId]);
	}

	if (selected.includes("issue-review")) {
		files[".opencode/preflight/memory.json"] = MEMORY_FILE;
	}

	return files;
}

export function configurePreflight(cwd, options = {}) {
	const force = options.force === true;
	const created = [];
	const skipped = [];

	for (const [relativePath, content] of Object.entries(defaultFiles(options.actions))) {
		const filePath = path.join(cwd, relativePath);
		if (existsSync(filePath) && !force) {
			skipped.push(relativePath);
			continue;
		}

		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content, "utf8");
		created.push(relativePath);
	}

	return { created, skipped };
}
