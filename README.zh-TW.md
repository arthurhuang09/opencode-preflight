# opencode-preflight

OpenCode 的專案可設定啟動前檢查提示。

[English](README.md)

這個套件是 OpenCode plugin 的本地 proof of concept，會根據專案內設定建立 startup prompt。它可以在顯示可執行啟動 action 前，檢查 git 狀態、branch 規則、路徑條件、時間區間、action prompt 檔、JSON memory，以及 action run state。

## 安裝

在目標專案執行 initializer：

```sh
npx @arthurhuang09/opencode-preflight init
```

這會建立 `.opencode/opencode.json`、`.opencode/package.json` 與 `.opencode/plugins/preflight.js`，並在 `.opencode` 內安裝 npm package。它也會註冊 `/preflight-config`、`/preflight-action-list`、`/preflight-action-run` 與 `/preflight-action-edit`。這個 shim-based install 可以避開 OpenCode 對 scoped package 的 npm plugin loader 問題，同時仍使用 npm 上發布的 package。

如果想同時建立預設 preflight action files：

```sh
npx @arthurhuang09/opencode-preflight init --with-config
```

如果只想建立特定 default actions：

```sh
npx @arthurhuang09/opencode-preflight init --with-config --actions=project-readiness,task-progress-review
```

此 repository 的本機開發安裝：

```sh
npm install
```

## 使用方式

1. 在目標專案執行 `npx @arthurhuang09/opencode-preflight init`。
2. 在該專案啟動 OpenCode。
3. 從 active session 執行 `/preflight-config`，選擇要建立哪些 default actions，或要求 OpenCode 呼叫 `preflight_config` tool。
4. 檢查產生的 `.opencode/preflight.jsonc` 與 `.opencode/preflight/*` files。
5. 在該專案重啟 OpenCode，或開啟新的 OpenCode session。

當設定的 trigger 命中時，plugin 會建立 Startup Preflight session，並詢問要執行哪個已設定 action。標記為 `ask-before-execute` 的 actions 需要 user 確認後才會執行 commands 或編輯 files。

從 active session 可用 `/preflight-action-list` 檢查 matched triggers、configured actions、availability 與 warnings。使用 `/preflight-action-run` 選擇目前 available 的 action；被 run state suppress 的 actions 不會被當成可執行選項。使用 `/preflight-action-edit` 調整單一 action 的行為、prompt file、run state、memory 與 trigger references。

設定 `OPENCODE_PREFLIGHT_AUTOSTART=0` 可以停用自動 startup sessions，同時保留 tool 與 system prompt integration。

## 使用情境

- Default branch 啟動：當 OpenCode 在 `main` 或 `master` 啟動時，詢問是否要整理 issues、檢查專案啟動準備，或暫時略過。
- Feature branch 接續工作：當 OpenCode 在非 default branch 啟動時，先彙整最近 commits、worktree changes 與可能下一步，再詢問要接著做什麼。
- 每日或每小時例行檢查：用 time triggers 只在指定時間區間顯示 standup 準備、issue triage 或 dependency checks 等 recurring actions。
- 專案專屬啟動檢查：要求 `package.json`、`AGENTS.md` 或部署設定等檔案存在時，才提供 startup checklist。
- Memory-backed follow-up：載入 JSON-file memory topics，讓重複 issue review 可以記住等待 user 回覆、等待外部回覆或可關閉的項目。
- 降低提示噪音：使用 `runState.skipIfLastRunWithinHours`，避免例行 prompts 在短時間內重複出現。

## 指令

```sh
npm run lint
npm run typecheck
npm test
npm run build
node --test test/engine.test.js
```

`lint` 與 `typecheck` 使用 `node --check` 做 JavaScript syntax checks。`build` 執行 `npm pack --dry-run` 來確認 package contents。目前沒有設定 formatter。

## 套件入口

- `src/index.js` 是預設 OpenCode plugin entrypoint。
- `src/engine.js` 以 `opencode-preflight/engine` 匯出 preflight engine。
- `src/tui.js` 註冊 `/preflight-config`、`/preflight-action-list` 與 `/preflight-action-run` TUI commands。

## 運作方式

Engine 會讀取作用中專案的 `.opencode/preflight.jsonc`。當 trigger 命中時，它會載入設定的 actions、action prompt files、memory topics，並組出 OpenCode startup prompt。

支援的 trigger 條件包含：

- git 是否可用、是否在 worktree、dirty state，以及 branch rules
- 必須存在或缺少的專案路徑
- 可指定 timezone 的日期與時間區間

支援的 action 輸入包含：

- `promptFile` 內容
- 由 JSON file backing 的 `memory.read` topics
- 可略過近期已提示 actions 的 `runState` 規則

## 設定專案

使用 plugin tool `preflight_config` 或 `/preflight-config` command 建立預設專案設定檔：

```text
.opencode/preflight.jsonc
.opencode/preflight/actions/issue-review.md
.opencode/preflight/actions/issue-memory.md
.opencode/preflight/actions/project-readiness.md
.opencode/preflight/actions/task-progress-review.md
.opencode/preflight/memory.json
```

除非傳入 `force: true`，否則 tool 不會覆蓋既有檔案。

Default action templates 可選：`issue-review`、`project-readiness`、`task-progress-review`。如果沒有提供 action list，會建立全部 default templates。

## 手動安裝

如果不想使用 `npx`，可以自行建立這些檔案。

`.opencode/opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "command": {
    "preflight-config": {
      "description": "Create or repair OpenCode preflight config files",
      "template": "Ask which default OpenCode preflight actions to create: issue-review, project-readiness, task-progress-review, or all. Then call the preflight_config tool with the selected action ids. Do not overwrite existing files unless I confirm, then list created and skipped files."
    },
    "preflight-action-list": {
      "description": "List configured preflight actions and current status",
      "template": "Call the preflight_action_list tool and summarize the configured OpenCode preflight actions. This is status-only; do not run an action or ask me to choose one."
    },
    "preflight-action-run": {
      "description": "Choose and run an available preflight action",
      "template": "Call the preflight_action_list tool. If no actions are available, explain why and do not ask me to choose one. Otherwise use AskUserQuestion/question with the available action ids and `Do not run anything for now`. After I choose an action, call the preflight_action_prompt tool with that action id, then follow the returned prompt. For ask-before-execute actions, confirm before commands or edits."
    },
    "preflight-action-edit": {
      "description": "Edit a configured preflight action and its triggers",
      "template": "Help me edit one configured OpenCode preflight action. First read `.opencode/preflight.jsonc` and list the configured action ids. Ask which action to edit and what to change: behavior, prompt file, runState, memory, or trigger conditions/references. Then update only the relevant `.opencode/preflight.jsonc` fields and action prompt file. Do not run the action. After editing, summarize the changed files and behavior."
    }
  }
}
```

`.opencode/package.json`：

```json
{
  "type": "module",
  "dependencies": {
    "@arthurhuang09/opencode-preflight": "latest"
  }
}
```

`.opencode/plugins/preflight.js`：

```js
import preflight from "@arthurhuang09/opencode-preflight";

export default preflight;
```

接著在 `.opencode` 裡執行 `npm install`。

## TUI Commands

- `/preflight-config` 建立或修復專案內 preflight 設定檔。
- `/preflight-action-list` 列出 matched triggers、configured actions、run-state availability 與 warnings。
- `/preflight-action-run` 詢問要執行哪個目前 available 的 action。如果沒有可用 action，會說明原因，不會要求選擇不存在的 action。
- `/preflight-action-edit` 編輯單一 configured action 的行為、prompt file、run state、memory 與 trigger references，但不執行 action。

## Autostart 行為

設定 `OPENCODE_PREFLIGHT_AUTOSTART=0`，或 OpenCode 以 `-s`、`--session`、`--session=...` 啟動時，會跳過 autostart。

Startup prompt injection 使用 OpenCode SDK v2 transport，也就是 `client._client`；如果 transport 不存在，injection 會維持 no-op。

## 測試

測試使用 `node:test`，並建立隔離的暫存專案與 `.opencode/preflight` fixtures。`buildPreflight()` 預設會記錄 run state，因此需要可重複 prompt 的測試應傳入 `{ recordRunState: false }`，或使用新的暫存專案。
