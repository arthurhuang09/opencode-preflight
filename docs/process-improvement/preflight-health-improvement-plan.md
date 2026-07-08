# Preflight Health Improvement Plan

Rules for keeping this plugin safe to change. Each section states: purpose, when to use it,
inputs, outputs, done-criteria, common mistakes, and a minimal example.
Labels: **現況** = how the code behaves today (verified), **規則** = rule to follow for all
future changes, **建議** = improvement not yet implemented, **需要人類確認** = maintainer decision needed.

## 1. Plugin lifecycle and event handling

- **Purpose**: keep the OpenCode host stable no matter what this plugin does.
- **When**: any edit to `src/index.js`.
- **Inputs**: architecture map §2–§3; diagnosis S1–S3; installed `@opencode-ai/plugin` types.
- **Rules**:
  1. Every hook handler (`event`, `experimental.chat.system.transform`, tool `execute`) must be exception-safe end to end. If it can throw on user config, wrap it and log via `client.app.log` with `service: "opencode-preflight"`.
  2. All host interactions must degrade to no-ops: missing `client._client` → no injection; failed `tui.publish` → ignore; failed `app.log` → ignore.
  3. Keep hook bodies thin. Logic goes into exported, unit-testable functions (like `appendPreflightSystemPrompt`); hooks only wire them up.
  4. Never trust event shapes from memory. Verify against `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`, and when types and code disagree (diagnosis S3.3), capture a real runtime event before "fixing" either side.
  5. Anything on `globalThis` or module scope must be bounded (size cap or per-directory key) — plugin instances can be long-lived.
- **Done when**: `npm test` passes; no new unguarded `await client...` or `new RegExp(userInput)` outside try/catch; hook handlers contain no direct fs/git calls that can throw.
- **Common mistake**: adding an `await` inside a hook that rejects on a network hiccup and takes the whole message pipeline down with it.
- **Minimal example**: `appendPreflightSystemPrompt` wraps its `sessionIsChild` call in try/catch and proceeds on failure — copy that pattern.

## 2. Config schema, defaults, fallback, migration

- **Purpose**: user config must never be able to crash or block startup.
- **When**: adding/changing any `.opencode/preflight.jsonc` field.
- **Inputs**: field reference (architecture map §5); `src/engine.js`.
- **Rules**:
  1. Absent field = safe default = current behavior. New fields must be opt-in.
  2. Wrong-typed or unknown values → warning in the `warnings` array + the field ignored. Never throw (現況 exception: invalid `branch.pattern` — diagnosis S1; fix it, don't imitate it).
  3. Every new field lands in the same commit with: engine implementation, at least one test in `test/engine.test.js`, and a row in architecture map §5.
  4. Renaming a field requires reading both names for ≥1 minor version (現況 example: `daysOfWeek ?? days`), a warning when the legacy name is used (建議), and a migration note in the release notes.
  5. Run-state file (`run-state.json`) is versioned (`version: 1`). Changing its shape requires bumping `version` and keeping a reader for version 1.
- **Done when**: a config file containing only the new field, an empty object `{}`, and a garbage value for the new field all produce sensible results in tests.
- **Common mistake**: validating config at plugin load and refusing to start — this blocks users; validate lazily and warn instead.
- **Minimal example**: `loadActions` on a missing `promptFile` pushes a warning and continues with an empty prompt.

## 3. Startup UX: when to prompt, stay quiet, block, degrade

- **Purpose**: preflight is a butler, not a gatekeeper.
- **When**: any change to autostart, the composed prompt, or TUI commands.
- **Rules** (規則):
  1. **Never block.** The plugin must never wait on user input in the load path, never delay session readiness, never loop until confirmation. The only "ask" mechanism is a prompt inside a *separate* "Startup Preflight" session that the user can ignore.
  2. **Quiet by default.** No config → silence. No matched trigger → silence. All actions run-state-suppressed → silence. Warnings surface *inside* the preflight prompt, not as toasts/errors at startup.
  3. **Degrade, don't escalate.** Transport missing, git missing, log-scan failed → skip features silently (debug-log only). An error must never be louder than the feature it broke.
  4. Respect suppression: `OPENCODE_PREFLIGHT_AUTOSTART=0` and `-s`/`--session` launches never autostart. Child sessions (subagents) never get the preflight system prompt.
  5. Focus stealing (`tui.session.select` at +0.5/2.5/5s) is 現況 and deliberate; any change to it needs a Startup UX review (`templates/preflight/startup-ux-review-checklist.md`) and a maintainer decision (**需要人類確認**), because opinions differ on whether it is helpful or rude.
  6. `ask-before-execute` semantics are enforced by prompt text only (the model is asked to confirm). Do not describe it anywhere as a hard security boundary.
- **Done when**: with no `.opencode/preflight.jsonc`, a user sees exactly nothing from this plugin.
- **Common mistake**: turning a degraded path into a visible error ("preflight failed to start!") — that converts a silent limitation into a user-facing bug.

## 4. Timeout, retry, idempotency, crash-safety

- **現況**: no timeouts on `v2.session.*` calls; no retries; autostart double-fire is prevented by a `globalThis` set keyed by directory; `sendStartupPrompt` re-checks `sessionHasMessages` before submitting; run-state writes are last-writer-wins full-file writes; corrupt run-state/memory JSON is discarded/warned, never fatal.
- **Rules** (規則):
  1. Idempotency first, retry second: before adding any retry, ensure the retried call is guarded the way `sendStartupPrompt` is (check state, then act).
  2. Any new external call in the startup path needs a failure story written in the PR description: what happens when it hangs (**needs a timeout or must be fire-and-forget**), fails, or double-fires.
  3. File writes stay small, whole-file, and under `.opencode/preflight/`. No partial/append writes; no writes outside the project.
  4. Never retry `session.create` — a retry after a slow success creates duplicate preflight sessions.
- **建議**: add an `AbortSignal.timeout(...)`-style guard to `session.create`/`promptAsync` if the SDK supports it — verify in installed types first; if unsupported, note it and move on.
- **Done when**: killing OpenCode at any point leaves `.opencode/preflight/` parseable or safely-discardable.
- **Common mistake**: adding a retry loop with sleeps in the plugin-load path — this delays startup for everyone to fix a rare failure.

## 5. Environment differences (CLI / TUI / headless / CI / Desktop)

- **現況**: see architecture map §4. TUI is the only verified environment. Windows paths, Desktop app, and `opencode run`-style headless invocations are **unverified**.
- **Rules** (規則):
  1. Environment-specific behavior must be feature-detected (does `client.tui` exist? does the log dir exist?), never inferred from platform alone.
  2. Docs may only claim behavior for environments someone has actually exercised. Everything else is written as "unverified" — see honesty rules in the rubrics doc.
  3. Commit/PR CI runs only the per-file syntax lint — **no tests run on PRs**; `npm test` runs only on `v*` release tags. Always run `npm test` locally. CI can never exercise OpenCode itself, so lifecycle changes additionally need the manual smoke check (testing baseline §5) before release.
- **Common mistake**: "fixing" the POSIX log path for Windows without a Windows machine to verify — record it as a known limitation instead.

## 6. Security and privacy

- **Rules** (規則):
  1. Never log config contents, prompt file contents, or memory records via `app.log` — ids and counts only. (現況 compliant: logs carry session ids and arg lists; keep it that way. Note argv *is* logged at debug level — if OpenCode ever passes secrets in argv that would leak; keep argv logging debug-only.)
  2. Generated files must contain no user-specific data. `src/configure.js` templates are static — keep them static.
  3. `run-state.json` and `memory.json` live in the user's project; recommending users commit or ignore them is a per-project choice, but this repo's docs must warn that memory records may contain sensitive project notes (`SECURITY.md` scope already covers this).
  4. Never add telemetry or network calls beyond the OpenCode SDK client.
  5. This repo itself: no personal paths, tokens, or `~/.local/share` contents in fixtures or docs (use placeholders).
- **Done when**: `git diff` for your change contains no absolute home paths, hostnames, or tokens; nothing new is logged above debug level containing user content.

## 7. Testing strategy and compatibility matrix

See `docs/process-improvement/testing-and-verification-baseline.md` for the concrete commands
and the per-change-type matrix. Summary rule (規則): engine changes → engine tests; lifecycle
changes → exported-function unit tests **plus** the manual smoke procedure; dependency bumps →
full suite plus SDK-surface re-verification (diagnosis S3 checklist).

Compatibility dimensions to consider for any lifecycle change:
`@opencode-ai/plugin` version (pinned 1.14.51 / peer `>=1.14.0`), OpenCode launch mode
(TUI / `-s` / headless), platform (macOS/Linux verified; Windows unverified), git present vs absent,
project with vs without `.opencode/preflight.jsonc`.

## 8. Release checklist and rollback / disable protocol

- **Release (現況 mechanics)**: bump `package.json` version → commit → tag `v<version>` → push tag. CI verifies tag==version, runs `npm test` + `npm run build`, then `npm publish --access public`. Note: the workflow grants `id-token: write` but does **not** pass `--provenance` — whether provenance is intended is **需要人類確認** (fix the workflow or drop the permission).
- **Rules** (規則) — before pushing a tag:
  1. `npm test`, `npm run lint`, `npm run build` green locally.
  2. Manual smoke procedure (testing baseline §5) if anything under `src/index.js`/`src/tui.js` changed since the last release.
  3. README.md / README.zh-TW.md / `PREFLIGHT_COMMANDS` sync verified if commands changed.
  4. Migration note written if any default or config semantic changed.
  5. Fill `templates/preflight/release-readiness-checklist.md`.
- **Rollback protocol** (users install `"latest"` — diagnosis T3, so a bad release propagates fast):
  1. Immediate mitigation to tell affected users: set `OPENCODE_PREFLIGHT_AUTOSTART=0` (kills autostart) or set `"enabled": false` in `.opencode/preflight.jsonc` (kills everything), or delete `.opencode/plugins/preflight.js` (kills the plugin).
  2. Repoint the dist-tag: `npm dist-tag add @arthurhuang09/opencode-preflight@<last-good> latest`. This is faster and safer than `npm unpublish` (which has 72h/24h policy constraints).
  3. Publish a fixed patch version; verify `npm view @arthurhuang09/opencode-preflight dist-tags`.
  4. Post-mortem lesson filed per `process-maintenance-protocol.md` §2 (i.e. an entry in `docs/process-improvement/lessons.md`, plus fixing the doc that was wrong).
- **需要人類確認**: whether generated `.opencode/package.json` should pin `"^x.y.z"` instead of `"latest"` (changes update UX for all users; decide before 0.2.0).
- **Common mistake**: tagging before the version bump commit is on the tag — CI will fail the tag==version check; re-tagging the same version after a failed publish is messy, prefer a new patch version.
