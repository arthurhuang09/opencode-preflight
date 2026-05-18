import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { initPreflightProject } from "../src/init.js";

function makeProject() {
  return mkdtempSync(path.join(tmpdir(), "opencode-preflight-init-"));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("initializes OpenCode preflight project files", () => {
  const cwd = makeProject();
  const result = initPreflightProject(cwd, { install: false });

  assert.deepEqual(result.warnings, []);
  assert.equal(existsSync(path.join(cwd, ".opencode/opencode.json")), true);
  assert.equal(existsSync(path.join(cwd, ".opencode/package.json")), true);
  assert.equal(existsSync(path.join(cwd, ".opencode/plugins/preflight.js")), true);

  const config = readJson(path.join(cwd, ".opencode/opencode.json"));
  assert.equal(config.command["preflight-config"].template.includes("preflight_config"), true);
  assert.equal(config.command["preflight-config"].template.includes("issue-review"), true);
  assert.equal(config.command["preflight-action-list"].template.includes("preflight_action_list"), true);
  assert.equal(config.command["preflight-action-run"].template.includes("preflight_action_prompt"), true);
  assert.equal(config.command["preflight-action-edit"].template.includes("trigger conditions"), true);

  const manifest = readJson(path.join(cwd, ".opencode/package.json"));
  assert.equal(manifest.type, "module");
  assert.equal(manifest.dependencies["@arthurhuang09/opencode-preflight"], "latest");
});

test("preserves existing OpenCode command unless forced", () => {
  const cwd = makeProject();
  mkdirSync(path.join(cwd, ".opencode"), { recursive: true });
  writeFileSync(
    path.join(cwd, ".opencode/opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      command: {
        "preflight-config": {
          description: "Existing",
          template: "Keep this template.",
        },
        "preflight-action-list": {
          description: "Existing list",
          template: "Keep this list template.",
        },
      },
    }),
  );

  initPreflightProject(cwd, { install: false });

  const config = readJson(path.join(cwd, ".opencode/opencode.json"));
  assert.equal(config.command["preflight-config"].template, "Keep this template.");
  assert.equal(config.command["preflight-action-list"].template, "Keep this list template.");
  assert.equal(config.command["preflight-action-run"].template.includes("preflight_action_prompt"), true);
  assert.equal(config.command["preflight-action-edit"].template.includes("Do not run the action"), true);
});

test("optionally writes default preflight configuration", () => {
  const cwd = makeProject();
  const result = initPreflightProject(cwd, { install: false, withConfig: true });

  assert.equal(existsSync(path.join(cwd, ".opencode/preflight.jsonc")), true);
  assert.equal(existsSync(path.join(cwd, ".opencode/preflight/actions/issue-review.md")), true);
  assert.equal(result.written.includes(".opencode/preflight.jsonc"), true);
});

test("can write selected default preflight actions", () => {
  const cwd = makeProject();
  initPreflightProject(cwd, {
    install: false,
    withConfig: true,
    actions: ["project-readiness"],
  });

  const config = readJson(path.join(cwd, ".opencode/preflight.jsonc"));
  assert.deepEqual(Object.keys(config.actions), ["project-readiness"]);
  assert.equal(existsSync(path.join(cwd, ".opencode/preflight/actions/project-readiness.md")), true);
  assert.equal(existsSync(path.join(cwd, ".opencode/preflight/actions/issue-review.md")), false);
  assert.equal(existsSync(path.join(cwd, ".opencode/preflight/memory.json")), false);
});

test("warns when legacy opencode.jsonc exists", () => {
  const cwd = makeProject();
  mkdirSync(path.join(cwd, ".opencode"), { recursive: true });
  writeFileSync(path.join(cwd, ".opencode/opencode.jsonc"), "{}\n");

  const result = initPreflightProject(cwd, { install: false });

  assert.match(result.warnings.join("\n"), /opencode\.jsonc/);
});
