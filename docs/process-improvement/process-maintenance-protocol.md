# Process Maintenance Protocol

How to keep the `docs/process-improvement/` system itself healthy. This file governs the other
docs; change it conservatively.

## 1. Who may change what

| File | May be updated freely by any agent | Needs maintainer OK first |
|---|---|---|
| `fable5-preflight-diagnosis.md` | mark items fixed (with commit hash), add new evidence | deleting an item without a fixing commit |
| `preflight-architecture-map.md` | keep §5 field table and §2 surfaces in sync with code (same PR as the code change) | changing the "do not touch first" list |
| `testing-and-verification-baseline.md` | update commands/gap-table when code changes; fix broken commands immediately | weakening any "mandatory" manual step |
| `preflight-health-improvement-plan.md` | fix factual drift in 現況 sections | changing any 規則 rule |
| `preflight-engineering-rubrics.md` | add examples to existing rubrics | changing a rule's direction (e.g. block vs warn) |
| `agent-delegation-and-model-routing.md`, `prompt-templates-for-preflight-repo.md` | freely, they are conveniences | — |
| `templates/preflight/*` | add fields with fill-criteria; fix wrong references | removing checklist items |
| `AGENTS.md` | fix broken paths/commands | anything under "Hard rules" |
| this file | typos/links | everything else |

"Maintainer" = the repo owner (arthurhuang09), not another agent.

## 2. Lessons: where and how

When something bites you (a doc was wrong, a hidden behavior surprised you, a release hurt):

1. Fix the doc that was wrong, in place, in the same PR — the *primary* record is the corrected doc.
2. Append one entry to `docs/process-improvement/lessons.md` (create on first use) in this format:

```markdown
## 2026-07-08 — short title
- **Symptom**: what happened, one line.
- **Wrong belief**: the assumption that failed, one line.
- **Correction**: what's true, with file:line or command evidence.
- **Doc updated**: path + section (must not be empty — if no doc changed, why did this bite you?)
```

The "Doc updated" field is the point: a lesson that didn't improve a doc will be relearned.

## 3. Size and rot control

- **Budgets**: `AGENTS.md` ≤ ~60 lines; each process doc ≤ ~250 lines; `lessons.md` ≤ 20 entries.
  Over budget → condense in the same PR that breaches it (fold lessons into the docs they
  corrected, delete solved diagnosis items' long bodies leaving a one-line tombstone with the
  fixing commit).
- **Staleness markers**: every factual claim tied to a version stays greppable — the docs pin
  `1.14.51` and commit `1feb761`. After a dependency bump or major refactor, grep for both and
  re-verify or update the hits: `git grep -n "1\.14\.51\|1feb761" docs/ AGENTS.md templates/`.
- **Contradiction rule**: if two docs disagree, code wins over docs, and the doc closest to the
  code (architecture map) wins over process docs. Fix the loser immediately; don't leave both.
- **No new top-level docs** without retiring or merging an old one, unless the maintainer asks.
  Growth pressure goes into existing files, not new ones.
- **Read-path check** (quarterly or after big changes): open `AGENTS.md`, follow every link, run
  every command in testing baseline §1–§2. Anything broken gets fixed or deleted that day —
  a routing file with dead links trains agents to ignore it.

## 4. What NOT to record here

- Anything derivable from code or git history (that's what the code is for).
- Session-specific state ("currently working on X") — that goes in a handoff
  (`templates/preflight/agent-handoff.md`), which is disposable.
- Secrets, personal paths, machine-specific config. Placeholders only.
