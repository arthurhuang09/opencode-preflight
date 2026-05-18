import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configurePreflight } from "./configure.js";

const PACKAGE_NAME = "@arthurhuang09/opencode-preflight";
const OPENCODE_DIR = ".opencode";
const OPENCODE_CONFIG_PATH = path.join(OPENCODE_DIR, "opencode.json");
const OPENCODE_JSONC_PATH = path.join(OPENCODE_DIR, "opencode.jsonc");
const PACKAGE_JSON_PATH = path.join(OPENCODE_DIR, "package.json");
const SHIM_PATH = path.join(OPENCODE_DIR, "plugins/preflight.js");

const PREFLIGHT_COMMANDS = {
  "preflight-config": {
    description: "Create or repair OpenCode preflight config files",
    template:
      "Ask which default OpenCode preflight actions to create: issue-review, project-readiness, task-progress-review, or all. Then call the preflight_config tool with the selected action ids. Do not overwrite existing files unless I confirm, then list created and skipped files.",
  },
  "preflight-action-list": {
    description: "List configured preflight actions and current status",
    template:
      "Call the preflight_action_list tool and summarize the configured OpenCode preflight actions. This is status-only; do not run an action or ask me to choose one.",
  },
  "preflight-action-run": {
    description: "Choose and run an available preflight action",
    template:
      "Call the preflight_action_list tool. If no actions are available, explain why and do not ask me to choose one. Otherwise use AskUserQuestion/question with the available action ids and `Do not run anything for now`. After I choose an action, call the preflight_action_prompt tool with that action id, then follow the returned prompt. For ask-before-execute actions, confirm before commands or edits.",
  },
  "preflight-action-edit": {
    description: "Edit a configured preflight action and its triggers",
    template:
      "Help me edit one configured OpenCode preflight action. First read `.opencode/preflight.jsonc` and list the configured action ids. Ask which action to edit and what to change: behavior, prompt file, runState, memory, or trigger conditions/references. Then update only the relevant `.opencode/preflight.jsonc` fields and action prompt file. Do not run the action. After editing, summarize the changed files and behavior.",
  },
};

const SHIM_CONTENT = `import preflight from "${PACKAGE_NAME}";\n\nexport default preflight;\n`;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath, content, force, result) {
  if (existsSync(filePath) && !force) {
    result.skipped.push(path.relative(result.cwd, filePath));
    return;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
  result.written.push(path.relative(result.cwd, filePath));
}

function mergeOpenCodeConfig(cwd, force, result) {
  const configPath = path.join(cwd, OPENCODE_CONFIG_PATH);
  const config = existsSync(configPath) ? readJson(configPath) : {};
  const before = JSON.stringify(config);

  config.$schema ??= "https://opencode.ai/config.json";
  config.command ??= {};

  for (const [name, command] of Object.entries(PREFLIGHT_COMMANDS)) {
    if (!config.command[name] || force) {
      config.command[name] = command;
    }
  }

  if (JSON.stringify(config) === before) {
    result.skipped.push(OPENCODE_CONFIG_PATH);
    return;
  }

  writeJson(configPath, config);
  result.written.push(OPENCODE_CONFIG_PATH);
}

function mergePackageJson(cwd, result) {
  const packagePath = path.join(cwd, PACKAGE_JSON_PATH);
  const manifest = existsSync(packagePath) ? readJson(packagePath) : {};
  const before = JSON.stringify(manifest);

  manifest.type ??= "module";
  manifest.dependencies ??= {};
  manifest.dependencies[PACKAGE_NAME] ??= "latest";

  if (JSON.stringify(manifest) === before) {
    result.skipped.push(PACKAGE_JSON_PATH);
    return;
  }

  writeJson(packagePath, manifest);
  result.written.push(PACKAGE_JSON_PATH);
}

export function initPreflightProject(cwd, options = {}) {
  const force = options.force === true;
  const install = options.install !== false;
  const withConfig = options.withConfig === true;
  const result = { cwd, written: [], skipped: [], warnings: [] };

  mkdirSync(path.join(cwd, OPENCODE_DIR), { recursive: true });

  if (existsSync(path.join(cwd, OPENCODE_JSONC_PATH))) {
    result.warnings.push(`${OPENCODE_JSONC_PATH} exists; ${OPENCODE_CONFIG_PATH} is used for generated config.`);
  }

  mergeOpenCodeConfig(cwd, force, result);
  mergePackageJson(cwd, result);
  writeTextFile(path.join(cwd, SHIM_PATH), SHIM_CONTENT, force, result);

  if (withConfig) {
    const configured = configurePreflight(cwd, { force, actions: options.actions });
    result.written.push(...configured.created);
    result.skipped.push(...configured.skipped);
  }

  if (install) {
    execFileSync("npm", ["install"], {
      cwd: path.join(cwd, OPENCODE_DIR),
      stdio: options.stdio ?? "inherit",
    });
  }

  return result;
}
