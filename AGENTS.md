# Repository Instructions

OpenCode startup-preflight plugin. ESM JavaScript, npm, `node:test`. No build step, no formatter, no ESLint.

## Read first, by task type

| Task | Read before editing |
|---|---|
| Any change to plugin behavior | `docs/process-improvement/preflight-architecture-map.md` |
| Known risks / why something looks broken | `docs/process-improvement/fable5-preflight-diagnosis.md` |
| Lifecycle, config, UX, error-handling, release rules | `docs/process-improvement/preflight-health-improvement-plan.md` |
| What to test for which change | `docs/process-improvement/testing-and-verification-baseline.md` |
| Judgment calls (block vs warn, small edit vs test-first, done vs not) | `docs/process-improvement/preflight-engineering-rubrics.md` |
| Delegation / model routing / ready-made prompts | `docs/process-improvement/agent-delegation-and-model-routing.md`, `prompt-templates-for-preflight-repo.md` |
| Change-request / release / review checklists | `templates/preflight/` |
| Updating any of the docs above | `docs/process-improvement/process-maintenance-protocol.md` |

## Commands

- `npm install`; keep `package-lock.json` in sync when dependency versions change.
- `npm test` (`node --test`); focused run: `node --test test/engine.test.js`.
- `npm run lint` (aliased by `npm run typecheck`) = `node --check` run per file — **syntax check only**, not ESLint or TypeScript.
- `npm run build` = `npm pack --dry-run` (verifies published contents).
- CI: commits/PRs run lint+typecheck; `v*` tags run test, build, then `npm publish` (tag must match `package.json` version).

## Source-of-truth rules

- Config semantics: `src/engine.js` (field reference: architecture map §5). Docs follow code, not the reverse.
- `/preflight-*` command templates: `src/init.js` `PREFLIGHT_COMMANDS`. README.md "Manual Install" and README.zh-TW.md are **copies** — sync all three in the same commit.
- Generated `.opencode/preflight*` defaults: `src/configure.js`. If docs describe them, verify against this file.
- If README.md changes, keep README.zh-TW.md semantically aligned (and vice versa).

## Hard rules — do not violate

1. **Never let preflight break the host.** `buildPreflight()` and every hook handler must not throw on bad user config; bad input becomes a warning or an inactive result. Missing `.opencode/preflight.jsonc` = inactive, not error. (Known exception today: invalid `branch.pattern` throws — diagnosis S1, pinned in `test/characterization.test.js`. Fix it; do not add new exceptions.)
2. **Do not invent OpenCode APIs.** Only use hooks/fields present in `node_modules/@opencode-ai/plugin/dist/index.d.ts`. If you can't find it in the installed types, say "unknown" — do not guess.
3. **Do not change startup-suppression behavior**: `OPENCODE_PREFLIGHT_AUTOSTART=0` and `-s`/`--session`/`--session=...` must keep disabling autostart. Startup injection must stay a silent no-op when `client._client` is unavailable.
4. **Never add blocking or indefinitely-waiting behavior to the default startup path.** Preflight asks; it must not gate the user's session.
5. **Do not edit `src/index.js` lifecycle code without first reading diagnosis items S1–S3** and checking `git status` in the main working tree for overlapping WIP.
6. **Branch triggers must not match outside a git worktree**; `buildPreflight` run-state writes must stay controllable via `{ recordRunState: false }`.
7. Never commit personal config, tokens, machine-local paths, or `.opencode/preflight/run-state.json`-style mutable state into this repo.

## Tests

- `node:test` with temp-dir fixture projects (see `makeProject()` in `test/engine.test.js`). Add engine behavior tests there; init/CLI tests in `test/init.test.js`.
- Don't depend on this repository's real `.git` state unless that is the behavior under test.
- `buildPreflight()` records run state by default — pass `{ recordRunState: false }` or use a fresh temp project for repeatable prompts.
- Minimum test matrix per change type: see testing baseline §4.
