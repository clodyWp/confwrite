## Bug 描述

E2E v0.25.0 测试发现：审阅流程陷入死循环，所有章节最终 failed。

**根本原因**：Task ID 和审阅文件查找使用不同的 round 变量。

## 复现步骤

1. 运行 E2E 测试 (7 章节)
2. 进入 Phase 4b (审阅)
3. Round 1 审阅完成，6/7 章节 verdict = "accept"
4. 系统继续循环到 round 5
5. 所有章节 failed (exceeded_max_rounds_validation)

## 代码分析

**Task 创建** (dispatcher/index.ts):
```typescript
const taskId = `review-${chapterId}-r${state.round}`;  // 使用全局 state.round
```

**文件查找** (writing/orchestrator.ts):
```typescript
const reviewFile = `review/${chapterId}-r${chapter.round}.json`;  // 使用章节 chapter.round
```

**问题**：
- Round 1 后，`state.round` 保持为 1
- `chapter.round` 递增到 2, 3, 4, 5
- 查找 `ch001-r2.json` 时文件不存在
- 默认返回 'revise'，继续循环

## 修复方案

统一使用 `chapter.round`：

1. Task 创建时：`review-${chapterId}-r${chapter.round}`
2. 文件查找时：`review/${chapterId}-r${chapter.round}.json`

## 验收标准

- [ ] Task ID 和文件查找使用相同的 round 变量
- [ ] 审阅结果能正确解析
- [ ] 不会陷入死循环
- [ ] 单元测试覆盖

## 优先级

**Critical** - 阻塞整个审阅流程
