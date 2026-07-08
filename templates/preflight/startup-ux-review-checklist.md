# Startup UX Review Checklist

For any change to prompting, autostart, focus behavior, or the composed preflight prompt.
Every "no" needs a written justification or the change is rejected.

- [ ] With no `.opencode/preflight.jsonc`, the user sees nothing. (silence-by-default)
- [ ] With config but no matched trigger, the user sees nothing.
- [ ] `OPENCODE_PREFLIGHT_AUTOSTART=0` still fully suppresses autostart.
- [ ] `-s` / `--session` launches still get no new preflight session.
- [ ] Child sessions (subagents) still get no preflight system prompt.
- [ ] No code path waits for user input during plugin load or session creation.
- [ ] Errors in preflight are quieter than the feature: degraded paths log at debug, they do not toast/error.
- [ ] Warnings appear inside the preflight prompt body, not as separate startup noise.
- [ ] Focus behavior (`tui.session.select` timing) unchanged — or maintainer explicitly approved the change.
- [ ] The engine's composed prompt (`composePrompt`, `src/engine.js`) still instructs: explain triggers first; confirm before execute for ask-before-execute actions; read-only-first for auto-summarize-then-ask.
- [ ] The startup user prompt (`createStartupUserPrompt`, `src/index.js`) still demands AskUserQuestion/question with action labels plus a "Do not run anything for now" option.
- [ ] Prompt length: did this change add unconditional text to every startup prompt? If yes, is it worth the tokens for every user on every matched startup?
- [ ] README.md + README.zh-TW.md updated if user-visible behavior changed.

Judgment guide (from rubrics doc): preflight may **ask**; it may never **gate**. If your change
makes the user unable to proceed until they answer, it is wrong regardless of how useful the
question is.
