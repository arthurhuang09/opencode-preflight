# Preflight Engineering Rubrics

Executable judgment rules. Each rubric: the rule, one positive example (✅ do), one negative
example (❌ don't). When two rubrics conflict, the safer option (less user-visible change) wins.

## 1. Direct small edit vs characterization-test-first

**Rule**: You may edit directly when ALL hold: the area has existing tests (`test/*.test.js`
covers the function), the change is ≤ ~20 lines, and no fragile surface (architecture map §2)
is involved. Otherwise: write a test pinning current behavior *first*, watch it pass, then change.

- ✅ Adding a warning message in `loadActions` (tested area, engine-only): edit + extend the
  existing warnings test in the same commit.
- ❌ "Quick fix" to `latestOpenCodeMainLaunchArgs()` log parsing: zero tests exist there; a
  characterization test with fixture log files comes first, even for a one-liner.

## 2. Block the user vs degrade to warning

**Rule**: Never block. The only acceptable "louder" behaviors are: a warning line inside the
composed preflight prompt, or a debug log entry. If you're choosing between "refuse to
start / throw / wait for input" and "do less, note it in warnings", the answer is always the
second. There is no severity level at which this plugin may gate the host session.

- ✅ Invalid `branch.pattern` → trigger treated as non-matching + warning "Invalid branch
  pattern for trigger 'x': ...".
- ❌ Invalid config → throw so "the user notices and fixes it". They notice by losing their
  editor session; that converts a config typo into an outage (diagnosis S1).

## 3. Stop and ask (user / maintainer / official docs)

**Rule**: Stop and ask a human when the change (a) alters behavior for users with existing
configs, (b) touches suppression switches or blocking semantics, (c) relies on an OpenCode
behavior you cannot find in the installed `.d.ts` types or observe in a live session, or
(d) involves publishing. Consult official OpenCode docs/source before asking a human only
for (c)-type questions — API facts are checkable; product decisions are not.

- ✅ "Generated package.json uses `latest`; pinning changes every user's update path — asking
  maintainer before changing" (diagnosis T3).
- ❌ Asking the maintainer whether `Hooks` has a `config` hook — that's in
  `node_modules/@opencode-ai/plugin/dist/index.d.ts`; look it up.

## 4. Wrong-direction signals: change approach instead of retrying

**Rule**: Switch strategy (don't retry harder) when you see any of: (1) your fix requires
touching ≥2 fragile surfaces at once; (2) you're adding special cases to detect the host
environment ("if TUI... else if headless..."); (3) a test needs extensive mocking of
undocumented shapes to pass; (4) the same test fails after two genuinely different fixes;
(5) your diff keeps growing while the symptom is unchanged.

- ✅ Mocking `event.properties.sessionID` felt necessary → recognize the SDK type says
  `properties.info` (diagnosis S3.3) → stop, capture a real event, fix the assumption instead
  of the mock.
- ❌ Third retry of tweaking the log-file regex to detect `-s` launches on another platform —
  the approach (log scraping) is the problem, not the regex.

## 5. When to split (PR / config migration / release)

**Rule**: Split when a single change contains more than one of: engine semantics, lifecycle
wiring, generated-file defaults, docs restructuring. Config migrations ship in two stages:
stage 1 reads new + old (warn on old), stage 2 (≥1 minor later) drops old. Never combine a
dependency bump with a behavior change in one release — you can't tell which one broke users.

- ✅ Renaming `days` → `daysOfWeek`: release N reads both + warns; release N+1 removes `days`.
- ❌ One PR that bumps `@opencode-ai/sdk`, rewrites autostart, and reformats `src/index.js`
  indentation. Unreviewable and un-bisectable.

## 6. Definition of done

**Rule**: A change is done when: tests for the new behavior exist and pass; `npm test` +
`npm run lint` green; docs that state the changed fact are updated (architecture map §5 for
config, README ×2 for user-facing); the failure story is written when health plan §4 rule 2
applies (i.e. the change adds an external call to the startup path — otherwise state "n/a");
and verification evidence is recorded (which commands ran, or which manual steps were skipped
and why). "Code compiles and looks right" is 40% done.

- ✅ PR body contains the filled `regression-test-checklist.md` with pasted `npm test` summary.
- ❌ "Done — tests should pass" with no run output. That's a claim, not a state.

## 7. Escalate model / bring in a human reviewer

**Rule**: Escalate model per the routing doc §4 (once for cheap, twice for mid). Bring a human
when: the change is in rubric §3's list, OR verification requires a live OpenCode/TUI/platform
you don't have, OR two escalation rounds failed. Escalation includes the full failure trail.

- ✅ "Can't verify focus-steal behavior without a TUI; needs a human run of baseline §5 steps
  4–7 — here is exactly what to look for."
- ❌ Silently shipping a lifecycle change because "unit tests pass" when the manual smoke was
  impossible in the environment.

## 8. Quality floor — how to check it, mechanically

Before any merge, all of these are checkable without judgment:
1. `npm test` green (all tests, not just the new ones).
2. No new `throw` reachable from user config; no new unguarded `await` in hook handlers
   (grep the diff for `throw` and `await` and check each).
3. No new blocking/waiting on the startup path (grep diff for `while`, `setInterval`,
   unbounded `setTimeout` chains, promise loops).
4. Suppression tests/checks still pass (`OPENCODE_PREFLIGHT_AUTOSTART`, `-s`, child sessions).
5. Diff contains no personal paths/tokens; no changes to files unrelated to the stated goal.
6. Every doc fact the diff invalidates is updated in the same PR.

Failing any item = below the floor; do not merge, regardless of how valuable the feature is.
