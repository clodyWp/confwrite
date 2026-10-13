## 问题描述

E2E 测试 v9 中发现：DIAG 日志（DIAG-PROMPT, DIAG-REVIEW, DIAG-DISPATCHER, DIAG-WORD BUDGET）通过 console.log 直接输出到 TUI，淹没了 subagent 状态信息。

## 症状

1. TUI 中充斥着 DIAG 日志
2. 无法看到 subagent 状态（🚀 Writer, 🔧 Fixer）
3. 用户体验差

## 根因

`src/dispatcher/index.ts` 和 `src/writing/task-executor.ts` 中使用 console.log 直接输出 DIAG 日志：

- `src/dispatcher/index.ts` 第 80 行：DIAG-DISPATCHER
- `src/dispatcher/index.ts` 第 102 行：DIAG-WORD BUDGET
- `src/dispatcher/index.ts` 第 160 行：DIAG-REVIEW
- `src/writing/task-executor.ts` 第 398 行：DIAG-PROMPT

## 修复方案

1. **将 console.log 改为通过 EventBus 发送 diag 事件**
2. **确保 diag 事件写入 JSONL 日志文件**
3. **确保 diag 事件不输出到 TUI**

## 不变量

DIAG 日志应该只在日志文件中，不应该输出到 TUI。

## 测试要求

- DIAG 事件通过 EventBus 发送
- DIAG 事件写入 JSONL 日志文件
- DIAG 事件不输出到 TUI
