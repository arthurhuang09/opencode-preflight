# Repository Instructions

## Commands
- Install with `npm install`; keep `package-lock.json` in sync when dependency versions change.
- Run the full test suite with `npm test` (`node --test`).
- Run a focused test file with `node --test test/engine.test.js`.
- `npm run lint` and `npm run typecheck` both use `node --check src/*.js test/*.js`; this is syntax checking, not ESLint or TypeScript.
- `npm run build` is `npm pack --dry-run` to verify published package contents.
- GitHub Actions run `lint` and `typecheck` on commits/PRs; `v*` tag pushes run `test`, `build`, then `npm publish --access public --provenance`.

## Project Shape
- This is an ESM Node package (`"type": "module"`) for an OpenCode startup preflight plugin.
- Public package entrypoint is `src/index.js`; `./engine` export points to `src/engine.js`.
- `src/engine.js` is the pure-ish preflight engine: reads `.opencode/preflight.jsonc`, evaluates git/path/time triggers, loads action prompts and JSON-file memory, records prompted run state, and composes the startup prompt.
- `src/configure.js` owns the default generated `.opencode/preflight/*` files used by the `preflight_config` tool.
- `src/tui.js` registers the `/preflight-config` command and asks the active session to call the tool; keep TUI behavior aligned with `src/index.js` tool behavior.

## OpenCode Plugin Gotchas
- Autostart is suppressed when `OPENCODE_PREFLIGHT_AUTOSTART=0` or when OpenCode was launched with `-s`, `--session`, or `--session=...`; `src/index.js` also inspects recent OpenCode main-process logs for session args.
- Startup prompt injection uses the SDK v2 client via `client._client`; changes here should preserve the no-op behavior when the transport is unavailable.
- `buildPreflight()` records run state by default; tests that need repeatable prompts should pass `{ recordRunState: false }` or use isolated temp projects.

## Tests
- Tests use `node:test` and create temp project directories with `.opencode/preflight` fixtures; prefer adding focused engine tests in `test/engine.test.js` for trigger/action/memory behavior.
- Avoid relying on the repository's real `.git` state in tests unless the behavior under test specifically needs git context.
