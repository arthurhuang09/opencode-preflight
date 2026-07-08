# Preflight Architecture Map

Audience: any model or engineer who needs to change this plugin's behavior.
Read this before editing `src/index.js` or `src/engine.js`.
Everything marked **verified** was checked against code or installed package types at
`@opencode-ai/plugin` / `@opencode-ai/sdk` **1.14.51**. Re-verify after any dependency bump.

## 1. Tech stack and commands (verified)

- Language: plain ESM JavaScript (`"type": "module"`), no TypeScript, no build step, no formatter, no ESLint.
- Package manager: npm. Node built-in test runner (`node:test`).
- Commands (from `package.json`):
  - `npm test` → `node --test` (runs `test/*.test.js`)
  - `npm run lint` / `npm run typecheck` (alias) → `node --check` per source/test file (**syntax check only** — do not assume ESLint/tsc)
  - `npm run build` → `npm pack --dry-run` (verifies published file list only)
- Published entrypoints (`package.json` `exports`): `.` → `src/index.js`, `./engine` → `src/engine.js`, `./init` → `src/init.js`. Bin: `opencode-preflight` → `src/cli.js`.
- `src/tui.js` is **not** in `exports` but **is** published (whole `src/` is in `files`). Its `api.*` surface (route/toast/command.register) is an OpenCode TUI plugin API that is not exercised by any test here — treat as unverified.

## 2. How the plugin reaches OpenCode (verified integration points)

| Integration point | Where | Contract status |
|---|---|---|
| Plugin default export `async ({ directory, client, worktree, ... }) => Hooks` | `src/index.js` | `PluginInput` type in `@opencode-ai/plugin` — supported. Fields include: `client, project, directory, worktree, serverUrl, $, experimental_workspace` |
| `tool: { preflight_config, preflight_action_prompt, preflight_action_list }` | `src/index.js` return value | `Hooks.tool` — supported |
| `"experimental.chat.system.transform"` hook | `src/index.js` | In `Hooks` type but **experimental** — may change in any OpenCode release |
| `event` hook (`session.created`) | `src/index.js` | `Hooks.event` supported, BUT the SDK type says `EventSessionCreated.properties = { info: Session }`; the code reads `properties.sessionID` — see diagnosis S3.3 |
| v2 SDK client via `client._client` | `src/index.js` `makeV2Client()` | **Private/undocumented.** Must stay a silent no-op when absent |
| `client.tui.publish({ type: "tui.session.select" })` | `sendStartupPrompt()` | Exists in SDK v1 client; TUI-only, no-ops elsewhere |
| `client.app.log({ service: "opencode-preflight", ... })` | throughout `src/index.js` | Exists in SDK v1 client |
| Shim install: `.opencode/plugins/preflight.js` re-exports the npm package | `src/init.js` | Works around OpenCode npm-loader issues with scoped packages (per README) |

## 3. Startup control flow (verified from code)

```
OpenCode starts in a project
└─ loads .opencode/plugins/preflight.js → this plugin's default export runs
   ├─ registers tools + hooks (returned object)
   └─ setTimeout(1000ms) → autoStartFromPluginLoad()
      ├─ shouldAutoStart()?  NO → stop            [env OPENCODE_PREFLIGHT_AUTOSTART=0,
      │                                            or -s/--session in process.argv,
      │                                            or -s/--session in latest main-process log args]
      ├─ already autostarted for this root (globalThis set)? YES → stop
      ├─ getPrompt() → buildPreflight(directory)   [SIDE EFFECT: records promptedAt run state]
      │    └─ empty prompt (no config / disabled / no trigger / all suppressed)? → stop
      ├─ makeV2Client(client) unavailable? → stop (silent)
      └─ v2.session.create({title:"Startup Preflight"}) → sendStartupPrompt()
           ├─ session already has messages? → skip
           ├─ v2.session.promptAsync(startup user prompt)
           └─ tui.publish(tui.session.select) at +500/2500/5000ms  [focus steal — intentional]

Every chat turn (any session)
└─ "experimental.chat.system.transform"
   └─ appendPreflightSystemPrompt(): skip child sessions (session.get → parentID),
      then push getPrompt() into output.system   [same cached prompt; first call has
      the same run-state side effect — diagnosis S2]
```

`getPrompt()` caches per plugin instance (`cachedPrompt`), so `buildPreflight` runs at most
once per OpenCode process per project load.

Engine data flow (`src/engine.js`, all synchronous):

```
buildPreflight(cwd)
  loadConfig: read .opencode/preflight.jsonc → stripJsonComments → JSON.parse
    (missing file → inactive; parse error → inactive + warning)
  createContext: git --version / rev-parse / branch --show-current / status --short
  matchTriggers: when.git / when.branch / when.paths / when.time   [bad regex THROWS — diagnosis S1]
  collectActionIds → loadActions (reads promptFile contents; missing file → warning)
  loadRunState (.opencode/preflight/run-state.json; corrupt → fresh state)
  filterActionsByRunState (skipIfLastRunWithinHours)
  loadMemoryTopics (json-file stores; missing/corrupt → warning)
  composePrompt → markdown prompt string
  recordPromptedActions  [writes run-state.json unless {recordRunState:false}]
```

## 4. Environment differences (CLI / TUI / headless / other repos)

- **TUI launch (`opencode`)**: full flow above. `tui.session.select` retries exist because the TUI may not be ready at +1s.
- **Explicit session (`opencode -s <id>` / `--session`)**: autostart suppressed via argv sniffing *and* log-file sniffing (the plugin may run in a child process whose argv lacks the flag — that is why the log scan exists). Log scan is POSIX-path-based (`~/.local/share/opencode/log`); behavior on Windows: **unknown, needs verification**.
- **`OPENCODE_PREFLIGHT_AUTOSTART=0`**: disables autostart only. Tools, `/preflight-*` commands, and the system-prompt injection stay active. This is the documented user kill switch.
- **Non-TUI / headless / CI**: not explicitly handled. Autostart still creates a session if a transport exists; `tui.publish` silently no-ops. Whether `opencode run`-style invocations trigger autostart is **unknown, needs runtime verification** — do not claim either way in docs.
- **Desktop app**: never tested here. **需要人類確認.** Do not write Desktop-specific behavior claims.
- **Per-project isolation**: config, run state, and memory are all project-local under `.opencode/`. The autostart dedupe set is keyed by directory on `globalThis`, so one OpenCode process serving multiple projects autostarts each at most once.

## 5. Config reference — `.opencode/preflight.jsonc` (verified against src/engine.js)

Comments (`//`, `/* */`) are stripped with a regex (`stripJsonComments`). Known limitation:
comment-like sequences *inside string values* can be corrupted (a `//` preceded by `:` is safe,
so URLs survive; `"a//b"` does not). Keep string values free of `//` and `/*`.

| Field | Type / values | Default | Behavior when absent/wrong |
|---|---|---|---|
| `enabled` | boolean | `true` (absent = enabled) | `false` → everything inactive |
| `language` | string | `"en"` | only echoed into the prompt header |
| `defaultBranches` | string[] | `["main","master"]` | used by `branch.matchesDefault` |
| `triggers[]` | array | `[]` | no triggers → autostart never fires (tools still work) |
| `triggers[].id`, `.label` | string | — | label falls back to id |
| `triggers[].when.git` | `{available?, insideWorkTree?, dirty?: boolean, branch?}` | match-all | `dirty` also requires `insideWorkTree` |
| `triggers[].when.branch` | `{matchesDefault?: boolean, pattern?: regex-string}` | match-all | never matches outside a git worktree; **invalid `pattern` currently throws** (diagnosis S1) |
| `triggers[].when.paths` | `{exists?: string[], missing?: string[]}` | match-all | paths relative to project root |
| `triggers[].when.time` | `{after?: "HH:MM", before?: "HH:MM", daysOfWeek?/days?: string[], timezone?}` | match-all | day names compared on first 3 lowercase letters; unparseable clock value = condition ignored |
| `triggers[].actions` | string[] (action ids) | `[]` | undefined ids → warning, skipped |
| `actions.<id>.label` | string | id | display only |
| `actions.<id>.mode` | `"ask-before-execute"` \| `"auto-summarize-then-ask"` | `"ask-before-execute"` | free text — engine does not validate; the prompt instructions only special-case these two |
| `actions.<id>.promptFile` | path | — | missing file → warning, empty prompt |
| `actions.<id>.memory.read` | topic ids | `[]` | undefined topic/store/type/file → warning |
| `actions.<id>.memory.write`, `.updateInstructionFile` | informational | — | only surfaced via generated docs; engine does not execute writes |
| `actions.<id>.runState` | `{enabled: boolean, skipIfLastRunWithinHours: number, recordOn?: "prompted"\|"selected", key?}` | disabled | both `enabled:true` **and** numeric hours required for skipping |
| `memoryStores.<id>` | `{type: "json-file", path}` | — | only `json-file` supported |
| `memoryTopics.<id>` | `{store, description}` | — | records read from `<memory file>.topics.<id>.records` |

Run-state file: `.opencode/preflight/run-state.json` — `{version, updatedAt, actions: {<key>: {promptedAt?, selectedAt?}}}`. Machine-written; corrupt content is silently replaced. **Recommend users gitignore it** (it is mutable local state).

## 6. Source of truth vs generated vs fragile

| File | Role |
|---|---|
| `src/engine.js` | Source of truth for config semantics and prompt composition. Pure-ish: only touches fs/git under the given `cwd` |
| `src/index.js` | Source of truth for OpenCode lifecycle integration. Contains all fragile surfaces (see table in §2) |
| `src/configure.js` | Source of truth for generated `.opencode/preflight*` default files |
| `src/init.js` | Source of truth for install artifacts **including the `/preflight-*` command templates** (`PREFLIGHT_COMMANDS`) |
| `src/tui.js` | Parallel TUI command implementation — must stay behaviorally aligned with `src/index.js` tools; unverified API surface |
| `README.md` "Manual Install" JSON | **Copy** of `PREFLIGHT_COMMANDS` — must be synced by hand |
| `README.zh-TW.md` | **Copy** of README.md — must stay semantically aligned |
| `.opencode/preflight*` in user projects | Generated output — never edit examples of these in this repo's docs without checking `src/configure.js` |

## 7. Where to start for common tasks — and what not to touch first

- **Change trigger/action/config semantics** → read `src/engine.js` + `test/engine.test.js`, edit both, keep `buildPreflight` non-throwing for bad input. Do not touch `src/index.js`.
- **Change what the generated default files contain** → `src/configure.js` + `test/init.test.js` + README "Configure A Project" section (both languages).
- **Change install/commands** → `src/init.js` (+ sync README ×2). Do not edit only the README.
- **Change autostart/injection behavior** → read diagnosis S1–S3 first, then `src/index.js`. Check the main repo for uncommitted WIP before starting. Never make the transform hook able to throw; never remove the `OPENCODE_PREFLIGHT_AUTOSTART=0` and `-s` suppressions; never turn a silent no-op into a hard failure.
- **Do not touch first**: `src/tui.js` (unverifiable without a live TUI), anything reading `client._client`, the log-scan heuristic — these need manual verification in a real OpenCode session (see testing baseline §5).
