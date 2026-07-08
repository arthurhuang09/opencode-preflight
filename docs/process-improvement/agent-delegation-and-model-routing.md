# Agent Delegation and Model Routing

How to split work in this repo between a lead ("commander") agent and subagents, and when to
change model tier. Written for whatever harness the maintainer runs (Claude Code and OpenCode
have both been used here); where capabilities differ by harness, check what is actually
available instead of assuming.

**Do not fabricate model or agent names.** Before routing, list what exists:
- Claude Code: available subagent types are listed in the session's system context (e.g.
  `Explore`, `Plan`, `general-purpose`); model tiers commonly exposed: `haiku` < `sonnet` < `opus`.
- OpenCode: check the user's configured models/agents (`opencode.json`, or ask). This repo's
  docs do not know your model list — **unknown until checked**.
- If you cannot enumerate models, route by tier language ("cheapest available" / "strongest
  available") and let the harness resolve it.

## 1. The commander does not do bulk work

The lead agent's context is the scarcest resource in a session. Delegate when the task is:
- **Bulk reading / repo scanning** (many files, only conclusions needed) → read-only search
  subagent ("Explore"-type), report = conclusions + `file:line` refs.
- **Web/docs research** (OpenCode release notes, SDK changes) → research subagent; report =
  facts + URLs; never paste whole pages back.
- **Batch mechanical edits** (apply a settled pattern to N files) → cheapest capable model,
  with the pattern spelled out and one worked example.
- **Review/verification of finished work** → *fresh-context* subagent that did not produce
  the work (see §5).

Do it yourself (don't delegate) when: the task needs the session's accumulated context, is a
single-file edit, or writing the delegation brief would take longer than the task.
This repo is small (~6 source files) — a full read costs little; delegation pays off mainly
for web research, adversarial review, and verification, not for code search here.

## 2. Every delegation carries three things

1. **Goal + why**: one sentence of outcome, one of motivation. ("Verify the manual-install
   JSON in README.md equals PREFLIGHT_COMMANDS in src/init.js — they drift, diagnosis W2.")
2. **Acceptance criteria**: how the subagent knows it's done. Concrete: "list every semantic
   difference, or state 'identical'; cite line numbers."
3. **Report format**: what comes back. Default contract: conclusions + file paths + line
   numbers only; anything long is written to a file and the path returned.

A delegation missing any of the three gets garbage back. That's the delegator's fault.

## 3. Explicit model and effort per task type

| Task | Tier | Rationale |
|---|---|---|
| Sync-check README ×2 vs `PREFLIGHT_COMMANDS`; grep-style verification | cheapest | mechanical comparison |
| Write/extend engine tests from an existing pattern | cheap–mid | `test/engine.test.js` has strong patterns to copy |
| Engine feature (new trigger/config field) | mid (Sonnet-class) | bounded, well-documented area |
| Anything in `src/index.js` lifecycle | strongest available | fragile surfaces, host-stability stakes (diagnosis S1–S3) |
| Release decision, blocking-behavior change, migration design | strongest + human maintainer | judgment calls listed in rubrics §3 |
| Adversarial review of docs/plans | mid, **fresh context** | fresh eyes matter more than raw capability |

State the tier in the delegation. If the harness can't honor it, note that in the handoff.

## 4. Escalation and de-escalation

- Cheap model wrong once on a task → don't coach it through a second attempt; escalate one tier
  with the failed attempt attached.
- Mid model wrong twice on the *same subtask* → escalate to the strongest tier with the full
  failure trail (both attempts + why they failed), not a fresh clean prompt — the failures are data.
- Strongest model solved it and the remaining work is applying the solved pattern → de-escalate
  the batch application to a cheap model.
- Hard cap: two escalation rounds per subtask. Still failing → it's not a model problem; it's a
  spec problem or a "needs human" problem (rubrics §3). Stop and write it up.

## 5. Verification is never self-verification

- Work products are checked by a **fresh-context** agent that didn't write them.
- Docs → read-back review: "follow this doc literally; list every step that fails or is ambiguous."
- Code → tests and actual execution (`npm test`, smoke §2), not another model's opinion.
- High-risk judgment (release go/no-go, default-behavior change) → second opinion from a separate
  session, or generate 2–3 candidate approaches and have a judge pick — and even then the final
  call on user-facing defaults belongs to the human maintainer.
- The verifier reports pass/fail per acceptance criterion, not a vibe ("looks good" is not a result).

## 6. Harness limits (honesty clause)

Delegation cannot compensate for:
- **No live OpenCode in the loop**: no subagent can verify TUI focus behavior, `client._client`
  availability, or real event shapes. That requires a human (or an agent explicitly given a
  working OpenCode TUI) running testing baseline §5.
- **Undocumented API drift**: subagents reading `node_modules` types see the *installed* version
  only. Upstream changes need release-note research plus a version bump test.
- **Windows/Desktop behavior**: nobody here has verified it. Escalate to a human with the platform.

When a task hits these, the correct output is "cannot verify here; needs X", not a confident guess.
