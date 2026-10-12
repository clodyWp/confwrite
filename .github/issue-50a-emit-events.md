## 背景

`src/logging/types.ts` 定义了 15 个事件类型，但只有 4 个被实际 emit（`task.start/complete/fail` + `ratelimit`）。其余 11 个类型有 formatter 但从未使用，日志系统是骨架而非完整实现。

这导致远程 E2E 测试和断网场景下无法从日志重建完整执行流程。

## 需要 emit 的事件

| 文件 | 需 emit 的事件 | 触发时机 |
|------|---------------|---------|
| `src/orchestrator/phases.ts` | `phase.transition` | 每个 phase 的 `execute()` 入口 |
| `src/orchestrator/state-machine.ts` | `phase.transition` | `advance()` 方法 |
| `src/writing/orchestrator.ts` | `chapter.status` | `updateChapterStatus()` |
| `src/dispatcher/index.ts` | `chapter.status` | 任务完成后更新状态 |
| `src/scheduler/runner.ts` | `tool.call`, `budget.*`, `loop.*` | 工具调用/预算/循环检测 |
| `src/writing/orchestrator.ts` | `chapter.failed`, `round.exceeded` | 失败/超限处理 |

## 验收标准

- [ ] 15 个事件类型全部有 emit 调用
- [ ] 远程 E2E 测试可以从日志重建完整执行流程
- [ ] 日志包含 phase transition 时间线
- [ ] `npm run build && npm test` 通过
- [ ] 更新 CHANGELOG.md

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest（describe/it/expect）
- 不要 mock `fs`，用临时目录
- 改完代码必须 `npm run build && npm test`

## 参考

- Council 分析：Issue #50
- 当前日志实现：`src/logging/`
