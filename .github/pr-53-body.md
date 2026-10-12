## 关联 Issue

Closes #53

## 变更类型

- [x] 新功能
- [x] 测试

## 变更描述

实现 SM-17 不变量：为所有关键状态变化 emit 事件。

之前 `src/logging/types.ts` 定义了 15 个事件类型，但只有 4 个被实际 emit。本次补全了其余 11 个事件类型的 emit 调用：

| 事件类型 | emit 位置 |
|---------|----------|
| `phase.transition` | `state-machine.ts` advance() |
| `chapter.status` | `writing/orchestrator.ts` updateChapterStatus() |
| `chapter.failed` | `writing/orchestrator.ts` |
| `round.exceeded` | `writing/orchestrator.ts` |
| `diagram.scan` | `diagrams/pipeline.ts` |
| `diagram.generate` | `diagrams/pipeline.ts` |
| `tool.call` | `scheduler/pi-executor.ts` |
| `budget.warning` | `scheduler/pi-executor.ts` |
| `budget.exceeded` | `scheduler/pi-executor.ts` |
| `loop.detected` | `scheduler/pi-executor.ts` |
| `stats.progress` | `scheduler/runner.ts` |

EventBus 实例现在传递到 StateMachine、WritingOrchestrator、PiSubagentExecutor。

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] specs/state-machine.md 已更新（SM-17）
- [x] README.md 目录结构与实际一致
- [x] AGENTS.md 架构描述与代码一致

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1348 passed, 27 skipped）
- [x] 新增测试覆盖新功能（12 个测试用例）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不 mock fs，用临时目录
