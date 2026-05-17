# opencode-preflight

OpenCode 的專案可設定啟動前檢查提示。

[English](README.md)

這個套件是 OpenCode plugin 的本地 proof of concept，會根據專案內設定建立 startup prompt。它可以在顯示可執行啟動 action 前，檢查 git 狀態、branch 規則、路徑條件、時間區間、action prompt 檔、JSON memory，以及 action run state。

## 安裝

將 npm plugin 加到 OpenCode config：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@arthurhuang09/opencode-preflight"]
}
```

OpenCode 會從 global config (`~/.config/opencode/opencode.json`) 與 project config (`opencode.json`) 載入 npm plugins。npm plugins 會在 OpenCode 啟動時自動安裝。

此 repository 的本機開發安裝：

```sh
npm install
```

## 使用方式

1. 在 OpenCode config 的 `plugin` array 加入 `@arthurhuang09/opencode-preflight`。
2. 在目標專案啟動 OpenCode。
3. 從 active session 執行 `/preflight-config`，或要求 OpenCode 呼叫 `preflight_config` tool。
4. 檢查產生的 `.opencode/preflight.jsonc` 與 `.opencode/preflight/*` files。
5. 在該專案重啟 OpenCode，或開啟新的 OpenCode session。

當設定的 trigger 命中時，plugin 會建立 Startup Preflight session，並詢問要執行哪個已設定 action。標記為 `ask-before-execute` 的 actions 需要 user 確認後才會執行 commands 或編輯 files。

設定 `OPENCODE_PREFLIGHT_AUTOSTART=0` 可以停用自動 startup sessions，同時保留 tool 與 system prompt integration。

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
- `src/tui.js` 註冊 `/preflight-config` TUI command。

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

## Autostart 行為

設定 `OPENCODE_PREFLIGHT_AUTOSTART=0`，或 OpenCode 以 `-s`、`--session`、`--session=...` 啟動時，會跳過 autostart。

Startup prompt injection 使用 OpenCode SDK v2 transport，也就是 `client._client`；如果 transport 不存在，injection 會維持 no-op。

## 測試

測試使用 `node:test`，並建立隔離的暫存專案與 `.opencode/preflight` fixtures。`buildPreflight()` 預設會記錄 run state，因此需要可重複 prompt 的測試應傳入 `{ recordRunState: false }`，或使用新的暫存專案。
