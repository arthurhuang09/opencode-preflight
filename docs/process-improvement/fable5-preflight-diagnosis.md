# Preflight Repo Diagnosis (2026-07-08)

Status labels used in this document:
- **現況 (Current)**: verified against code or installed SDK types in this repo.
- **建議 (Proposed)**: a change that has not been made yet.
- **需要人類確認 (Needs human confirmation)**: cannot be verified from this repo alone.

All line numbers refer to commit `1feb761` (v0.1.3). Verify line numbers with `git log -1`
before citing them; if the file changed, search for the quoted identifier instead.

> **Update 2026-07-08 (later the same day)**: session.created handling, worktree root, and the
> bounded session set landed on `main` as `d7f387f` (`handleSessionCreatedPreflight`).
> This resolves W3's "vestigial hook" and "unbounded set" concerns and partially resolves
> S3.3 — `getSessionId` now also reads the type-correct `properties.info.id`. Remaining
> follow-up for S3.3: confirm with a real captured runtime event which fallback shape fires.

---

## 1. Top 3 risks: startup failure, user blocking, or wrong preflight firing

### S1. A malformed `preflight.jsonc` can throw inside the chat system-transform hook

- **Evidence**:
  - `src/engine.js` `matchesBranch()` — `new RegExp(condition.pattern)` throws `SyntaxError` on an invalid pattern (e.g. `"("`). Nothing catches it in `matchTriggers()` or `buildPreflight()`.
  - `src/index.js` `getPrompt()` calls `buildPreflight(directory)` with no try/catch.
  - `src/index.js` `"experimental.chat.system.transform"` calls `appendPreflightSystemPrompt()`, which calls `getPrompt()` (line ~146) with no try/catch.
  - By contrast, config *parse* errors are handled (`loadConfig()` returns warnings), so only *semantic* errors (bad regex, and any future field that throws) escape.
- **Risk**: a single typo in a project's `.opencode/preflight.jsonc` regex makes `getPrompt()` throw on every chat turn. How OpenCode handles a throwing plugin hook is **需要人類確認** (it may log and continue, or it may fail the message). Either way the plugin loses its "never break the host" guarantee.
- **Minimal fix**: wrap the `buildPreflight()` call in `getPrompt()` in try/catch; on error, cache `""`, log via `logDebug`, never rethrow. (~5 lines, no behavior change for valid configs.)
- **Ideal fix**: validate `branch.pattern` at trigger-match time in `src/engine.js` and convert invalid regexes into a warning (same pattern as missing prompt files), plus a characterization test.
- **Verification**: unit test — config with `branch: { pattern: "(" }` must produce `active: false` (or a warning) and must not throw. A characterization test capturing the *current* throwing behavior exists in `test/characterization.test.js` ("currently: invalid branch pattern regex throws out of buildPreflight (diagnosis S1)"); replace it when fixing.
- **Affects all future sessions**: yes — this is the main "user blocked at startup by preflight" scenario.

### S2. Passive paths write run state, silently suppressing future prompts

- **Evidence**:
  - `src/index.js` `getPrompt()` → `buildPreflight(directory)` uses the default `recordRunState: true` (`src/engine.js` `buildPreflight()`, `options.recordRunState !== false`).
  - `getPrompt()` is called from **both** the autostart path and the `experimental.chat.system.transform` hook. The transform path runs even when `OPENCODE_PREFLIGHT_AUTOSTART=0` or when autostart was suppressed by `-s`/`--session`.
- **Risk**: opening any session records `promptedAt` for matched actions even though the user never saw an autostart preflight session. Combined with `runState.skipIfLastRunWithinHours`, the *real* prompt is then skipped for N hours. Users experience "preflight randomly doesn't show up".
- **Minimal fix**: none that is purely additive — the same cached prompt serves both paths. Decide explicitly: either (a) record run state only when `sendStartupPrompt()` actually submits, or (b) document that "prompted" means "prompt was composed", not "user saw it".
- **Ideal fix**: move `recordPromptedActions()` out of `buildPreflight()` into the caller that actually delivers the prompt (autostart success path), keeping `buildPreflight()` pure. This is a behavior change: needs a characterization test first, a migration note, and a minor-version bump.
- **Verification**: test — with autostart disabled, calling the system-transform path twice must not flip `available` from `true` to `false` for a `skipIfLastRunWithinHours` action. Current behavior is pinned in `test/characterization.test.js` ("currently: passive buildPreflight records promptedAt run state (diagnosis S2)").
- **Affects all future sessions**: yes — this is the top "preflight quietly stops working" report generator.

### S3. Environment detection relies on three undocumented/fragile surfaces

- **Evidence** (all in `src/index.js`):
  1. `makeV2Client()` uses `client._client` — a private, underscore-prefixed property of the SDK v1 client. Not part of any documented contract.
  2. `latestOpenCodeMainLaunchArgs()` parses the first line of files in `~/.local/share/opencode/log`, matching `process_role=main` and `args=[...]`. Log format, location, and rotation are undocumented; the path is POSIX-specific (Windows behavior unknown).
  3. `getSessionId()` reads `event.properties.sessionID` / `event.data.sessionID`, but the installed SDK type (`@opencode-ai/sdk` 1.14.51, `dist/gen/types.gen.d.ts`, `EventSessionCreated`) declares `properties: { info: Session }` — the id would be at `event.properties.info.id`. Whether the runtime bus delivers a different shape (the code also matches `event.name === "session.created.1"`) is **需要人類確認** by logging a real event.
- **Risk**: any OpenCode upgrade can silently disable autostart, break `-s` detection (re-enabling autostart in explicit-session launches), or make session bookkeeping a no-op. Failures are invisible because every error path is `.catch(() => {})`.
- **Minimal fix**: add a debug log line for each detection result (already partially present via `logDebug`); pin the tested OpenCode version range in README; add the verification script from the testing baseline doc.
- **Ideal fix**: ask upstream for a supported way to (a) get the v2 transport and (b) know whether the launch was `-s`; encode SDK-shape assumptions in tests that read the *installed* `.d.ts` types (see `docs/process-improvement/testing-and-verification-baseline.md`).
- **Verification**: after any `@opencode-ai/*` dependency bump, run the manual smoke procedure in the testing baseline doc and check the debug log for `startup argv=` and prompt-submission lines.
- **Affects all future sessions**: yes — every dependency bump must re-check these three surfaces.

---

## 2. Top 3 risks: weak models / new maintainers making wrong edits

### W1. The config schema exists only implicitly in engine code

- **Evidence**: `.opencode/preflight.jsonc` fields (`enabled`, `language`, `defaultBranches`, `triggers[].when.{git,branch,paths,time}`, `actions.*.{label,mode,promptFile,memory,runState}`, `memoryStores`, `memoryTopics`) are defined nowhere except by reading `src/engine.js`. There is no schema doc, no JSON schema, no examples directory.
- **Risk**: models invent fields (e.g. `cron`, `priority`, `blocking`) or wrong enum values; users copy hallucinated config from model output and file bugs.
- **Minimal fix**: the field-by-field reference now lives in `docs/process-improvement/preflight-architecture-map.md` §5. Keep it updated when `src/engine.js` changes.
- **Ideal fix (建議)**: ship a JSON Schema file and validate on load, emitting warnings for unknown fields.
- **Verification**: grep every field named in the reference doc against `src/engine.js`; every documented field must appear in code and vice versa.

### W2. Three hand-synced copies of the command templates

- **Evidence**: the `/preflight-*` command definitions exist in `src/init.js` (`PREFLIGHT_COMMANDS`, source of truth), `README.md` "Manual Install" section, and `README.zh-TW.md`. `src/tui.js` re-implements similar prompt text a fourth time.
- **Risk**: a model edits one copy and ships drift; users following the README get different behavior than `init` produces. `.github/copilot-instructions.md` already flags this for reviewers, but nothing enforces it.
- **Minimal fix**: AGENTS.md now names `src/init.js` as the source of truth and requires syncing all copies in one commit.
- **Ideal fix (建議)**: a test that extracts the JSON block from README.md and deep-equals it with `PREFLIGHT_COMMANDS`.
- **Verification**: `git grep -l "preflight_action_prompt"` — every hit must carry the same wording.

### W3. ~~Session/lifecycle bookkeeping looks meaningful but is partly vestigial~~ — RESOLVED by `d7f387f`

- **Was**: at `1feb761`, the `event` hook only inserted ids into an unboundedly-growing `injectedSessions` set with no other consumer, and per S3.3 the id extraction likely yielded `""`.
- **Resolved**: `d7f387f` on `main` added `handleSessionCreatedPreflight` (a real consumer), bounded the set (`MAX_TRACKED_SESSIONS`), and extended `getSessionId` with the type-correct `properties.info.id` path.
- **Remaining follow-up** (tracked under S3.3): a test feeding a *real* captured runtime event JSON, to confirm which of the three id shapes actually fires.

---

## 3. Top 3 waste generators (tokens, startup time, debug time, review time)

### T1. All failures are swallowed, so debugging requires reading source

- **Evidence**: `src/index.js` uses `.catch(() => {})` / `catch {}` in at least 6 places (autostart, log calls, tui publish, log parsing). Only some paths emit `logDebug`.
- **Waste**: every "preflight didn't start" report becomes a source-reading session instead of a log-reading session.
- **Minimal fix**: the debugging runbook in `docs/process-improvement/testing-and-verification-baseline.md` §6 lists where logs *do* exist (`service=opencode-preflight` entries) and what silence means.
- **Ideal fix (建議)**: log (debug level) in every swallowed catch, with a stable message prefix per failure site.
- **Verification**: grep `catch` in `src/index.js`; each site either logs or carries a comment saying why not.

### T2. Startup does filesystem + git + log-scan work on every plugin load

- **Evidence**: `latestOpenCodeMainLaunchArgs()` reads up to 20 log files; `createContext()` runs `git --version`, `git rev-parse`, `git branch --show-current`, `git status --short` (twice: once in `getGitContext`, once directly) synchronously with `execFileSync`.
- **Waste**: startup latency on large repos / slow filesystems; `git status` on a huge worktree is the dominant cost. No timeouts (low risk of hanging since `git status` runs no hooks, but slow is slow).
- **Minimal fix**: none needed now; documented as a known cost. Do not add more synchronous exec calls to the startup path.
- **Ideal fix (建議)**: reuse the `getGitStatus` result inside `createContext` (it is currently computed twice) — a safe two-line change; measure before optimizing further.
- **Verification**: `time node -e "import('./src/engine.js').then(m => m.buildPreflight(process.cwd(), {recordRunState:false}))"` in a large repo.

### T3. README duplication and unpinned `latest` dependency multiply review and rollback cost

- **Evidence**: W2 (three README/init copies); `src/init.js` `mergePackageJson()` writes `"@arthurhuang09/opencode-preflight": "latest"` into every user project's `.opencode/package.json`.
- **Waste/risk**: every release instantly reaches all user projects on their next `npm install` — a bad release breaks user startups with no pinning; reviewers must re-check three doc copies per change.
- **Minimal fix**: rollback procedure documented in `docs/process-improvement/preflight-health-improvement-plan.md` §8 (npm `latest` dist-tag repoint + `OPENCODE_PREFLIGHT_AUTOSTART=0` as the user-side kill switch).
- **Ideal fix (建議, needs human decision)**: pin a caret range (e.g. `"^0.1.3"`) in generated `package.json` instead of `latest`. Changes update semantics for existing users — decide before 0.2.0.
- **Verification**: `npm view @arthurhuang09/opencode-preflight dist-tags` before/after any release.

---

## 4. Cross-references

Items that affect all future sessions and are referenced by later docs:
- S1, S2 → `preflight-health-improvement-plan.md` (error-handling and run-state rules)
- S3 → `testing-and-verification-baseline.md` (dependency-bump verification), `preflight-architecture-map.md` §6 (fragile surfaces table)
- W1 → `preflight-architecture-map.md` §5 (config field reference)
- W2, T3 → AGENTS.md source-of-truth rules
- T1 → `testing-and-verification-baseline.md` §6 (debug runbook)
