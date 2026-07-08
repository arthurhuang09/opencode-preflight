# Prompt Templates for This Repo

Copy-paste starting points for driving a model on common tasks. Replace `<...>` slots.
Every template ends with acceptance criteria and a report format — keep those; they are what
makes the output checkable. Templates assume the agent starts in the repo root.

---

## T1. Scan the repo for plugin-lifecycle risks

```
Goal: find changes since <commit/tag> that could break OpenCode startup or violate this repo's
lifecycle rules. Background: this is an OpenCode preflight plugin; the host must never be
broken by user config or plugin errors.
Input: read AGENTS.md "Hard rules", docs/process-improvement/preflight-architecture-map.md §2–§3,
docs/process-improvement/fable5-preflight-diagnosis.md, then `git diff <commit/tag>..HEAD`.
Constraints: read-only; do not fix anything; do not speculate about OpenCode behavior not
visible in node_modules/@opencode-ai types.
Acceptance: every finding cites file:line and names the violated rule (e.g. "AGENTS.md hard
rule 1" or "diagnosis S1"); explicitly states "no findings" per rule otherwise.
Report: markdown list ordered by severity; conclusions only, no file dumps.
```

## T2. Add a config option

```
Goal: add `<field path>` to .opencode/preflight.jsonc semantics: <one-sentence behavior>.
Background: config semantics live in src/engine.js only; absent field must equal current behavior.
Input: fill templates/preflight/config-option-proposal.md FIRST and include it in your report;
architecture map §5 for existing fields; health plan §2 for the rules.
Constraints: warning-not-throw for garbage values; engine + tests + architecture-map row in one
commit; no changes to src/index.js.
Acceptance: tests for absent/valid/garbage values pass; `npm test` fully green; map §5 updated.
Report: filled proposal template + diff summary + pasted `npm test` tail.
```

## T3. Investigate a startup / preflight bug

```
Goal: find the root cause of: <verbatim symptom + environment>.
Input: templates/preflight/bug-investigation.md (fill as you go); the debug runbook in
docs/process-improvement/testing-and-verification-baseline.md §6; diagnosis doc for known issues.
Constraints: diagnose before fixing; if the cause is a fragile surface (architecture map §2),
verify against installed .d.ts types before blaming code; check the main working tree for
uncommitted WIP before proposing edits to src/index.js.
Acceptance: root cause names file:function and the wrong assumption; runbook steps 1–6 each have
a recorded result; fix classified per rubrics §1.
Report: the filled bug-investigation template.
```

## T4. Safely adjust environment-specific (TUI/CLI/headless) behavior

```
Goal: change <behavior> for <environment> without affecting other environments.
Background: only the TUI path is verified; Windows/Desktop/headless are officially unverified
(architecture map §4). Feature-detect, never platform-sniff.
Input: architecture map §2 & §4; health plan §5; templates/preflight/compatibility-matrix-checklist.md.
Constraints: suppression switches untouched; degraded = silent no-op + debug log; any behavior
claim for an environment you did not exercise must be labeled "unverified".
Acceptance: compatibility matrix filled with pass/fail/not-run(reason) for every row; unit tests
for the decision logic (injected inputs, not real environment).
Report: matrix + diff summary + which manual steps a human must still run.
```

## T5. Add characterization tests to an untested area

```
Goal: pin the CURRENT behavior of <function/area> before it gets refactored.
Background: characterization tests document what IS, including bugs — name tests
"currently <behavior>" when the behavior is known-wrong (cite the diagnosis item).
Input: test/engine.test.js `makeProject()` fixture pattern; testing baseline §3 for the gaps table.
Constraints: zero production-code changes; tests must pass against HEAD as-is; use temp dirs,
never this repo's real .git state.
Acceptance: `node --test <file>` green; each test failure message would tell a future reader
what behavior changed; the gaps table row in testing baseline §3 updated.
Report: test names + one line each on what behavior it pins.
```

## T6. Review a PR for mergeability

```
Goal: recommend merge / fix-first / reject for PR <link-or-branch>.
Input: .github/copilot-instructions.md (review priorities), rubrics §8 (quality floor),
AGENTS.md hard rules; the diff.
Constraints: fresh context — do not review your own work; check the floor mechanically (run
`npm test` yourself, grep the diff per rubrics §8 items 2–3); style-only comments are
non-blocking per copilot-instructions.
Acceptance: verdict + per-item floor results + any hard-rule violation cited by rule number;
README ×2 / PREFLIGHT_COMMANDS sync checked if commands changed.
Report: verdict first, then findings ordered blocking → optional.
```

## T7. Prepare a release readiness summary

```
Goal: determine whether HEAD is releasable as v<version>.
Input: templates/preflight/release-readiness-checklist.md (fill it);
docs/process-improvement/preflight-health-improvement-plan.md §8.
Constraints: run every Gate-1 command yourself and paste real output; do not check a box for a
manual step you didn't run — write "not-run: <reason>" and let the maintainer decide;
verify tag-version match logic locally: `node -p "require('./package.json').version"`.
Acceptance: checklist fully filled, no TODOs; a go/no-go recommendation with the single biggest
residual risk named.
Report: filled checklist + recommendation.
```

## T8. Write a user-facing migration note

```
Goal: write the migration note for <change> going into v<version>.
Audience: OpenCode users with existing .opencode/preflight.jsonc files; assume they read fast
and copy-paste config.
Input: the diff; architecture map §5 for old/new semantics.
Constraints: lead with "what breaks if you do nothing"; give exact before/after JSONC snippets
(validated via the engine one-liner in testing baseline §2 run in a temp project); include the
disable/rollback line (OPENCODE_PREFLIGHT_AUTOSTART=0 / "enabled": false); English + zh-TW if
READMEs are touched.
Acceptance: a user who does nothing knows the consequence; a user who follows the snippet ends
with a config the engine parses warning-free.
Report: the note text, ready to paste into release notes.
```
