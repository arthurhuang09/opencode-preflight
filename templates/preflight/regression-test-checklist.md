# Regression Test Checklist

Run after any fix, before requesting review. Check = ran and passed (name the command),
not "should still work".

## Always
- [ ] `npm test` — all tests green; paste the current count and compare against the last known-green run (never fewer passing, and zero fail/cancelled)
- [ ] `npm run lint`
- [ ] Smoke test (testing baseline §2): plugin loads, hooks present, bare `node src/cli.js` prints usage with exit 0

## If the fix touched `src/engine.js`
- [ ] Missing config still → `active:false`, no throw
- [ ] Unparseable config still → warning, no throw
- [ ] Branch trigger still no-match outside a git worktree
- [ ] `{ recordRunState: false }` still prevents run-state writes
- [ ] Warnings for: undefined action id, missing prompt file, missing memory topic — still emitted

## If the fix touched `src/index.js`
- [ ] Suppression: `OPENCODE_PREFLIGHT_AUTOSTART=0`, `-s`, `--session=` (unit or manual — say which)
- [ ] Child-session skip (`appendPreflightSystemPrompt` test still passes)
- [ ] Plugin load with `client: undefined` exits cleanly (no hang, no throw)
- [ ] Manual OpenCode smoke (baseline §5) or explicit not-run note with reason

## If the fix touched `src/init.js` / `src/configure.js` / `src/cli.js`
- [ ] `node --test test/init.test.js`
- [ ] Existing user files not overwritten without `--force` (covered by tests — confirm they ran)
- [ ] README ×2 still match generated output

## Evidence
<!-- Paste the final `npm test` summary lines (tests/pass/fail counts). -->
