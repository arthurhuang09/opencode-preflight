import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CONFIG_PATH = ".opencode/preflight.jsonc";
export const RUN_STATE_PATH = ".opencode/preflight/run-state.json";

export function stripJsonComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function readJsonc(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(stripJsonComments(raw));
}

export function loadConfig(cwd) {
  const configPath = path.join(cwd, CONFIG_PATH);
  if (!existsSync(configPath)) {
    return { config: null, warnings: [] };
  }

  try {
    return { config: readJsonc(configPath), warnings: [] };
  } catch (error) {
    return {
      config: null,
      warnings: [`Failed to parse ${CONFIG_PATH}: ${error.message}`],
    };
  }
}

export function getCurrentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function getGitStatus(cwd) {
  try {
    return execFileSync("git", ["status", "--short"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function getGitContext(cwd) {
  const git = {
    available: false,
    insideWorkTree: false,
    branch: "",
    dirty: false,
  };

  try {
    execFileSync("git", ["--version"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    git.available = true;
  } catch {
    return git;
  }

  try {
    git.insideWorkTree =
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true";
  } catch {
    return git;
  }

  if (!git.insideWorkTree) return git;

  git.branch = getCurrentBranch(cwd);
  git.dirty = getGitStatus(cwd).length > 0;
  return git;
}

export function createContext(cwd, config, options = {}) {
  const git = getGitContext(cwd);
  const branch = git.branch;
  const defaultBranches = config.defaultBranches ?? ["main", "master"];
  return {
    cwd,
    now: options.now ?? new Date(),
    branch,
    defaultBranches,
    branchKnown: git.insideWorkTree && branch.length > 0,
    isDefaultBranch: git.insideWorkTree && branch.length > 0 && defaultBranches.includes(branch),
    git,
    gitStatus: getGitStatus(cwd),
  };
}

function matchesBranch(condition, context) {
  if (!condition) return true;

  if (!context.branchKnown) return false;

  if (
    typeof condition.matchesDefault === "boolean" &&
    condition.matchesDefault !== context.isDefaultBranch
  ) {
    return false;
  }

  if (condition.pattern) {
    const pattern = new RegExp(condition.pattern);
    if (!pattern.test(context.branch)) return false;
  }

  return true;
}

function matchesGit(condition, context) {
  if (!condition) return true;

  if (typeof condition.available === "boolean" && condition.available !== context.git.available) {
    return false;
  }

  if (
    typeof condition.insideWorkTree === "boolean" &&
    condition.insideWorkTree !== context.git.insideWorkTree
  ) {
    return false;
  }

  if (typeof condition.dirty === "boolean") {
    if (!context.git.insideWorkTree || condition.dirty !== context.git.dirty) return false;
  }

  if (condition.branch && !matchesBranch(condition.branch, context)) return false;

  return true;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {
    weekday: value("weekday")?.toLowerCase().slice(0, 3) ?? "",
    minutes: Number(value("hour") ?? 0) * 60 + Number(value("minute") ?? 0),
  };
}

function parseClock(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return hour * 60 + minute;
}

function matchesTime(condition, context) {
  if (!condition) return true;

  const timeZone = condition.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = zonedParts(context.now, timeZone);
  const daysOfWeek = condition.daysOfWeek ?? condition.days;
  if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
    const normalized = daysOfWeek.map((day) => String(day).toLowerCase().slice(0, 3));
    if (!normalized.includes(parts.weekday)) return false;
  }

  const after = parseClock(condition.after);
  if (after !== undefined && parts.minutes < after) return false;

  const before = parseClock(condition.before);
  if (before !== undefined && parts.minutes > before) return false;

  return true;
}

function matchesPaths(condition, cwd) {
  if (!condition) return true;

  for (const relativePath of condition.exists ?? []) {
    if (!existsSync(path.join(cwd, relativePath))) return false;
  }

  for (const relativePath of condition.missing ?? []) {
    if (existsSync(path.join(cwd, relativePath))) return false;
  }

  return true;
}

export function matchTriggers(config, context) {
  return (config.triggers ?? []).filter((trigger) => {
    const when = trigger.when ?? {};
    return (
      matchesGit(when.git, context) &&
      matchesBranch(when.branch, context) &&
      matchesPaths(when.paths, context.cwd) &&
      matchesTime(when.time, context)
    );
  });
}

export function collectActionIds(triggers) {
  return [...new Set(triggers.flatMap((trigger) => trigger.actions ?? []))];
}

export function loadActions(config, actionIds, cwd) {
  const warnings = [];
  const actions = [];

  for (const actionId of actionIds) {
    if (!Object.hasOwn(config.actions ?? {}, actionId)) {
      warnings.push(`Action '${actionId}' is referenced but not defined.`);
      continue;
    }

    const action = config.actions[actionId];
    if (!action) {
      warnings.push(`Action '${actionId}' is referenced but not defined.`);
      continue;
    }

    let prompt = "";
    if (action.promptFile) {
      const promptPath = path.join(cwd, action.promptFile);
      if (existsSync(promptPath)) {
        prompt = readFileSync(promptPath, "utf8").trim();
      } else {
        warnings.push(`Prompt file missing for action '${actionId}': ${action.promptFile}`);
      }
    }

    actions.push({ id: actionId, ...action, prompt });
  }

  return { actions, warnings };
}

export function loadMemoryTopics(config, actions, cwd) {
  const warnings = [];
  const topics = new Map();
  const topicIds = [...new Set(actions.flatMap((action) => action.memory?.read ?? []))];

  for (const topicId of topicIds) {
    const topic = config.memoryTopics?.[topicId];
    if (!topic) {
      warnings.push(`Memory topic '${topicId}' is referenced but not defined.`);
      continue;
    }

    const store = config.memoryStores?.[topic.store];
    if (!store) {
      warnings.push(`Memory store '${topic.store}' for topic '${topicId}' is not defined.`);
      continue;
    }

    if (store.type !== "json-file") {
      warnings.push(`Memory store '${topic.store}' uses unsupported type '${store.type}'.`);
      continue;
    }

    const memoryPath = path.join(cwd, store.path);
    if (!existsSync(memoryPath)) {
      warnings.push(`Memory file missing for topic '${topicId}': ${store.path}`);
      continue;
    }

    try {
      const memory = JSON.parse(readFileSync(memoryPath, "utf8"));
      topics.set(topicId, {
        ...topic,
        records: memory.topics?.[topicId]?.records ?? [],
      });
    } catch (error) {
      warnings.push(`Failed to parse memory file '${store.path}': ${error.message}`);
    }
  }

  return { topics, warnings };
}

export function loadRunState(cwd) {
  const filePath = path.join(cwd, RUN_STATE_PATH);
  if (!existsSync(filePath)) return { version: 1, actions: {} };

  try {
    const state = JSON.parse(readFileSync(filePath, "utf8"));
    return { version: 1, actions: {}, ...state };
  } catch {
    return { version: 1, actions: {} };
  }
}

function runStateKey(action) {
  return action.runState?.key ?? action.id;
}

function runStateField(action) {
  return action.runState?.recordOn === "selected" ? "selectedAt" : "promptedAt";
}

function hoursSince(value, now) {
  const timestamp = Date.parse(value ?? "");
  if (Number.isNaN(timestamp)) return Infinity;
  return (now.getTime() - timestamp) / 36e5;
}

export function filterActionsByRunState(actions, runState, now) {
  return actions.filter((action) => {
    const state = action.runState;
    if (!state?.enabled || typeof state.skipIfLastRunWithinHours !== "number") return true;

    const lastRun = runState.actions?.[runStateKey(action)]?.[runStateField(action)];
    return hoursSince(lastRun, now) >= state.skipIfLastRunWithinHours;
  });
}

export function recordPromptedActions(cwd, actions, now) {
  const promptedActions = actions.filter(
    (action) => action.runState?.enabled && (action.runState.recordOn ?? "prompted") === "prompted",
  );
  if (promptedActions.length === 0) return;

  const runState = loadRunState(cwd);
  runState.version = 1;
  runState.updatedAt = now.toISOString();
  runState.actions ??= {};

  for (const action of promptedActions) {
    const key = runStateKey(action);
    runState.actions[key] = {
      ...(runState.actions[key] ?? {}),
      promptedAt: now.toISOString(),
    };
  }

  const filePath = path.join(cwd, RUN_STATE_PATH);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(runState, null, 2)}\n`, "utf8");
}

export function composePrompt({ config, context, triggers, actions, memoryTopics, warnings }) {
  const language = config.language ?? "en";
  const lines = [
    "# OpenCode Startup Preflight",
    "",
    `Language: ${language}`,
    `Working directory: ${context.cwd}`,
    `Current branch: ${context.branch || "(unknown)"}`,
    `Default branches: ${context.defaultBranches.join(", ")}`,
    `Git status: ${context.gitStatus ? "has changes" : "clean or unavailable"}`,
    "",
    "## Matched Triggers",
    ...triggers.map((trigger) => `- ${trigger.id}: ${trigger.label ?? trigger.id}`),
    "",
  ];

  if (warnings.length > 0) {
    lines.push("## Warnings", ...warnings.map((warning) => `- ${warning}`), "");
  }

  lines.push(
    "## Instructions",
    "- Explain the matched triggers and current project state first.",
    "- For `ask-before-execute` actions, ask the user before running commands or editing files.",
    "- For `auto-summarize-then-ask` actions, only perform read-only checks before asking whether to continue.",
    "- If an action declares memory writes, follow its update instructions after the user confirms completion.",
    "",
    "## Available Actions",
  );

  for (const action of actions) {
    lines.push(
      `### ${action.id}: ${action.label ?? action.id}`,
      `Mode: ${action.mode ?? "ask-before-execute"}`,
    );

    if (action.prompt) {
      lines.push("Prompt:", action.prompt);
    }

    if (action.runState?.enabled) {
      lines.push(
        "Run state:",
        `- Key: ${runStateKey(action)}`,
        `- Record on: ${action.runState.recordOn ?? "prompted"}`,
      );
    }

    const readTopics = action.memory?.read ?? [];
    if (readTopics.length > 0) {
      lines.push("Memory topics:");
      for (const topicId of readTopics) {
        const topic = memoryTopics.get(topicId);
        lines.push(`- ${topicId}: ${topic?.description ?? "(missing description)"}`);
        for (const record of topic?.records ?? []) {
          lines.push(`  - ${record.id}: ${record.title ?? record.status ?? JSON.stringify(record)}`);
          if (record.notes) lines.push(`    Notes: ${record.notes}`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export function listPreflightActions(cwd, options = {}) {
  const loaded = loadConfig(cwd);
  if (!loaded.config) {
    return { active: false, actions: [], triggers: [], warnings: loaded.warnings };
  }

  const config = loaded.config;
  if (config.enabled === false) {
    return { active: false, actions: [], triggers: [], warnings: [] };
  }

  const context = createContext(cwd, config, options);
  const triggers = matchTriggers(config, context);
  const configuredActionIds = Object.keys(config.actions ?? {});
  const matchedActionIds = collectActionIds(triggers);
  const actionIds = [...new Set([...configuredActionIds, ...matchedActionIds])];
  const loadedActions = loadActions(config, actionIds, cwd);
  const runState = loadRunState(cwd);
  const availableActionIds = new Set(
    filterActionsByRunState(loadedActions.actions, runState, context.now).map((action) => action.id),
  );
  const matchedActionIdSet = new Set(matchedActionIds);

  return {
    active: configuredActionIds.length > 0,
    triggers,
    warnings: [...loaded.warnings, ...loadedActions.warnings],
    actions: loadedActions.actions.map((action) => ({
      id: action.id,
      label: action.label ?? action.id,
      mode: action.mode ?? "ask-before-execute",
      matched: matchedActionIdSet.has(action.id),
      available: availableActionIds.has(action.id),
      promptFile: action.promptFile,
    })),
  };
}

export function buildPreflightActionPrompt(cwd, actionId, options = {}) {
  const loaded = loadConfig(cwd);
  if (!loaded.config) {
    return { active: false, prompt: "", warnings: loaded.warnings };
  }

  const config = loaded.config;
  if (config.enabled === false) {
    return { active: false, prompt: "", warnings: [] };
  }

  if (!Object.hasOwn(config.actions ?? {}, actionId)) {
    return { active: false, prompt: "", warnings: [`Action '${actionId}' is referenced but not defined.`] };
  }

  const context = createContext(cwd, config, options);
  const loadedActions = loadActions(config, [actionId], cwd);
  const action = loadedActions.actions[0];
  if (!action) {
    return { active: false, prompt: "", warnings: loadedActions.warnings };
  }

  const loadedMemory = loadMemoryTopics(config, [action], cwd);
  const warnings = [...loaded.warnings, ...loadedActions.warnings, ...loadedMemory.warnings];
  const prompt = composePrompt({
    config,
    context,
    triggers: [{ id: "manual", label: `Manual action: ${action.id}` }],
    actions: [action],
    memoryTopics: loadedMemory.topics,
    warnings,
  });

  if (options.recordRunState !== false) {
    recordPromptedActions(cwd, [action], context.now);
  }

  return { active: true, warnings, prompt };
}

export function buildPreflight(cwd, options = {}) {
  const loaded = loadConfig(cwd);
  if (!loaded.config) {
    return { prompt: "", active: false, warnings: loaded.warnings };
  }

  const config = loaded.config;
  if (config.enabled === false) {
    return { prompt: "", active: false, warnings: [] };
  }

  const context = createContext(cwd, config, options);
  const triggers = matchTriggers(config, context);
  if (triggers.length === 0) {
    return { prompt: "", active: false, warnings: [] };
  }

  const actionIds = collectActionIds(triggers);
  const loadedActions = loadActions(config, actionIds, cwd);
  const runState = loadRunState(cwd);
  const actions = filterActionsByRunState(loadedActions.actions, runState, context.now);
  if (actions.length === 0) {
    return { prompt: "", active: false, warnings: loadedActions.warnings };
  }

  const loadedMemory = loadMemoryTopics(config, actions, cwd);
  const warnings = [...loaded.warnings, ...loadedActions.warnings, ...loadedMemory.warnings];
  const prompt = composePrompt({
    config,
    context,
    triggers,
    actions,
    memoryTopics: loadedMemory.topics,
    warnings,
  });

  if (options.recordRunState !== false) {
    recordPromptedActions(cwd, actions, context.now);
  }

  return {
    active: actions.length > 0,
    warnings,
    prompt,
  };
}
