# Copilot Review Instructions

When reviewing pull requests in this repository, prioritize practical risks over style preferences.

## Review Priorities

- Prioritize correctness, data-loss risk, security, broken documented workflows, and behavioral regressions.
- Treat wording-only suggestions as non-blocking unless the wording would cause users to run a broken or unsafe command.
- Consolidate related documentation consistency issues into one comment instead of spreading them across multiple incremental comments.
- Avoid reopening resolved topics unless the latest diff reintroduces the same issue.
- If a comment is low confidence or speculative, label it as optional in the review body instead of creating an inline blocking thread.

## Documentation Rules

- Check `README.md` and `README.zh-TW.md` together; if one changes, verify the other stays semantically aligned.
- Prefer commands that are safe by default. Do not recommend `--trust`, force flags, or destructive commands unless the PR explicitly justifies them.
- If package metadata changes, verify `README.md`, `README.zh-TW.md`, `package.json`, and `package-lock.json` stay aligned.
- If generated preflight files are documented, verify the source defaults in `src/configure.js` match the documentation.

## OpenCode Plugin Rules

For changes involving `src/index.js`, `src/tui.js`, or OpenCode SDK/plugin behavior, review these items in one pass:

- Autostart remains disabled when `OPENCODE_PREFLIGHT_AUTOSTART=0` is set.
- Autostart remains disabled for explicit session launches using `-s`, `--session`, or `--session=...`.
- Startup prompt injection remains a no-op when the SDK v2 transport `client._client` is unavailable.
- `/preflight-config` TUI behavior stays aligned with the `preflight_config` tool behavior.

## Engine Rules

For changes involving `src/engine.js`, review these items in one pass:

- Missing `.opencode/preflight.jsonc` keeps preflight inactive instead of throwing.
- Git-dependent branch triggers do not match outside a git worktree.
- `buildPreflight()` run-state writes remain controllable with `{ recordRunState: false }` for repeatable tests.
- JSON-file memory parsing failures produce warnings instead of crashing the preflight build.

## Test Rules

- Prefer focused `node:test` coverage in `test/engine.test.js` for trigger, action, memory, and run-state behavior.
- Avoid tests that depend on this repository's real `.git` state unless the behavior under test specifically requires it.
