# Testing and Verification Baseline

All commands verified working in this repo on 2026-07-08 (Node with `node:test`, npm).
Run everything from the repo root.

## 1. Local commands

```sh
npm install          # or: npm ci  (CI parity; requires package-lock.json in sync)
npm run lint         # node --check run per file — SYNTAX ONLY, not ESLint
npm run typecheck    # alias of lint; there is no tsc
npm test             # node --test → runs test/*.test.js (21 tests at tag v0.1.3; grows over time — compare against the last known-green run, not doc numbers)
npm run build        # npm pack --dry-run — verifies the published file list
node --test test/engine.test.js   # focused run
```

Caution: a bare `node --check a.js b.js` only checks the **first** file (verified: exit 0 with a
broken second file). The lint script loops per file for this reason — keep it that way.
Commit/PR CI runs **only** this lint; tests run in CI only on `v*` tags. Run `npm test` locally, always.

There is no formatter. Do not reformat files; match surrounding style (note: `src/index.js`
mixes tabs and spaces between functions — leave existing indentation alone).

## 2. Quick smoke test (< 30 seconds, no OpenCode needed)

```sh
node -e "import('./src/index.js').then(m => m.default({ directory: process.cwd(), client: undefined })).then(h => { if (!h.tool || !h.event) throw new Error('hooks missing'); console.log('plugin loads; hooks:', Object.keys(h).join(', ')); })"
node -e "import('./src/engine.js').then(m => console.log(JSON.stringify(m.buildPreflight(process.cwd(), { recordRunState: false }))))"
node src/cli.js && echo "cli usage exit 0: ok"; node src/cli.js not-a-command >/dev/null 2>&1 || echo "cli exits nonzero on bad command: ok"
```

Expected: first prints the hook keys including `tool` and `experimental.chat.system.transform`;
second prints `{"prompt":"","active":false,...}` in this repo (no preflight config here);
third prints usage then both ok lines. (Note: `--help` is not a supported flag — any
command other than `init` exits 1; bare `node src/cli.js` prints usage and exits 0.)
Any thrown error = smoke failure.
Note the first command schedules a 1s autostart timer with `client: undefined` — it must
exit cleanly (autostart no-ops without a transport); if the process hangs or throws, that is a real regression.

## 3. Test layers (current and recommended)

| Layer | Exists today | Where | Notes |
|---|---|---|---|
| Engine: triggers/actions/memory/run-state | ✅ good coverage | `test/engine.test.js` | temp-dir fixtures via `makeProject()` |
| Engine: malformed config (parse errors) | ✅ partial | `test/engine.test.js`, `test/characterization.test.js` | invalid-regex (S1) and passive run-state (S2) characterizations added 2026-07-08 in `test/characterization.test.js` |
| Init/CLI: generated files, merge, flags | ✅ | `test/init.test.js` | runs real `node src/cli.js` |
| Lifecycle: exported helpers (`appendPreflightSystemPrompt`, `isChildSession`) | ✅ minimal | `test/engine.test.js` | uses stub `v2` objects — extend this pattern |
| Lifecycle: autostart decision (`shouldAutoStart`, log parsing) | ❌ missing | — | needs argv/env/log-dir injection; add characterization tests before refactoring `src/index.js` |
| Config fallback/migration | ✅ implicit | engine tests | make explicit when adding fields |
| Timeout/hang behavior | ❌ none | — | no timeouts exist (health plan §4); don't test what isn't there — add the guard first |
| TUI (`src/tui.js`) behavior | ❌ none, hard | — | requires a live OpenCode TUI; manual only (§5) |
| Real OpenCode integration | ❌ not automatable here | — | manual procedure in §5 |

Rule: **before refactoring any untested area above, add a characterization test that pins
current behavior** — even if current behavior is a bug (label the test "currently ...").

## 4. Minimum tests per change type

| You changed | Must run / add |
|---|---|
| `src/engine.js` | `node --test test/engine.test.js` + a new test for the changed behavior + update architecture map §5 if config semantics changed |
| `src/configure.js` | `npm test` (init tests assert generated content) + README ×2 if documented |
| `src/init.js` / `src/cli.js` | `node --test test/init.test.js` + README ×2 sync check |
| `src/index.js` | `npm test` + smoke test (§2) + manual smoke (§5) before any release |
| `src/tui.js` | `npm run lint` + manual TUI check (§5); there is no automated coverage |
| `package.json` deps | `npm ci && npm test && npm run build` + SDK surface re-verification (§7) |
| Docs only | `npm run lint` not needed; check links/paths exist: `ls` every referenced file |

## 5. Manual verification that startup behavior is real (not just green tests)

Green unit tests do NOT prove OpenCode integration works — the fragile surfaces
(architecture map §2) are stubbed in tests. Before a release that touched `src/index.js`
or `src/tui.js`, a human (or an agent with a live OpenCode) must:

1. Make a throwaway project: `mkdir /tmp/pf-check && cd /tmp/pf-check && git init -q`.
2. Install the *candidate* build: run `node <repo>/src/cli.js init --no-install`, then in
   `.opencode/` replace the dependency with the local repo: `cd .opencode && npm install <path-to-repo>`.
3. Create config: `node -e "import('<repo>/src/configure.js').then(m => m.configurePreflight('/tmp/pf-check'))"`.
4. Launch `opencode` in `/tmp/pf-check`. Expect: within ~5s a "Startup Preflight" session
   exists and contains a preflight prompt asking which action to run (via a question tool).
5. Relaunch with `OPENCODE_PREFLIGHT_AUTOSTART=0` → expect **no** preflight session.
6. Relaunch with `opencode -s <existing-session-id>` → expect no *new* preflight session.
7. Run `/preflight-action-list` → expect a status summary, and it must NOT ask you to pick an action.
8. Check logs: newest file in `~/.local/share/opencode/log` should contain
   `service=opencode-preflight` lines (`autostart prompt submitted` on success).

If you cannot run OpenCode (CI, headless agent): **record the blockage** in the PR/handoff —
say exactly which of steps 4–8 were skipped and paste the §2 smoke output as the minimal
evidence. Do not claim manual verification you didn't do.

## 6. Debugging runbook: "preflight didn't start"

Failures are mostly silent by design (health plan §3). Check in order:

1. `OPENCODE_PREFLIGHT_AUTOSTART` env set to `0`? Launched with `-s`/`--session`?
2. Does `.opencode/preflight.jsonc` exist and parse? Run the §2 engine one-liner **in the
   user's project directory** — `active:false` with a `warnings` entry explains itself.
3. Trigger mismatch? Same one-liner shows `active:false` with no warnings → check branch
   (`git branch --show-current`) against trigger conditions; remember branch triggers never
   match outside a git worktree.
4. Run-state suppression? `cat .opencode/preflight/run-state.json` — recent `promptedAt`
   plus `skipIfLastRunWithinHours` means it's working as configured. Note diagnosis S2:
   passive paths can record `promptedAt` without the user ever seeing a prompt.
5. Transport missing? grep the newest OpenCode log for `opencode-preflight`. A `startup argv=`
   debug line but no `autostart prompt submitted` line → either suppression (step 1),
   empty prompt (steps 2–3), or `client._client` unavailable (silent no-op; diagnosis S3).
6. Nothing in logs at all → plugin not loaded: check `.opencode/plugins/preflight.js` exists
   and `.opencode/node_modules/@arthurhuang09/opencode-preflight` is installed.

## 7. Dependency-bump verification (SDK surfaces)

After bumping `@opencode-ai/plugin` or `@opencode-ai/sdk`:

```sh
grep -n '"experimental.chat.system.transform"' node_modules/@opencode-ai/plugin/dist/index.d.ts
grep -n 'worktree' node_modules/@opencode-ai/plugin/dist/index.d.ts | head -3
grep -n 'EventSessionCreated' -A 5 node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts
grep -n 'promptAsync' node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts | head -3
```

Each grep must hit. If `experimental.chat.system.transform` disappears or
`EventSessionCreated` changes shape, stop and re-read diagnosis S3 before proceeding.
`client._client` cannot be grepped from types (it's private) — only the manual smoke (§5)
verifies it still works.
