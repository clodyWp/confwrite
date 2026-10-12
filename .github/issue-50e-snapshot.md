## 背景

当前 `project-state.json` 通过 `store.save()` 原子覆盖，但没有历史记录。

断网场景下，如果需要恢复执行，无法知道"之前发生了什么"。

## 改进方案

每个 phase transition 时保存状态快照：

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

## 验收标准

- [ ] 每个 phase transition 保存快照
- [ ] 快照包含章节状态和任务列表
- [ ] 可以从快照恢复执行
- [ ] `npm run build && npm test` 通过
- [ ] 更新 CHANGELOG.md

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不要 mock `fs`，用临时目录
- 快照目录需要自动创建

## 参考

- Council 分析：Issue #50
- 当前实现：`src/orchestrator/state-machine.ts`
