## Summary

Fix Issue #81: Phase 4b 无法退出当所有章节 failed (SM-20)

## Problem

E2E v0.26.0 测试发现：当所有章节都 failed 时，Phase 4b 卡在 reviewing 状态无法退出。

```
Error: ⛔ 审阅: 没有已写好的章节需要审阅
```

## Root Cause

Phase 4b 的退出条件要求 `hasProgress`（至少一个 completed 或 reviewed）：

```typescript
const hasProgress = chapters.some(ch => ['completed', 'reviewed'].includes(ch.status));
return !needsReview && hasProcessed && hasProgress;
```

但当所有章节都 failed 时，没有 completed 或 reviewed 的章节，导致退出条件不满足。

## Solution

修改退出条件，当所有章节都处于终态（completed/failed/skipped）时也可以退出：

```typescript
const allTerminal = chapters.every(ch => ['completed', 'failed', 'skipped'].includes(ch.status));
const hasReviewed = chapters.some(ch => ch.status === 'reviewed');
// 满足以下任一条件即可退出：
// 1. 没有章节需要审阅，且有章节已审阅（正常流程）
// 2. 所有章节都处于终态（completed/failed/skipped）
return !needsReview && (hasReviewed || allTerminal);
```

## Changes

- `specs/state-machine.md`: 添加 SM-20 不变量
- `src/orchestrator/phases.ts`: 修改 Phase 4b 退出条件
- `tests/orchestrator/phase4b-exit-condition.test.ts`: 新增回归测试 (7 tests)

## Test Plan

- [x] 新增测试覆盖所有场景（正常流程 + E2E v26 回归场景）
- [x] 所有现有测试通过 (1397 tests)
- [ ] E2E 验证：所有章节 failed 时 Phase 4b 能正常退出

Closes #81
