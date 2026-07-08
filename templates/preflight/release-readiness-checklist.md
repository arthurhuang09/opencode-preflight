# Release Readiness Checklist

Version: `v___`  Date: `___`  Releaser: `___`

## Gate 1 — mechanical (all must pass; paste command output or commit hash)
- [ ] `npm ci && npm test` green locally
- [ ] `npm run lint` green
- [ ] `npm run build` — reviewed the file list: only `src/`, READMEs, LICENSE; no stray files
- [ ] `package.json` version bumped and committed; tag will be `v<exact version>`
- [ ] `package-lock.json` in sync (`npm ci` succeeded)

## Gate 2 — behavior (required if src/ changed since last release)
- [ ] Smoke test (testing baseline §2) output pasted below
- [ ] Manual OpenCode check (baseline §5) done? If `src/index.js`/`src/tui.js` changed: mandatory.
      Steps skipped and why: ___
- [ ] Compatibility matrix filled (`compatibility-matrix-checklist.md`) for lifecycle/dependency changes

## Gate 3 — docs and users
- [ ] README.md and README.zh-TW.md aligned with actual behavior
- [ ] `PREFLIGHT_COMMANDS` (src/init.js) matches README Manual Install JSON
- [ ] Any changed default/config semantic has a migration note (where: ___)
- [ ] Rollback plan understood: dist-tag repoint command ready
      (`npm dist-tag add @arthurhuang09/opencode-preflight@<last-good> latest`)

## Known risks accepted in this release
<!-- List consciously-shipped limitations. Empty = you didn't think about it, not "no risks". -->

## Post-release verification
- [ ] `npm view @arthurhuang09/opencode-preflight dist-tags` shows the new version as `latest`
- [ ] Fresh `npx @arthurhuang09/opencode-preflight init` in a throwaway dir succeeds
