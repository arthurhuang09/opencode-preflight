# Plugin Behavior Change Request

## What changes, observably
<!-- One sentence a user could verify. -->
<!-- Good: "Autostart no longer fires when OpenCode is launched with --print." -->
<!-- Bad: "Improve autostart robustness." (not observable, not verifiable) -->

## Why now
<!-- Link the bug report, diagnosis item (e.g. S1), or user request. "Seems cleaner" is not a reason. -->

## Which lifecycle surface is touched
<!-- Pick from architecture map §2 table. If you can't name the surface, stop and read the map. -->
- [ ] engine only (`src/engine.js`) — lowest risk
- [ ] generated files (`src/configure.js` / `src/init.js`)
- [ ] hooks / autostart / injection (`src/index.js`) — read diagnosis S1–S3 first
- [ ] TUI (`src/tui.js`) — no automated coverage; manual verification mandatory

## Default-path impact
<!-- Answer all three. Any "yes" needs a migration note and maintainer sign-off. -->
- Does any user with an existing config see different behavior without editing anything? yes/no
- Does the default path gain any blocking/waiting? yes/no (must be no — AGENTS.md hard rule 4)
- Do suppression switches (`OPENCODE_PREFLIGHT_AUTOSTART=0`, `-s`) still work? yes/no (must be yes)

## Failure story
<!-- What happens when the new code path throws / hangs / double-fires? Point to the guard. -->
<!-- Good: "session.create failure → caught at src/index.js catch block, logged, autostart skipped." -->
<!-- Bad: "It shouldn't fail." -->

## Tests
<!-- Name the test file and case names. Per testing baseline §4. Characterization test first if the area was untested. -->

## Verification beyond tests
<!-- Which steps of testing baseline §5 will be run, by whom? If none: why is that acceptable? -->
