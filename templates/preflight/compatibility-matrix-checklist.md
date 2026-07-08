# Compatibility Matrix Checklist

For `src/index.js` changes and `@opencode-ai/*` dependency bumps.
Fill the Result column with: `pass` / `fail` / `not-run (reason)`. `not-run` without a reason = not done.

| Dimension | Case | How to check | Result |
|---|---|---|---|
| Launch mode | TUI autostart | testing baseline §5 steps 1–4 | |
| Launch mode | `-s <session>` suppression | baseline §5 step 6 | |
| Launch mode | `OPENCODE_PREFLIGHT_AUTOSTART=0` | baseline §5 step 5 | |
| Launch mode | headless (`opencode run` style) | **unverified territory** — record observation, don't assume | |
| Transport | `client._client` absent | testing baseline §2 smoke: plugin load with `client: undefined` exits cleanly | |
| Config | no preflight.jsonc | engine one-liner → `active:false`, no warnings | |
| Config | unparseable preflight.jsonc | engine one-liner → `active:false` + parse warning | |
| Config | valid config, matched trigger | engine one-liner → `active:true` + prompt | |
| Git | not a git repo | branch triggers must not match (existing test) | |
| Git | git binary absent | `getGitContext` returns `available:false`; hard to test locally — code-read is acceptable, say so | |
| Platform | macOS/Linux | where you ran the above | |
| Platform | Windows | **known-unverified** (log path, homedir); do not claim | |
| SDK | type-surface greps | testing baseline §7 all hit | |
| Peer range | `@opencode-ai/plugin >=1.14.0` still true? | if using newer hook/field, bump peer minimum in package.json | |

## Notes
<!-- Anything observed that contradicts docs → also file a lesson per process-maintenance-protocol.md -->
