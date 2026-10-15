---
name: e2e-testing
description: End-to-end testing for ConfWrite projects. Use when the user wants to run a full E2E test, verify the complete workflow, or test a specific project on a remote machine.
---

# E2E Testing for ConfWrite

A discipline for running end-to-end tests on ConfWrite projects. This skill covers the complete workflow from initialization to final export.

## Core Principle: Separation of Concerns

**本地 pi（分析者 + 指挥者）**：
- 通过 herdr 控制远端 pi
- 收集日志文件
- 分析日志、检测 bug、生成报告
- 创建 GitHub Issue
- **必须发送明确的命令**：使用 `/confwrite:write <slug>` 格式，不要省略 slug 参数
- **必须及时纠正偏离**：发现远端 pi 未执行命令或选择错误操作时，立即停止并纠正

**远端 pi（纯执行者）**：
- 只运行 `/confwrite:*` 命令
- 像人工用户一样使用插件
- **禁止**：读取源码、分析日志、检测 bug、输出思考过程

**注意**：远端 pi 是独立的实例，本地端无法直接控制它的行为。如果远端 pi 偏离预期（如直接调用 API），本地端需要：
1. 检测到偏离
2. 发送纠正命令（如 `请执行 /confwrite:write <slug>`）
3. 如果纠正失败，记录问题并继续监控

---

## Phase -1: Determine Verification Scope

**Purpose**: Identify which PRs need to be verified in this E2E test.

### -1.1 Read Last E2E State

```bash
# 本地执行
cat e2e-regression/last-e2e-state.json
```

**Expected content**:
```json
{
  "version": "v0.24.0",
  "commit": "962f09c",
  "timestamp": "2026-10-13T05:00:00Z",
  "verifiedPRs": ["#63", "#65", "#66"],
  "projectDir": "/home/water/proj/c4/projects/e2e-v24"
}
```

### -1.2 Get Pending PRs

```bash
# 本地执行
bash e2e-regression/scripts/get-pending-prs.sh
```

### -1.3 Define Verification Goals

Based on the pending PRs and previous issues, define what needs to be verified:

```markdown
## 本次 E2E 验证目标

### 待验证的 PR（自上次 E2E 以来）

| PR | Title | Change | Verification Method |
|----|-------|--------|--------------------|
| #68 | 字数控制策略改进 | Reviewer/Fixer prompt | 检查最终字数是否在上限范围内 |
| #69 | E2E skill 增加验证范围追踪 | Tracking mechanism | 追踪文件是否正确更新 |

### 已知问题回归检查

| Issue ID | Description | Status in Last E2E | Check Method |
|----------|-------------|-------------------|--------------|
| WORD-COUNT-001 | 所有章节超出字数上限 39%-84% | Fixed in #68 | 检查最终字数是否在预算范围内 |

### 验证成功标准
- [ ] 所有待验证 PR 的改动被测试覆盖
- [ ] 已知问题没有复现
- [ ] 完整流程正常完成
```

---

## Phase 0: Prepare Remote Environment

**Purpose**: Setup remote environment and verify ConfWrite version.

### 0.1 Verify Herdr Connection

```bash
# 本地执行：检查 herdr 环境
test "${HERDR_ENV:-}" = 1 && echo "Herdr OK" || echo "Not in Herdr"
```

### 0.2 Discover Remote Pane

```bash
# 本地执行：列出当前 workspace 的所有 pane
herdr pane list --workspace "$HERDR_WORKSPACE_ID"
```

**Expected output** (JSON):
```json
{
  "panes": [
    {
      "pane_id": "w1:p1",
      "label": "remote-pi",
      "agent": "pi",
      "agent_status": "idle"
    }
  ]
}
```

**If no remote pane exists**, create one:
```bash
# 本地执行：创建新 pane 并启动远端 pi
herdr pane split --current --direction right --no-focus
# 从 JSON 响应中读取 pane_id
herdr pane rename <returned-pane-id> "remote-pi"
herdr pane run <returned-pane-id> "pi"
# 等待 pi 启动
herdr wait agent-status <returned-pane-id> --status idle --timeout 30000
```

### 0.3 Verify Remote Environment

```bash
# 本地执行：通过 herdr 在远端运行命令
herdr pane run <remote-pane-id> "node --version && npm --version"
herdr wait output <remote-pane-id> --match "v[0-9]" --timeout 10000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 20
```

### 0.4 Check ConfWrite Version

```bash
# 本地执行：检查远端 ConfWrite 版本
herdr pane run <remote-pane-id> "cd <project-dir> && npm list confwrite"
herdr wait output <remote-pane-id> --match "confwrite@" --timeout 10000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 10
```

### 0.5 Environment Checklist

- [ ] Herdr connection verified (`HERDR_ENV=1`)
- [ ] Remote pane discovered or created
- [ ] Remote pi is idle and ready
- [ ] ConfWrite version matches expected

---

## Phase 1: Execute Workflow (Remote)

**Purpose**: Run ConfWrite workflow on remote machine. Remote pi only executes commands, no analysis.

### 1.1 Send Command to Remote

**Pattern**: Use `herdr pane run` to send commands, then wait for completion.

```bash
# 本地执行：发送命令到远端（<slug> 是必需参数，如项目名 smoke-test）
herdr pane run <remote-pane-id> "/confwrite:init <slug>"

# 等待命令执行完成（检测 TUI 回到 idle 状态）
herdr wait agent-status <remote-pane-id> --status idle --timeout 120000

# 读取执行结果
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50
```

### 1.2 Phase-by-Phase Execution

**Phase 0a: Initialization**
```bash
# 本地执行（<slug> 是必需参数，如项目名 smoke-test）
herdr pane run <remote-pane-id> "/confwrite:init <slug>"
herdr wait agent-status <remote-pane-id> --status idle --timeout 120000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50
```

**Phase 0b: Material Organization**
```bash
# 本地执行（slug 可选，不传则使用当前目录）
herdr pane run <remote-pane-id> "/confwrite:organize [slug]"
herdr wait agent-status <remote-pane-id> --status idle --timeout 300000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50
```

**Phase 1-2: Requirements + Outline**
```bash
# 本地执行（需要 slug + template，targetWords 可选；outline 是 waitPoint，需要用户确认）
herdr pane run <remote-pane-id> "/confwrite:outline <slug> <template> [targetWords]"
herdr wait agent-status <remote-pane-id> --status idle --timeout 300000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50
```

**模板选项**: `technical-proposal`, `bid-document`

**Phase 4: Writing Cycle**
```bash
# 本地执行（slug 可选；这是最耗时的阶段）
herdr pane run <remote-pane-id> "/confwrite:write [slug]"
# 不要等待完成，进入监控循环（Phase 2）
```

### 1.3 Monitor Progress (Local)

**Recommended Pattern**: Use `herdr wait agent-status` instead of polling.

```bash
# 本地执行：等待远端完成（最长等待 1 小时）
herdr wait agent-status <remote-pane-id> --status idle --timeout 3600000

# 读取执行结果
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50
```

**Alternative Polling Pattern** (if wait is not available):
```bash
# 本地执行：定期检查远端状态
while true; do
  # 读取远端 TUI 输出
  herdr pane read <remote-pane-id> --source recent-unwrapped --lines 30
  
  # 检查是否完成
  if herdr pane get <remote-pane-id> | jq -e '.agent_status == "idle"'; then
    echo "Remote pi is idle - phase may be complete"
    break
  fi
  
  sleep 60
done
```

### 1.4 Wait Points

Some phases require user confirmation (waitPoints). When remote pi stops and shows a prompt:

```bash
# 本地执行：读取远端输出，检查是否需要确认
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 50

# 如果看到 "Press Enter to continue" 或类似提示
# 注意：pane run 发送文本和 Enter 一起，空字符串会发送 Enter
herdr pane run <remote-pane-id> ""
```

**注意**：如果远端 pi 没有响应，可以尝试：
1. 重新发送 `/confwrite:write <slug>` 命令
2. 检查远端 pi 是否卡在 waitPoint
3. 记录问题并继续监控

### 1.5 Execution Checklist

- [ ] Phase 0a: init completed
- [ ] Phase 0b: organize completed
- [ ] Phase 1-2: outline generated (waitPoint confirmed)
- [ ] Phase 4: writing cycle completed
- [ ] Phase 5-6: assembly completed (waitPoint confirmed)
- [ ] Phase 7-8: export completed (if requested)

### 1.6 监控与纠正（本地端职责）

**本地端必须持续监控远端 pi 的行为**：

1. **命令执行监控**：
   - 每次发送命令后，检查远端 pi 是否执行了正确的命令
   - 如果远端 pi 没有执行命令，立即重新发送
   - 如果远端 pi 执行了错误的命令，尝试发送纠正命令

2. **偏离检测与纠正**：
   - 检查远端 pi 是否直接调用了 API（如 `runWriteLoop`）
   - 检查远端 pi 是否手动实现了写作逻辑（如直接写章节文件）
   - 如果发现偏离，尝试发送纠正命令：`请执行 /confwrite:write <slug>`
   - **注意**：远端 pi 可能不响应纠正命令，此时应记录问题并继续监控

3. **waitPoint 处理**：
   - 当状态机在 waitPoint 暂停时，本地端应发送 `/confwrite:write <slug>` 继续
   - 如果远端 pi 没有响应，可以尝试发送空行或重新发送命令

**关键原则**：
- 远端 pi 是独立的实例，本地端无法直接控制它的行为
- 本地端的职责是监控、检测偏离、尝试纠正
- 如果纠正失败，记录问题并继续测试，不要中断整个流程

---

## Phase 2: Collect Logs (Local)

**Purpose**: Collect log files from remote for local analysis.

### 2.1 Collect Project State

```bash
# 本地执行：通过 scp 收集 project-state.json
scp <remote-host>:<project-dir>/project-state.json ./e2e-logs/
```

**If scp not available**, use herdr to read file content:
```bash
# 本地执行：通过 herdr 读取远端文件
herdr pane run <remote-pane-id> "cat <project-dir>/project-state.json"
herdr wait output <remote-pane-id> --match '"currentPhase"' --timeout 10000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 200 > ./e2e-logs/project-state.json
```

### 2.2 Collect JSONL Logs

```bash
# 本地执行：收集事件日志
scp <remote-host>:<project-dir>/logs/confwrite-log.jsonl ./e2e-logs/
```

**Alternative via herdr**:
```bash
# 本地执行
herdr pane run <remote-pane-id> "cat <project-dir>/logs/confwrite-log.jsonl"
herdr wait output <remote-pane-id> --match '"event"' --timeout 30000
herdr pane read <remote-pane-id> --source recent-unwrapped --lines 1000 > ./e2e-logs/confwrite-log.jsonl
```

### 2.3 Collect Subagent Logs

```bash
# 本地执行：收集所有 subagent 日志
scp <remote-host>:<project-dir>/logs/subagent-*.log ./e2e-logs/
```

### 2.4 Collection Checklist

- [ ] project-state.json collected
- [ ] confwrite-log.jsonl collected
- [ ] subagent-*.log files collected
- [ ] All files saved to ./e2e-logs/

---

## Phase 3: Analyze Logs (Local)

**Purpose**: Analyze collected logs locally to detect bugs and verify PR coverage.

### 3.1 Parse Project State

```bash
# 本地执行：分析项目状态
cat ./e2e-logs/project-state.json | jq '{
  phase: .currentPhase,
  status: .status,
  chapters: (.chapters | to_entries | map({
    id: .key,
    status: .value.status,
    round: .value.round,
    consecutiveFailures: .value.consecutiveFailures,
    wordBudget: .value.wordBudget,
    type: .value.type
  }))
}'
```

### 3.2 Detect Phase Transitions

```bash
# 本地执行：提取 phase 转换事件
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "phase.transition") |
  "\(.timestamp) | \(.event.from) → \(.event.to)"
' | sort
```

### 3.3 Detect Chapter Status Changes

```bash
# 本地执行：提取章节状态变化
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "chapter.status") |
  "\(.timestamp) | \(.event.chapterId) | \(.event.from) → \(.event.to)"
' | sort
```

### 3.4 Detect Word Count Issues

```bash
# 本地执行：检查字数诊断信息（事件类型为 diag.wordbudget）
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "diag.wordbudget") |
  "\(.event.chapterId) | budget: \(.event.wordBudget) | source: \(.event.source)"
' | sort

# 也可通过 project-state.json 检查最终字数状态和失败次数
cat ./e2e-logs/project-state.json | jq -r '
  .chapters | to_entries[] |
  "\(.key) | round: \(.value.round) | failures: \(.value.consecutiveFailures) | budget: \(.value.wordBudget)"
'
```

### 3.5 Detect Task Failures

```bash
# 本地执行：检查任务失败
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "task.fail") |
  "\(.event.taskId) | \(.event.taskType) | \(.event.chapterId) | \(.event.error) | retry: \(.event.willRetry)"
'
```

### 3.6 Verify PR Coverage

```bash
# 本地执行：检查待验证 PR 的改动是否被测试
# 例如：PR #68 (字数控制) - 检查是否有 reviewer 任务完成
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "task.complete" and .event.taskType == "reviewer") |
  .event.chapterId
' | wc -l
# 如果 > 0，说明 reviewer 被调用，PR #68 的改动被测试

# 也可检查所有已完成任务的类型分布
cat ./e2e-logs/confwrite-log.jsonl | jq -r '
  select(.event.type == "task.complete") |
  "\(.event.taskType) | \(.event.chapterId)"
' | sort
```

### 3.7 Analysis Checklist

- [ ] Project state parsed
- [ ] Phase transitions verified (no stuck phases)
- [ ] Chapter status changes verified (all chapters completed)
- [ ] Word count checked (no severe overages)
- [ ] Task failures analyzed (if any)
- [ ] PR coverage verified (all pending PRs tested)

---

## Phase 4: Generate Report (Local)

**Purpose**: Generate test report and create GitHub issues for bugs found.

### 4.1 Classify Bugs

Based on log analysis, classify bugs:

| Category | Symptoms | Example |
|----------|----------|---------|
| **State Machine** | Phase stuck, invalid transitions | Phase 4a exits with reviewed status |
| **Task Scheduling** | Tasks not spawned, wrong order | Fixer tasks not spawned for all chapters |
| **Validation** | Word count failures, format errors | All chapters exceed word limit |
| **Logging** | Missing events, wrong format | DIAG logs flood TUI |

### 4.2 Generate Test Report

Create `E2E-TEST-REPORT-<version>.md`:

```markdown
# E2E Test Report - <version>

**Test Date**: <date>
**Test Project**: <project-name>
**ConfWrite Version**: <version>
**Dataset**: <dataset-name>

## Summary

- **Status**: ✅ Pass / ❌ Fail
- **Duration**: <duration>
- **Chapters**: <count>
- **Final Word Count**: <count>

## Verification Scope

### Pending PRs (Since Last E2E)

| PR | Title | Change | Verification Method | Status |
|----|-------|--------|--------------------|--------|
| #68 | 字数控制策略改进 | Reviewer/Fixer prompt | Word count checked | ✅ Verified |

### Known Issues Regression Check

| Issue ID | Description | Status in Last E2E | Current Status | Notes |
|----------|-------------|-------------------|----------------|-------|
| WORD-COUNT-001 | 所有章节超出字数上限 39%-84% | Fixed in #68 | ✅ Not Regressed | 字数在预算范围内 |

## Phase Transitions

| Phase | Started | Completed | Duration |
|-------|---------|-----------|----------|
| 0a    | <time>  | <time>    | <dur>    |
| ...   | ...     | ...       | ...      |

## Issues Found

### Issue 1: <title>
- **Severity**: High/Medium/Low
- **Category**: <category>
- **Description**: <description>
- **Evidence**: <log excerpt>
- **GitHub Issue**: #<number>

## Recommendations

- <recommendation-1>
- <recommendation-2>
```

### 4.3 Create GitHub Issues

```bash
# 本地执行：为发现的 bug 创建 issue
gh issue create \
  --title "Bug: <category> - <symptom>" \
  --body "<bug-description>" \
  --label "bug,<severity>"
```

### 4.4 Update Tracking File

```bash
# 本地执行：更新 last-e2e-state.json
bash e2e-regression/scripts/update-e2e-state.sh \
  v<version> \
  $(git rev-parse HEAD) \
  <project-dir> \
  '[{"id":"NEW-001","category":"validation","description":"新问题描述","severity":"medium","status":"open"}]'
```

### 4.5 Report Checklist

- [ ] Bugs classified
- [ ] Test report generated
- [ ] GitHub issues created (if bugs found)
- [ ] Tracking file updated
- [ ] Report committed to git

---

## Phase 5: Cleanup

### 5.1 Remote Cleanup (Optional)

```bash
# 本地执行：通过 herdr 清理远端
herdr pane run <remote-pane-id> "rm -rf <project-dir>/logs/*.log"
```

### 5.2 Local Cleanup

- [ ] Test results archived
- [ ] Test report committed
- [ ] Issues created for bugs found
- [ ] Success metrics recorded

---

## Herdr Command Reference

### Pane Control

```bash
# 列出所有 pane
herdr pane list --workspace "$HERDR_WORKSPACE_ID"

# 获取 pane 状态
herdr pane get <pane-id>

# 在 pane 中运行命令
herdr pane run <pane-id> "command"

# 读取 pane 输出
herdr pane read <pane-id> --source recent-unwrapped --lines 50

# 重命名 pane
herdr pane rename <pane-id> "label"
```

### Wait Commands

```bash
# 等待 agent 状态变化
herdr wait agent-status <pane-id> --status idle --timeout 30000

# 等待特定输出
herdr wait output <pane-id> --match "pattern" --timeout 10000
```

### Read Sources

- `visible`: 当前渲染的视口
- `recent`: 最近的滚动缓冲区（包含软换行）
- `recent-unwrapped`: 最近的滚动缓冲区（软换行已连接，适合日志和转录）
- `detection`: agent 检测使用的底部缓冲区快照

---

## Anti-Patterns

**Don't**:
- ❌ 让远端 pi 分析日志或检测 bug
- ❌ 让远端 pi 读取 ConfWrite 源码
- ❌ 让远端 pi 输出思考过程
- ❌ 在远端生成测试报告
- ❌ 每次现场分析 herdr 命令（使用本 skill 预定义的模式）

**Do**:
- ✅ 远端 pi 只运行 `/confwrite:*` 命令
- ✅ 本地 pi 收集日志并分析
- ✅ 本地 pi 生成测试报告
- ✅ 使用 herdr 预定义命令模式
- ✅ 定期收集日志到本地

---

## Checklist: E2E Test Complete

- [ ] Remote environment prepared
- [ ] All phases executed on remote
- [ ] Logs collected to local
- [ ] Logs analyzed locally
- [ ] Bugs detected and classified
- [ ] Test report generated
- [ ] GitHub issues created (if bugs found)
- [ ] Tracking file updated
- [ ] Results archived
