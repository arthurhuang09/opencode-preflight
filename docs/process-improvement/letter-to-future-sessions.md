# Letter to Future Sessions

Written 2026-07-08 by the session that created `docs/process-improvement/`. Baseline:
commit `1feb761` (v0.1.3, 21 tests) plus this branch's docs and characterization tests.
SDK/plugin 1.14.51. Test counts grow over time — run `npm test` for the current number
and compare against the last known-green run, never against numbers written in docs.

## Three things nobody asked me, but matter most for this repo

1. **The real product is "never annoy, never break".** This plugin's entire value proposition
   collapses the first time it blocks a startup, steals focus at the wrong moment once too
   often, or throws into a chat turn. Feature requests will pull toward more triggers, more
   prompts, more cleverness. The correct default answer to "should preflight also…?" is no,
   unless it can be silent, optional, and non-blocking. Rubric §2 is the most important rule
   in the whole system.
2. **The riskiest 40 lines are the environment heuristics, and they will rot on a schedule.**
   `client._client`, the `~/.local/share/opencode/log` scraping, and the event-shape guesswork
   (diagnosis S3) each depend on unversioned OpenCode internals. Every OpenCode release is a
   potential silent breakage — silent because every failure path is `.catch(() => {})`. The
   long-term fix is upstream (ask for supported APIs); until then, the §7 greps in the testing
   baseline are the tripwire. Run them on every dependency bump without exception.
3. **The generated `"latest"` dependency makes every release a fleet-wide deploy.** Users'
   projects auto-install the newest version. There is no gradual rollout, no canary. Treat
   `git push --tags` with the seriousness of a production deploy: readiness checklist, rollback
   command ready (`npm dist-tag add ...@<last-good> latest`). Deciding whether to pin
   (`^0.1.3`) instead of `latest` is the single highest-value pending maintainer decision.

## How this system will most likely decay — and countermeasures

- **Docs drift from code** after a few feature PRs, agents learn the docs lie, and stop reading
  them. → Countermeasure: architecture map §5 updates are part of done (rubrics §6); the
  maintenance protocol's read-path check; version-pin greps (`git grep "1\.14\.51\|1feb761"`).
- **Checklist theater**: boxes get checked without commands being run. → Countermeasure: every
  checklist demands pasted output or "not-run: reason". Reviewers should spot-check one item per
  PR; a fabricated check is a trust incident worth a lesson entry.
- **Entropy by accretion**: each session adds a doc, none deletes. → Countermeasure: maintenance
  protocol §3 budgets and the no-new-top-level-docs rule. If you're about to create
  `docs/process-improvement/<new-thing>.md`, first prove no existing file owns that topic.
- **The characterization tests get "fixed"** by someone who sees a test named "currently: X
  throws" and deletes it as obsolete. → They pin known bugs on purpose; replace them only
  together with the behavior fix and a diagnosis update.

## If your context is nearly gone, do this in order

1. Read `AGENTS.md` (≤60 lines by budget — the router and hard rules).
2. Read `docs/process-improvement/fable5-preflight-diagnosis.md` §1 only (the three startup risks).
3. Run `npm test` to confirm your baseline before changing anything.
4. Do the single smallest valuable thing, commit it, and write a handoff
   (`templates/preflight/agent-handoff.md`).
5. Do NOT: start refactors in `src/index.js`, restructure docs, or bump dependencies at low context.

## Not finished in my session, and why

- **No code fix for S1 (invalid regex throw) or S2 (passive run-state writes).** Deliberate:
  both change behavior, and the session brief prioritized institution-building over risky code
  changes. Both are characterization-tested (`test/characterization.test.js`) and fully specified
  in the diagnosis (minimal + ideal fix + verification). Either is a good first PR for a
  Sonnet-class session using prompt template T2/T3 discipline.
- **No manual OpenCode TUI verification** (testing baseline §5): this session had no live
  OpenCode instance. All lifecycle claims come from code + installed types; TUI/Desktop/Windows
  rows in the compatibility matrix remain not-run.
- **README/PREFLIGHT_COMMANDS drift test** (diagnosis W2 ideal fix): specified but not written.
- **Landed after this branch was cut**: the session.created handling, worktree root, and
  bounded session set went into `main` as `d7f387f` (via `handleSessionCreatedPreflight`).
  Its `getSessionId` now also reads the type-correct `properties.info.id` path, which
  addresses the core of diagnosis S3.3; the remaining follow-up is confirming against a
  real captured runtime event which of the three fallback shapes actually fires, and
  re-checking W3 (the event hook now has a real consumer — it is no longer vestigial).
- **Maintainer decisions pending**: pin vs `latest` (above); whether focus-stealing
  `tui.session.select` retries should stay; whether to adopt a JSON Schema for the config.
