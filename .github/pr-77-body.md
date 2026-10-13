## Summary

Fix Issue #74: Round 文件名不匹配导致审阅循环

## Problem

E2E v0.25.0 测试发现：审阅流程陷入死循环，所有章节最终 failed。

**根本原因**：Task ID 和审阅文件查找使用不同的 round 变量。

- Task 创建使用 `state.round`（全局 round）
- 文件查找使用 `chapter.round`（章节 round）
- 两者不同步导致审阅文件找不到，系统默认返回 'revise'，继续循环

## Solution

统一使用 `chapter.round`：

1. `dispatchReviewers` 中为每个章节使用其自己的 `chapter.round`
2. `dispatchFixers` 中同样使用 `chapter.round`
3. 确保 task ID 和文件查找使用相同的 round 变量

## Changes

- `src/dispatcher/index.ts`: 修改 `dispatchReviewers` 和 `dispatchFixers` 使用 `chapter.round`
- `tests/dispatcher/round-consistency.test.ts`: 新增回归测试

## Test Plan

- [x] 新增测试覆盖 reviewer 和 fixer 的 round 一致性
- [x] 所有现有测试通过 (1383 tests)
- [ ] E2E 验证：审阅流程不再陷入死循环

Closes #74
