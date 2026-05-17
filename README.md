# opencode-preflight

Project-configurable startup preflight prompts for OpenCode.

[繁體中文](README.zh-TW.md)

This package is a local proof of concept for an OpenCode plugin that builds a startup prompt from project-local configuration. It can inspect git state, branch rules, path conditions, time windows, action prompt files, JSON-file memory, and action run state before presenting available startup actions.

## Install

Add the npm plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@arthurhuang09/opencode-preflight"]
}
```

OpenCode loads npm plugins from global config (`~/.config/opencode/opencode.json`) and project config (`opencode.json`). Npm plugins are installed automatically by OpenCode at startup.

For local development of this repository:

```sh
npm install
```

## Usage

1. Add `@arthurhuang09/opencode-preflight` to the `plugin` array in your OpenCode config.
2. Start OpenCode in the target project.
3. Run `/preflight-config` from an active session, or ask OpenCode to call the `preflight_config` tool.
4. Review the generated `.opencode/preflight.jsonc` and `.opencode/preflight/*` files.
5. Restart or open a new OpenCode session in that project.

When a configured trigger matches, the plugin creates a Startup Preflight session and asks which configured action to run. Actions marked `ask-before-execute` require user confirmation before commands or file edits.

From an active session, use `/preflight-action-list` to inspect matched triggers, configured actions, availability, and warnings. Use `/preflight-action-run` to choose one currently available action; actions suppressed by run state are not offered as runnable options.

Set `OPENCODE_PREFLIGHT_AUTOSTART=0` to disable automatic startup sessions while keeping the tool and system prompt integration available.

## Usage Scenarios

- Default branch startup: when OpenCode starts on `main` or `master`, ask whether to review issues, check project readiness, or skip for now.
- Feature branch resume: when OpenCode starts on a non-default branch, summarize recent commits, worktree changes, and likely next steps before asking what to continue.
- Daily or hourly routines: use time triggers to show recurring actions such as standup prep, issue triage, or dependency checks only during a configured time window.
- Project-specific readiness: require files such as `package.json`, `AGENTS.md`, or deployment config to exist before offering a startup checklist.
- Memory-backed follow-up: load JSON-file memory topics so repeated issue reviews can remember items waiting on user replies, external replies, or closure.
- Noise reduction: use `runState.skipIfLastRunWithinHours` so routine prompts do not appear again too soon after they were already shown.

## Commands

```sh
npm run lint
npm run typecheck
npm test
npm run build
node --test test/engine.test.js
```

`lint` and `typecheck` use `node --check` for JavaScript syntax checks. `build` runs `npm pack --dry-run` to verify package contents. There is no configured formatter.

## Package Entrypoints

- `src/index.js` is the default OpenCode plugin entrypoint.
- `src/engine.js` is exported as `opencode-preflight/engine` for the preflight engine.
- `src/tui.js` registers the `/preflight-config`, `/preflight-action-list`, and `/preflight-action-run` TUI commands.

## How It Works

The engine reads `.opencode/preflight.jsonc` from the active project. When a trigger matches, it loads the configured actions, action prompt files, and memory topics, then composes an OpenCode startup prompt.

Supported trigger inputs include:

- git availability, worktree status, dirty state, and branch rules
- required or missing project paths
- day and time windows with optional timezone

Supported action inputs include:

- `promptFile` content
- `memory.read` topics backed by JSON files
- `runState` rules that can skip recently prompted actions

## Configure A Project

Use the plugin tool `preflight_config` or the `/preflight-config` command to create the default project-local files:

```text
.opencode/preflight.jsonc
.opencode/preflight/actions/issue-review.md
.opencode/preflight/actions/issue-memory.md
.opencode/preflight/actions/project-readiness.md
.opencode/preflight/actions/task-progress-review.md
.opencode/preflight/memory.json
```

The tool does not overwrite existing files unless `force: true` is passed.

## TUI Commands

- `/preflight-config` creates or repairs project-local preflight configuration files.
- `/preflight-action-list` lists matched triggers, configured actions, run-state availability, and warnings.
- `/preflight-action-run` asks which currently available action to run. If no action is available, it explains why and does not ask for an impossible choice.

## Autostart Behavior

Autostart is skipped when `OPENCODE_PREFLIGHT_AUTOSTART=0` is set, or when OpenCode was launched with `-s`, `--session`, or `--session=...`.

Startup prompt injection uses the OpenCode SDK v2 transport exposed as `client._client`; if that transport is unavailable, injection is a no-op.

## Tests

Tests use `node:test` and create isolated temporary projects with `.opencode/preflight` fixtures. `buildPreflight()` records run state by default, so tests that need repeatable prompts should pass `{ recordRunState: false }` or use a fresh temp project.
