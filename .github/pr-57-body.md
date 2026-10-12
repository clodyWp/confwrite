## 关联 Issue

Closes #57

## 变更类型

- [x] 新功能
- [x] 测试

## 变更描述

实现 SM-18：每次 phase transition 时在 `logs/checkpoints/` 保存状态快照。

### 主要改动

1. **src/orchestrator/state-machine.ts**
   - 新增 `saveCheckpoint()` 方法
   - 在 `advance()` 开头调用，记录 from/to phases
   - 快照保存到 `logs/checkpoints/checkpoint-{timestamp}.json`
   - 包含 timestamp, from, to, chapters, tasks
   - try-catch 包裹：保存失败不影响主流程

2. **tests/orchestrator/state-snapshot.test.ts**
   - 6 个回归测试验证快照行为
   - 测试覆盖：快照创建、内容验证、多次 transition、错误处理

3. **specs/state-machine.md**
   - 新增 §3.9 状态快照
   - 添加 SM-18 不变量

### 技术细节

**快照格式**：
```json
{
  "timestamp": "2026-10-12T10:00:00.000Z",
  "from": "4a",
  "to": "4b",
  "chapters": { ... },
  "tasks": [ ... ]
}
```

**用途**：
- 支持断网恢复
- 支持执行历史回溯
- 便于调试问题

**性能影响**：
- 每次 phase transition 写入一个 JSON 文件
- 轻量级操作，不影响主流程
- 失败时静默处理

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] specs/state-machine.md 已更新（SM-18）
- [x] README.md 目录结构与实际一致
- [x] AGENTS.md 架构描述与代码一致

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1354 passed, 27 skipped）
- [x] 新增测试覆盖新功能（6 个测试用例）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不 mock fs，用临时目录
