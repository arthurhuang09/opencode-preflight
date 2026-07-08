# Preflight Maintenance Templates

Copy the relevant template into your PR description, issue, or handoff message and fill it in.
A field left as "TODO" is a signal the work is not ready. Each field states its pass criterion —
if you cannot meet it, write *why* instead of deleting the field.

| Template | Use when |
|---|---|
| `plugin-behavior-change-request.md` | proposing any change to what the plugin does at runtime |
| `config-option-proposal.md` | adding/renaming/removing a `.opencode/preflight.jsonc` field |
| `startup-ux-review-checklist.md` | any change to prompting, focus, or autostart behavior |
| `compatibility-matrix-checklist.md` | lifecycle changes or `@opencode-ai/*` dependency bumps |
| `release-readiness-checklist.md` | before pushing a `v*` tag |
| `bug-investigation.md` | investigating a startup/preflight bug report |
| `regression-test-checklist.md` | verifying a fix didn't break adjacent behavior |
| `agent-handoff.md` | ending a session with unfinished work |
