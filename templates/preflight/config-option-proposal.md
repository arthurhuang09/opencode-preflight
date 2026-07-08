# Config Option Proposal

## Field
<!-- Exact path and type. Good: `actions.<id>.runState.cooldownDays: number`. Bad: "a cooldown option". -->

## Behavior when absent
<!-- Must equal current behavior (health plan §2 rule 1). State it explicitly. -->

## Behavior on wrong type / garbage value
<!-- Must be: warning + field ignored. Quote the warning text you will emit. -->

## Interaction with existing fields
<!-- e.g. "wins over skipIfLastRunWithinHours when both set" — undefined interactions become bugs. -->

## Migration
- Renames an existing field? If yes: legacy name read until version ___, warning text: ___
- Changes run-state.json shape? If yes: version bump plan: ___

## Deliverables in one commit
- [ ] engine implementation (`src/engine.js`)
- [ ] test(s) in `test/engine.test.js`: absent / valid / garbage value
- [ ] row updated in `docs/process-improvement/preflight-architecture-map.md` §5
- [ ] README(s) if user-facing
- [ ] `src/configure.js` default templates updated? yes/no/why

## Example config snippet
<!-- Paste valid JSONC a user could copy. Validate it first: write it into a temp project's
     .opencode/preflight.jsonc and run the engine one-liner from testing baseline §2 (with cwd
     set to that temp project) — it must parse warning-free. -->
