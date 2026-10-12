## 关联 Issue

Closes #55

## 变更类型

- [x] 新功能
- [x] 重构
- [x] 测试

## 变更描述

将 DIAG 日志从独立文件写入改为通过 EventBus emit 事件。

**之前**：DIAG 日志直接写入 `logs/diag-wordbudget.json` 和 `logs/diag-task-executor.json`
**之后**：DIAG 日志通过 EventBus emit `diag.wordbudget` 和 `diag.taskexecutor` 事件，统一捕获到 `confwrite-log.jsonl`

### 主要改动

1. **src/dispatcher/index.ts**
   - 移除直接 writeFileSync 调用
   - 改为 `eventBus.emit({ type: 'diag.wordbudget', ... })`

2. **src/writing/task-executor.ts**
   - 移除直接 writeFileSync 调用
   - 改为 `eventBus.emit({ type: 'diag.taskexecutor', ... })`

3. **src/logging/types.ts**
   - 添加 `DiagWordBudgetEvent` 类型
   - 添加 `DiagTaskExecutorEvent` 类型

4. **src/logging/logger.ts**
   - 添加 `formatDiagWordBudget()` 方法
   - 添加 `formatDiagTaskExecutor()` 方法

5. **src/index.ts**
   - 传递 `loggingSystem.eventBus` 给 Dispatcher 和 TaskExecutor

6. **specs/module-contracts.md**
   - 添加 LOG-4 不变量：DIAG 日志必须通过 EventBus emit

7. **tests/logging/diag-integration.test.ts**
   - 4 个新测试覆盖 DIAG 日志整合

### 统一日志查询

所有 DIAG 数据现在都在 `confwrite-log.jsonl` 中：

```bash
# 查找 wordBudget 传递
grep '"type":"diag.wordbudget"' logs/confwrite-log.jsonl

# 查找 task-executor 诊断
grep '"type":"diag.taskexecutor"' logs/confwrite-log.jsonl
```

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] specs/module-contracts.md 已更新（LOG-4）
- [x] README.md 目录结构与实际一致
- [x] AGENTS.md 架构描述与代码一致

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1340 passed, 27 skipped）
- [x] 新增测试覆盖新功能（4 个测试用例）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不 mock fs，用临时目录
