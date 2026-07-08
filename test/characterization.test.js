// Characterization tests: pin CURRENT behavior (including known-suboptimal behavior)
// so refactors can't change it silently. When a "currently ..." test starts failing
// because you intentionally fixed the behavior, replace the test with one asserting
// the new behavior and update docs/process-improvement/fable5-preflight-diagnosis.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPreflight, loadRunState, stripJsonComments } from "../src/engine.js";
import opencodePreflight from "../src/index.js";

function makeProject() {
  const cwd = mkdtempSync(path.join(tmpdir(), "opencode-preflight-char-"));
  mkdirSync(path.join(cwd, ".opencode/preflight/actions"), { recursive: true });
  return cwd;
}

test("currently: invalid branch pattern regex throws out of buildPreflight (diagnosis S1)", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [{ id: "bad", when: { branch: { pattern: "(" } }, actions: ["a"] }],
      actions: { a: { label: "A" } },
    }),
  );

  // Outside a git worktree branch conditions never match, so the pattern is never
  // evaluated and buildPreflight stays inactive without throwing:
  const result = buildPreflight(cwd, { recordRunState: false });
  assert.equal(result.active, false);

  // Inside a git worktree the branch is known (git branch --show-current reports the
  // unborn default branch right after init), matchesBranch evaluates the pattern, and
  // new RegExp("(") throws out of buildPreflight. This is the S1 bug being pinned:
  execFileSync("git", ["init", "--quiet"], { cwd, stdio: "ignore" });
  assert.throws(() => buildPreflight(cwd, { recordRunState: false }), SyntaxError);
});

test("stripJsonComments keeps URLs in string values intact", () => {
  const input = '{"homepage": "https://example.com/path", "note": "x"}';
  assert.deepEqual(JSON.parse(stripJsonComments(input)), {
    homepage: "https://example.com/path",
    note: "x",
  });
});

test("currently: comment-like sequences inside strings are corrupted by stripJsonComments", () => {
  // Known limitation documented in architecture map §5: "a//b" (no colon before //)
  // is treated as a comment start. Pinning it so a future fix is a conscious change.
  const input = '{"path": "a//b"}';
  assert.throws(() => JSON.parse(stripJsonComments(input)));
});

test("corrupt run-state.json is discarded, not fatal", () => {
  const cwd = makeProject();
  writeFileSync(path.join(cwd, ".opencode/preflight/run-state.json"), "{not json");
  assert.deepEqual(loadRunState(cwd), { version: 1, actions: {} });
});

test("plugin loads without a client and registers expected hooks (smoke)", async () => {
  const cwd = makeProject();
  const hooks = await opencodePreflight({ directory: cwd, client: undefined });

  assert.ok(hooks.tool?.preflight_config, "preflight_config tool registered");
  assert.ok(hooks.tool?.preflight_action_prompt, "preflight_action_prompt tool registered");
  assert.ok(hooks.tool?.preflight_action_list, "preflight_action_list tool registered");
  assert.equal(typeof hooks["experimental.chat.system.transform"], "function");
  assert.equal(typeof hooks.event, "function");

  // The transform hook must be a no-op (not a throw) when no transport exists.
  const output = { system: [] };
  await hooks["experimental.chat.system.transform"]({ sessionID: "x" }, output);
  assert.deepEqual(output.system, []);
});

test("preflight_action_list tool reports missing config without throwing", async () => {
  const cwd = makeProject();
  const hooks = await opencodePreflight({ directory: cwd, client: undefined });
  const text = await hooks.tool.preflight_action_list.execute({}, {});
  assert.match(text, /Active: false/);
  assert.match(text, /missing-config/);
});

test("currently: passive buildPreflight records promptedAt run state (diagnosis S2)", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [{ id: "always", when: {}, actions: ["a"] }],
      actions: {
        a: {
          label: "A",
          runState: { enabled: true, skipIfLastRunWithinHours: 20, recordOn: "prompted" },
        },
      },
    }),
  );

  // Default options (as used by getPrompt() in src/index.js) write run state even
  // though no prompt was delivered to a user.
  buildPreflight(cwd, { now: new Date("2026-07-08T09:00:00.000Z") });
  assert.equal(existsSync(path.join(cwd, ".opencode/preflight/run-state.json")), true);

  const second = buildPreflight(cwd, { now: new Date("2026-07-08T10:00:00.000Z") });
  assert.equal(second.active, false, "action suppressed by the passive record");
});
