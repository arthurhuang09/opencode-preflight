# Bug Investigation

## Report
<!-- Verbatim symptom + environment: OpenCode version, OS, launch mode (TUI/-s/headless), plugin version. -->
<!-- Good: "v0.1.3, macOS, plain `opencode` in repo X: preflight session appears but empty." -->
<!-- Bad: "preflight broken". If you don't have the environment info, your first step is to ask for it. -->

## Reproduction
<!-- The exact commands. If not reproducible locally, run the debug runbook remotely (testing baseline §6) and paste which step diverged. -->

## Runbook result (testing baseline §6)
- Step 1 (env/args suppression): ___
- Step 2 (config parses): ___
- Step 3 (trigger match): ___
- Step 4 (run-state suppression): ___
- Step 5 (transport/log lines): ___
- Step 6 (plugin loaded at all): ___

## Root cause
<!-- Name file:function and the exact wrong assumption. -->
<!-- If it's a fragile surface from architecture map §2, check whether an OpenCode upgrade changed the surface — diff installed .d.ts against the greps in baseline §7. -->

## Known-issue check
- [ ] Searched `docs/process-improvement/fable5-preflight-diagnosis.md` — matches item: ___ / none
- [ ] Checked main working tree for overlapping uncommitted WIP (`git status`)

## Fix classification (pick one — from rubrics doc §1)
- [ ] engine logic, tested area → fix + test in same commit
- [ ] untested area → characterization test first, then fix
- [ ] fragile surface / needs live OpenCode → fix + manual verification, or escalate to maintainer

## Regression scope
<!-- What adjacent behavior could this fix break? Fill regression-test-checklist.md. -->
