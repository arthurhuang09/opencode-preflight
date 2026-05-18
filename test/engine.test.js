import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPreflight, buildPreflightActionPrompt, listPreflightActions } from "../src/engine.js";
import { appendPreflightSystemPrompt, isChildSession } from "../src/index.js";

function makeProject() {
  const cwd = mkdtempSync(path.join(tmpdir(), "opencode-preflight-"));
  mkdirSync(path.join(cwd, ".opencode/preflight/actions"), { recursive: true });
  return cwd;
}

test("returns inactive when config is missing", () => {
  const cwd = makeProject();
  const result = buildPreflight(cwd);
  assert.equal(result.active, false);
  assert.equal(result.prompt, "");
});

test("builds a prompt from matching trigger, action prompt, and memory", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      language: "zh-TW",
      defaultBranches: [""],
      triggers: [
        {
          id: "default-branch",
          label: "Default branch preflight",
          when: {},
          actions: ["issue-review", "issue-review"],
        },
      ],
      actions: {
        "issue-review": {
          label: "整理 issue 狀態",
          mode: "ask-before-execute",
          promptFile: ".opencode/preflight/actions/issue-review.md",
          memory: { read: ["project-issues"] },
        },
      },
      memoryStores: {
        default: { type: "json-file", path: ".opencode/preflight/memory.json" },
      },
      memoryTopics: {
        "project-issues": { store: "default", description: "追蹤 issue 狀態" },
      },
    }),
  );
  writeFileSync(
    path.join(cwd, ".opencode/preflight/actions/issue-review.md"),
    "請整理 issue 狀態。",
  );
  writeFileSync(
    path.join(cwd, ".opencode/preflight/memory.json"),
    JSON.stringify({
      version: 1,
      topics: {
        "project-issues": {
          records: [{ id: "issue:1", title: "Fix startup flow", notes: "等待回覆" }],
        },
      },
    }),
  );

  const result = buildPreflight(cwd);
  assert.equal(result.active, true);
  assert.match(result.prompt, /Default branch preflight/);
  assert.match(result.prompt, /請整理 issue 狀態/);
  assert.match(result.prompt, /issue:1: Fix startup flow/);
});

test("includes warnings for missing prompt files", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      defaultBranches: [""],
      triggers: [{ id: "default", when: {}, actions: ["missing"] }],
      actions: {
        missing: {
          label: "Missing prompt",
          mode: "ask-before-execute",
          promptFile: ".opencode/preflight/actions/missing.md",
        },
      },
    }),
  );

  const result = buildPreflight(cwd);
  assert.equal(result.active, true);
  assert.match(result.prompt, /Warnings/);
  assert.match(result.prompt, /Prompt file missing/);
});

test("does not match branch triggers outside a git worktree", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      defaultBranches: ["main"],
      triggers: [
        {
          id: "feature-branch",
          when: { branch: { matchesDefault: false } },
          actions: ["task-review"],
        },
      ],
      actions: {
        "task-review": {
          label: "Task review",
          promptFile: ".opencode/preflight/actions/task-review.md",
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/task-review.md"), "Review tasks.");

  const result = buildPreflight(cwd);
  assert.equal(result.active, false);
});

test("matches time trigger after configured local time", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [
        {
          id: "morning",
          when: { time: { after: "09:00", timezone: "UTC" } },
          actions: ["daily-check"],
        },
      ],
      actions: {
        "daily-check": {
          label: "Daily check",
          promptFile: ".opencode/preflight/actions/daily-check.md",
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/daily-check.md"), "Check daily items.");

  assert.equal(
    buildPreflight(cwd, { now: new Date("2026-05-17T08:59:00.000Z") }).active,
    false,
  );
  assert.equal(
    buildPreflight(cwd, { now: new Date("2026-05-17T09:00:00.000Z") }).active,
    true,
  );
});

test("action runState records prompted actions and skips recent prompts", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [{ id: "daily", when: {}, actions: ["daily-check"] }],
      actions: {
        "daily-check": {
          label: "Daily check",
          promptFile: ".opencode/preflight/actions/daily-check.md",
          runState: {
            enabled: true,
            skipIfLastRunWithinHours: 20,
            recordOn: "prompted",
          },
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/daily-check.md"), "Check daily items.");

  const first = buildPreflight(cwd, { now: new Date("2026-05-17T09:00:00.000Z") });
  assert.equal(first.active, true);
  const statePath = path.join(cwd, ".opencode/preflight/run-state.json");
  assert.equal(existsSync(statePath), true);
  assert.match(readFileSync(statePath, "utf8"), /promptedAt/);

  const second = buildPreflight(cwd, { now: new Date("2026-05-17T10:00:00.000Z") });
  assert.equal(second.active, false);

  const third = buildPreflight(cwd, { now: new Date("2026-05-18T06:00:01.000Z") });
  assert.equal(third.active, true);
});

test("lists configured actions with matched and runState availability", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      defaultBranches: [""],
      triggers: [{ id: "daily", label: "Daily", when: {}, actions: ["daily-check"] }],
      actions: {
        "daily-check": {
          label: "Daily check",
          promptFile: ".opencode/preflight/actions/daily-check.md",
          runState: {
            enabled: true,
            skipIfLastRunWithinHours: 20,
            recordOn: "prompted",
          },
        },
        "manual-only": {
          label: "Manual only",
          promptFile: ".opencode/preflight/actions/manual-only.md",
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/daily-check.md"), "Check daily items.");
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/manual-only.md"), "Manual action.");

  buildPreflight(cwd, { now: new Date("2026-05-17T09:00:00.000Z") });
  const result = listPreflightActions(cwd, { now: new Date("2026-05-17T10:00:00.000Z") });

  assert.equal(result.active, true);
  assert.deepEqual(
    result.actions.map((action) => ({ id: action.id, matched: action.matched, available: action.available })),
    [
      { id: "daily-check", matched: true, available: false },
      { id: "manual-only", matched: false, available: true },
    ],
  );
});

test("lists warnings for matched triggers that reference undefined actions", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [{ id: "daily", when: {}, actions: ["missing-action"] }],
      actions: {
        "manual-only": {
          label: "Manual only",
          promptFile: ".opencode/preflight/actions/manual-only.md",
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/manual-only.md"), "Manual action.");

  const result = listPreflightActions(cwd);

  assert.equal(result.active, true);
  assert.deepEqual(result.actions.map((action) => action.id), ["manual-only"]);
  assert.match(result.warnings.join("\n"), /missing-action/);
});

test("lists warnings for inherited trigger action ids", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      triggers: [{ id: "daily", when: {}, actions: ["toString"] }],
      actions: {},
    }),
  );

  const result = listPreflightActions(cwd);

  assert.equal(result.active, false);
  assert.match(result.warnings.join("\n"), /toString/);
});

test("builds a prompt for one manual preflight action", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      actions: {
        "manual-only": {
          label: "Manual only",
          mode: "ask-before-execute",
          promptFile: ".opencode/preflight/actions/manual-only.md",
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/manual-only.md"), "Manual action.");

  const result = buildPreflightActionPrompt(cwd, "manual-only", { recordRunState: false });

  assert.equal(result.active, true);
  assert.match(result.prompt, /Manual action: manual-only/);
  assert.match(result.prompt, /Manual action\./);
});

test("manual preflight action prompts record run state by default", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      actions: {
        "manual-only": {
          label: "Manual only",
          mode: "ask-before-execute",
          promptFile: ".opencode/preflight/actions/manual-only.md",
          runState: {
            enabled: true,
            skipIfLastRunWithinHours: 20,
            recordOn: "prompted",
          },
        },
      },
    }),
  );
  writeFileSync(path.join(cwd, ".opencode/preflight/actions/manual-only.md"), "Manual action.");

  const result = buildPreflightActionPrompt(cwd, "manual-only", {
    now: new Date("2026-05-17T09:00:00.000Z"),
  });

  assert.equal(result.active, true);
  const statePath = path.join(cwd, ".opencode/preflight/run-state.json");
  assert.equal(existsSync(statePath), true);
  assert.match(readFileSync(statePath, "utf8"), /manual-only/);
  assert.match(readFileSync(statePath, "utf8"), /promptedAt/);
});

test("rejects manual preflight action ids that are not own config keys", () => {
  const cwd = makeProject();
  writeFileSync(
    path.join(cwd, ".opencode/preflight.jsonc"),
    JSON.stringify({
      enabled: true,
      actions: {},
    }),
  );

  const result = buildPreflightActionPrompt(cwd, "toString", { recordRunState: false });

  assert.equal(result.active, false);
  assert.equal(result.prompt, "");
  assert.match(result.warnings.join("\n"), /toString/);
});

test("detects child sessions so subagents can skip preflight injection", () => {
  assert.equal(isChildSession({ id: "child", parentID: "parent" }), true);
  assert.equal(isChildSession({ id: "root" }), false);
});

test("system transform skips child sessions", async () => {
  const output = { system: [] };
  const v2 = {
    session: {
      get: async () => ({ data: { id: "child", parentID: "parent" } }),
    },
  };

  await appendPreflightSystemPrompt({
    v2,
    client: {},
    directory: "/tmp/project",
    sessionID: "child",
    getPrompt: () => "preflight prompt",
    output,
  });

  assert.deepEqual(output.system, []);
});
