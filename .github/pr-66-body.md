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
   - DIAG-DISPATCHER → `diag.dispatcher`
   - DIAG-WORD BUDGET → `diag.wordbudget`
   - DIAG-REVIEW → `diag.review`
   - DIAG-PROMPT → `diag.prompt`

2. **修改 LoggingSystem.handleEvent() 过滤 diag 事件**
   - diag 事件只写入 JSONL 日志文件
   - diag 事件不输出到 TUI

3. **添加新的 diag 事件类型定义和格式化方法**
   - `DiagDispatcherEvent`
   - `DiagPromptEvent`
   - `DiagReviewEvent`

## 测试覆盖

- ✅ DIAG 事件通过 EventBus 发送
- ✅ DIAG 事件写入 JSONL 日志文件
- ✅ DIAG 事件不输出到 TUI
- ✅ 所有现有测试通过

## 变更文件

- `src/logging/types.ts` - 新增 3 个 diag 事件类型
- `src/logging/logger.ts` - 新增 3 个 diag 事件格式化方法
- `src/logging/index.ts` - 修改 handleEvent() 过滤 diag 事件
- `src/dispatcher/index.ts` - 修改 3 处 console.log → EventBus emit
- `src/writing/task-executor.ts` - 修改 1 处 console.log → EventBus emit

Closes #65
