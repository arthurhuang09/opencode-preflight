import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_FILES = {
	".opencode/preflight.jsonc": `{
  "enabled": true,
  "language": "zh-TW",
  "defaultBranches": ["main", "master"],
  "triggers": [
    {
      "id": "default-branch",
      "label": "Default branch preflight",
      "when": {
        "git": {
          "insideWorkTree": true,
          "branch": { "matchesDefault": true }
        }
      },
      "actions": ["issue-review", "project-readiness"]
    },
    {
      "id": "feature-branch",
      "label": "Feature branch preflight",
      "when": {
        "git": {
          "insideWorkTree": true,
          "branch": { "matchesDefault": false }
        }
      },
      "actions": ["task-progress-review"]
    }
  ],
  "actions": {
    "issue-review": {
      "label": "Review issue status",
      "mode": "ask-before-execute",
      "promptFile": ".opencode/preflight/actions/issue-review.md",
      "memory": {
        "read": ["project-issues"],
        "write": ["project-issues"],
        "updateInstructionFile": ".opencode/preflight/actions/issue-memory.md"
      }
    },
    "project-readiness": {
      "label": "Check project startup readiness",
      "mode": "ask-before-execute",
      "promptFile": ".opencode/preflight/actions/project-readiness.md"
    },
    "task-progress-review": {
      "label": "Summarize current task progress",
      "mode": "auto-summarize-then-ask",
      "promptFile": ".opencode/preflight/actions/task-progress-review.md"
    }
  },
  "memoryStores": {
    "default": {
      "type": "json-file",
      "path": ".opencode/preflight/memory.json"
    }
  },
  "memoryTopics": {
    "project-issues": {
      "store": "default",
      "description": "Tracks pending replies and follow-up status for project issues."
    }
  }
}
`,
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
	".opencode/preflight/actions/project-readiness.md": `Check project startup readiness. First report what you plan to inspect, then wait for the user to choose before executing.

Suggested checks:

- Whether the worktree is clean
- Whether dependencies need to be installed
- Whether test or build commands are known
- Whether README or AGENTS contains startup notes
`,
	".opencode/preflight/actions/task-progress-review.md": `Summarize the current branch task progress using read-only checks:

- Recent commits
- Worktree change summary
- Possible next steps

After summarizing, ask the user whether to continue with one of the next steps.
`,
	".opencode/preflight/memory.json": `{
  "version": 1,
  "updatedAt": "1970-01-01T00:00:00.000Z",
  "topics": {
    "project-issues": {
      "updatedAt": "1970-01-01T00:00:00.000Z",
      "records": []
    }
  }
}
`,
};

export function configurePreflight(cwd, options = {}) {
	const force = options.force === true;
	const created = [];
	const skipped = [];

	for (const [relativePath, content] of Object.entries(DEFAULT_FILES)) {
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
