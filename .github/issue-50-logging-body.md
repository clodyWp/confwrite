## 背景

当前日志系统存在架构缺陷，无法有效支持远程 E2E 测试和断网场景的问题分析。

### Council 分析结论（2026-10-12）

两位 advisor 独立验证后发现：

**最致命问题**：`src/logging/types.ts` 定义了 15 个事件类型，但只有 4 个被实际 emit（`task.start/complete/fail` + `ratelimit`）。其余 11 个类型有 formatter 但从未使用，日志系统是**骨架**而非坏掉的实现。

**其他问题**：
1. `confwrite-log.json` 全量重写（每个事件触发 `JSON.stringify(logEntries)`）
2. DIAG 日志绕过 EventBus，形成碎片化
3. 无原子写入（Windows 崩溃可能产生 0 字节文件）
4. 无状态快照（phase transition 时无历史记录）

## 改进目标

### P0: 补全事件 emit（2-3 天）

在以下位置添加 `eventBus.emit()` 调用：

| 文件 | 需 emit 的事件 | 触发时机 |
|------|---------------|---------|
| `src/orchestrator/phases.ts` | `phase.transition` | 每个 phase 的 `execute()` 入口 |
| `src/orchestrator/state-machine.ts` | `phase.transition` | `advance()` 方法 |
| `src/writing/orchestrator.ts` | `chapter.status` | `updateChapterStatus()` |
| `src/dispatcher/index.ts` | `chapter.status` | 任务完成后更新状态 |
| `src/scheduler/runner.ts` | `tool.call`, `budget.*`, `loop.*` | 工具调用/预算/循环检测 |
| `src/writing/orchestrator.ts` | `chapter.failed`, `round.exceeded` | 失败/超限处理 |

**验收标准**：
- [ ] 15 个事件类型全部有 emit 调用
- [ ] 远程 E2E 测试可以从日志重建完整执行流程
- [ ] 日志包含 phase transition 时间线

### P1: 整合 DIAG 日志（0.5 天）

**选项 A**（推荐）：迁移到 EventBus
- `dispatcher/index.ts:83` 的 DIAG 日志改为 `eventBus.emit()`
- 统一日志输出格式

**选项 B**：保持独立但文档化
- 如果 DIAG 需要在 EventBus 初始化前工作，保持独立
- 在 `AGENTS.md` 中明确说明两套日志的用途

**验收标准**：
- [ ] DIAG 日志与 EventBus 的关系明确
- [ ] 无重复记录（同一事件不在两处都记录）

### P1: JSONL 增量日志（0.5 天）

**当前问题**：
```typescript
// src/logging/index.ts:88
writeFileSync(logPath, JSON.stringify(this.logEntries, null, 2));
```
每个事件触发全量重写，O(n²) I/O。

**改进方案**：
```typescript
// 改为 JSONL（JSON Lines）追加模式
appendFileSync(logPath, JSON.stringify(event) + '\n');
```

**验收标准**：
- [ ] 日志文件改为 `.jsonl` 格式
- [ ] 每个事件追加写入（不重写）
- [ ] 可以用 `grep`/`tail` 查询

### P2: 原子写入（0.5 天）

**当前问题**：Windows 上 `writeFileSync` 崩溃可能产生 0 字节文件。

**改进方案**：
```typescript
// 写入临时文件，然后原子 rename
const tempPath = logPath + '.tmp';
writeFileSync(tempPath, content);
renameSync(tempPath, logPath);
```

**验收标准**：
- [ ] 日志写入使用 temp + rename
- [ ] 崩溃后日志文件不为 0 字节

### P2: 状态快照（1 天）

**当前问题**：`project-state.json` 原子覆盖，无历史记录。

**改进方案**：
```typescript
// src/orchestrator/state-machine.ts — advance()
const snapshot = {
  timestamp: new Date().toISOString(),
  from: state.currentPhase,
  to: target,
  chapters: { ...state.chapters },
};
writeFileSync(
  join(projectDir, 'logs', 'checkpoints', `checkpoint-${Date.now()}.json`),
  JSON.stringify(snapshot, null, 2)
);
```

**验收标准**：
- [ ] 每个 phase transition 保存快照
- [ ] 快照包含章节状态和任务列表
- [ ] 可以从快照恢复执行

## 实施顺序

1. **P0: 补全事件 emit**（最致命，工作量最大）
2. **P1: JSONL 增量**（性能改进）
3. **P1: 整合 DIAG**（统一日志）
4. **P2: 原子写入**（崩溃恢复）
5. **P2: 状态快照**（断网恢复）

## 文档更新检查清单

- [ ] `AGENTS.md` 更新日志系统说明
- [ ] `DESIGN.md` 更新日志架构图
- [ ] `CHANGELOG.md` 添加版本条目
- [ ] `specs/state-machine.md` 添加日志相关不变量（如需要）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest（describe/it/expect）
- 不要 mock `fs`，用临时目录
- 改完代码必须 `npm run build && npm test`

## 参考

- Council 分析：`docs/research/logging-council-2026-10-12.md`（待创建）
- 当前日志实现：`src/logging/`
- DIAG 日志：`dispatcher/index.ts:83`, `writing/task-executor.ts:68`
