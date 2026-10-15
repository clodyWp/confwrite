# E2E Testing Skill 行为规格

**版本**: v1.0  
**创建日期**: 2026-10-14  
**状态**: Draft

## 1. 概述

E2E Testing Skill 定义了如何在远端机器上执行 ConfWrite 端到端测试的流程规范。

**核心目标**：
- 验证 ConfWrite 状态机的完整执行
- 验证 write-review-fix 循环的正确性
- 检测并报告任何偏离预期行为的问题

## 2. 角色定义

### 2.1 本地端（分析者 + 指挥者）

**职责**：
- 通过 herdr 控制远端 pi
- 发送明确的命令（使用 `/confwrite:write <slug>` 格式）
- 监控远端 pi 的行为
- 检测偏离并尝试纠正
- 收集日志并分析

**不变量**：
- `LOCAL-1`: 本地端必须发送明确的命令，不省略必要参数
- `LOCAL-2`: 本地端必须在每次命令后检查远端执行结果
- `LOCAL-3`: 本地端必须检测远端 pi 的偏离行为
- `LOCAL-4`: 本地端必须尝试纠正偏离，如果失败则记录问题

### 2.2 远端端（纯执行者）

**职责**：
- 只运行 `/confwrite:*` 命令
- 像人工用户一样使用插件

**禁止行为**：
- `REMOTE-1`: 禁止读取源码
- `REMOTE-2`: 禁止分析日志
- `REMOTE-3`: 禁止检测 bug
- `REMOTE-4`: 禁止输出思考过程
- `REMOTE-5`: 禁止直接调用 ConfWrite API（如 `runWriteLoop`）
- `REMOTE-6`: 禁止手动实现写作逻辑（如直接写章节文件）

## 3. 流程规格

### 3.1 命令执行流程

**前置条件**：
- `PRE-1`: HERDR_ENV = 1
- `PRE-2`: 远端 pane 已创建且状态为 idle
- `PRE-3`: ConfWrite 已安装在远端

**命令格式**：
```
/confwrite:init <slug>           # slug 必需
/confwrite:organize [slug]       # slug 可选
/confwrite:outline <slug> <template> [words]  # slug 必需
/confwrite:write [slug]          # slug 可选
/confwrite:status [slug]         # slug 可选
/confwrite:export <slug> <fmt>   # slug 必需
```

**不变量**：
- `CMD-1`: 所有命令必须使用正确的参数格式
- `CMD-2`: 命令执行后必须等待 idle 状态或检查输出
- `CMD-3`: 命令失败时必须记录错误并尝试纠正

### 3.2 状态机触发验证

**前置条件**：
- 项目已初始化（project-state.json 存在）
- 素材已整理（assets/data-baseline.json 存在）
- 大纲已生成（outline.md 存在）

**不变量**：
- `SM-1`: `/confwrite:write` 必须触发状态机
- `SM-2`: 状态机必须按顺序执行 Phase 转换
- `SM-3`: Phase 4a 必须创建 writer subagent 任务
- `SM-4`: Phase 4b 必须创建 reviewer subagent 任务
- `SM-5`: Phase 4d 必须创建 fixer subagent 任务（如果有 revise）

### 3.3 日志收集规格

**必须收集的文件**：
- `LOG-1`: project-state.json（项目状态）
- `LOG-2`: confwrite-log.jsonl（事件日志）
- `LOG-3`: subagent-*.log（subagent 日志，如果存在）

**不变量**：
- `LOG-4`: 所有日志文件必须保存到本地 e2e-logs/ 目录
- `LOG-5`: 日志文件必须完整（不能截断）

### 3.4 分析规格

**必须分析的事件**：
- `ANALYZE-1`: phase.transition（Phase 转换）
- `ANALYZE-2`: chapter.status（章节状态变化）
- `ANALYZE-3`: task.complete（任务完成）
- `ANALYZE-4`: task.fail（任务失败）
- `ANALYZE-5`: diag.wordbudget（字数诊断）

**不变量**：
- `ANALYZE-6`: 必须检测所有 Phase 转换是否正确
- `ANALYZE-7`: 必须检测所有章节是否完成
- `ANALYZE-8`: 必须检测所有任务失败并分析原因

## 4. 偏离检测规格

### 4.1 偏离类型

| 类型 | 症状 | 检测方法 |
|------|------|---------|
| **API 调用** | 远端 pi 直接调用 runWriteLoop | 检查命令历史 |
| **手动实现** | 远端 pi 直接写章节文件 | 检查文件创建时间 |
| **命令跳过** | 远端 pi 跳过某些命令 | 检查命令执行顺序 |
| **错误处理** | 远端 pi 在命令失败后选择其他方法 | 检查错误后的行为 |

### 4.2 偏离处理

**不变量**：
- `DETECT-1`: 必须在每个命令执行后检查偏离
- `DETECT-2`: 检测到偏离后必须尝试纠正
- `DETECT-3`: 纠正失败后必须记录问题
- `DETECT-4`: 偏离记录必须包含：类型、症状、时间、处理结果

## 5. 测试覆盖规格

### 5.1 必须验证的功能

| 功能 | 验证方法 | 不变量 |
|------|---------|--------|
| Phase 0a: 初始化 | 检查 project-state.json | `COV-1` |
| Phase 0b: 素材整理 | 检查 assets/data-baseline.json | `COV-2` |
| Phase 1: 需求分析 | 检查 assets/requirements.json | `COV-3` |
| Phase 2: 大纲规划 | 检查 outline.md | `COV-4` |
| Phase 4a: 写作 | 检查 writer 任务 | `COV-5` |
| Phase 4b: 审阅 | 检查 reviewer 任务 | `COV-6` |
| Phase 4d: 修复 | 检查 fixer 任务 | `COV-7` |
| Phase 6: 组装 | 检查 assembly/merged-v1.md | `COV-8` |
| Phase 7: 定稿 | 检查 output/finalization.json | `COV-9` |
| Phase 8: 导出 | 检查 output/final.docx | `COV-10` |

### 5.2 覆盖率计算

```
覆盖率 = 已验证功能数 / 总功能数 × 100%
```

**不变量**：
- `COV-11`: 覆盖率必须 >= 80% 才算测试通过
- `COV-12`: 核心功能（Phase 4a-4d）必须 100% 覆盖

## 6. 报告规格

### 6.1 报告内容

**必须包含**：
- `REPORT-1`: 测试日期、版本、项目信息
- `REPORT-2`: 覆盖率统计
- `REPORT-3`: 发现的问题列表
- `REPORT-4`: 每个问题的详细信息（类型、严重度、症状、根因）

### 6.2 Issue 创建

**不变量**：
- `ISSUE-1`: 代码 bug 必须创建 GitHub Issue
- `ISSUE-2`: 文档问题直接修改文档，不创建 Issue
- `ISSUE-3`: Issue 必须包含：标题、描述、复现步骤、期望行为、实际行为

## 7. 不变量汇总

| ID | 类别 | 描述 |
|----|------|------|
| LOCAL-1 | 本地端 | 必须发送明确的命令 |
| LOCAL-2 | 本地端 | 必须检查执行结果 |
| LOCAL-3 | 本地端 | 必须检测偏离 |
| LOCAL-4 | 本地端 | 必须尝试纠正偏离 |
| REMOTE-1~6 | 远端端 | 禁止行为 |
| PRE-1~3 | 前置条件 | 环境准备 |
| CMD-1~3 | 命令执行 | 命令格式和处理 |
| SM-1~5 | 状态机 | 状态机触发和转换 |
| LOG-1~5 | 日志收集 | 日志文件收集 |
| ANALYZE-1~8 | 分析 | 事件分析 |
| DETECT-1~4 | 偏离检测 | 偏离检测和处理 |
| COV-1~12 | 覆盖率 | 功能覆盖 |
| REPORT-1~4 | 报告 | 报告内容 |
| ISSUE-1~3 | Issue | Issue 创建 |

## 8. 测试验证

**验证方法**：
- 单元测试：验证每个不变量
- 集成测试：验证完整流程
- 回归测试：验证修复后的行为

**测试文件**：
- `tests/e2e-testing/spec-invariants.test.ts` - 验证所有不变量
- `tests/e2e-testing/workflow.test.ts` - 验证完整流程

## 9. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-10-14 | v1.0 | 初始版本 |
