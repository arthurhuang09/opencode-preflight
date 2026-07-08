#!/usr/bin/env node
import { initPreflightProject } from "./init.js";

function printUsage() {
  console.log(`Usage: opencode-preflight init [--force] [--no-install] [--with-config] [--actions=<ids>]\n\nOptions:\n  --force          Overwrite generated files and command entries\n  --no-install     Skip npm install in .opencode\n  --with-config    Also create default .opencode/preflight files\n  --actions=<ids>  Comma-separated default action ids for --with-config`);
}

const [, , command, ...args] = process.argv;
const actionArg = args.find((arg) => arg.startsWith("--actions="));
const actions = actionArg
  ?.slice("--actions=".length)
  .split(",")
  .map((action) => action.trim())
  .filter(Boolean);

if (command !== "init") {
  printUsage();
  process.exit(command ? 1 : 0);
}

const options = {
  force: args.includes("--force"),
  install: !args.includes("--no-install"),
  withConfig: args.includes("--with-config") || Boolean(actions?.length),
  actions,
};

try {
  const result = initPreflightProject(process.cwd(), options);
  console.log("OpenCode preflight init complete.");
  console.log(`Written: ${result.written.length ? result.written.join(", ") : "(none)"}`);
  console.log(`Skipped: ${result.skipped.length ? result.skipped.join(", ") : "(none)"}`);
  console.log("Commands: /preflight-config, /preflight-action-list, /preflight-action-run, /preflight-action-edit");
  if (result.warnings.length > 0) {
    console.log(`Warnings: ${result.warnings.join("; ")}`);
  }
  console.log("Restart OpenCode, then run /preflight-config if you did not use --with-config.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
