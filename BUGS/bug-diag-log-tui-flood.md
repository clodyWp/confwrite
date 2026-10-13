# Bug: DIAG日志回显到TUI淹没subagent状态显示

**日期**: 2026-10-13  
**发现时间**: E2E测试v9进行中  
**严重程度**: 中  
**状态**: 待修复

## 问题描述

在E2E测试v9中，发现远端Pi的TUI被大量DIAG诊断日志淹没，导致无法看到原本设计的subagent状态显示。

## 现象

### 1. TUI输出被淹没

远端Pi的TUI显示大量如下格式的诊断信息：
```
[DIAG-WORD BUDGET] chapterId=ch006, wordBudget={"min":5200,"max":7800}...
[DIAG-WORD BUDGET] chapterId=ch007, wordBudget={"min":5200,"max":7800}...
[DIAG-WORD BUDGET] chapterId=ch008, wordBudget={"min":5200,"max":7800}...
```

### 2. subagent状态不可见

原本设计的subagent状态显示（如任务进度、并发数、状态变化等）被这些诊断日志淹没，用户无法在TUI中看到。

## 根本原因

### 1. DIAG日志通过notify输出到TUI

在 `src/logging/index.ts` 的 `handleEvent()` 方法中：

```typescript
private handleEvent(event: LogEvent): void {
  if (this.disposed) return;

  // 更新统计
  this.updateStats(event);

  // 格式化并输出
  const result = Logger.format(event);
  this.notify(result.message, result.level);  // ← 所有事件都通过notify输出

  // 追加日志到文件（JSONL 增量写入 + 原子写入，LOG-1）
  this.appendLog(event);
}
```

所有事件（包括 `diag.wordbudget`、`diag.taskexecutor` 等DIAG事件）都通过 `notify()` 输出到TUI。

### 2. DIAG事件设计初衷

DIAG事件是在 Issue #55 中引入的，目的是：
- 替代原先直接写入 `diag-wordbudget.json` 和 `diag-task-executor.json` 的方式
- 通过EventBus统一传递诊断信息
- 便于日志查询和分析

但这些诊断信息**不应该**输出到用户界面的TUI。

## 影响

1. **用户体验差**: TUI被大量技术细节淹没，无法看到关键的业务状态
2. **调试困难**: 真正需要关注的subagent状态变化被掩盖
3. **日志冗余**: 诊断信息应该只写入文件，不应该实时显示

## 建议修复方案

### 方案1: 区分事件类型，选择性notify

```typescript
private handleEvent(event: LogEvent): void {
  if (this.disposed) return;

  this.updateStats(event);
  
  // DIAG事件只写文件，不输出到TUI
  if (!event.type.startsWith('diag.')) {
    const result = Logger.format(event);
    this.notify(result.message, result.level);
  }

  this.appendLog(event);
}
```

### 方案2: 配置化日志级别

在 `FileLogConfig` 中增加 `notifyLevel` 配置：

```typescript
export interface FileLogConfig {
  enabled: boolean;
  projectDir: string;
  filename?: string;
  notifyLevel?: 'all' | 'info' | 'warning' | 'error' | 'none';
}
```

默认设置为 `'info'`，DIAG事件使用 `'debug'` 级别，不通过notify输出。

### 方案3: 事件分类

将事件分为两类：
- **用户可见事件**: task.start, task.complete, phase.transition 等
- **诊断事件**: diag.* 系列，只写文件不显示

## 相关文件

- `src/logging/index.ts`: LoggingSystem.handleEvent()
- `src/logging/types.ts`: LogEvent 类型定义
- `src/dispatcher/index.ts`: DIAG事件发射点

## 测试验证

修复后需要验证：
1. DIAG事件仍然写入 `confwrite-log.jsonl`
2. DIAG事件不通过notify输出到TUI
3. 其他事件（task.*, phase.*）正常显示在TUI
4. subagent状态显示恢复正常

## 备注

此bug是在E2E测试v9中发现的，当时正在验证日志系统改进（JSONL格式、状态快照）是否正常工作。日志系统本身工作正常，但DIAG事件的输出策略需要调整。
