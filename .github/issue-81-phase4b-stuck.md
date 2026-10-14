## Summary

E2E v0.26.0 测试发现：当所有章节都 failed 时，Phase 4b 无法退出，状态机卡在 reviewing 状态。

## Problem

所有 7 个章节都因为 exceeded_max_rounds_validation 而 failed 后，Phase 4b 仍然卡在 reviewing 状态：

```
Error: ⛔ 审阅: 没有已写好的章节需要审阅
```

状态机无法前进到 Phase 4c 或 done。

## Root Cause

Phase 4b 的退出条件没有考虑所有章节 failed 的情况：
- 退出条件可能是：所有 written 状态的章节都被审阅
- 但当所有章节都 failed 时，没有 written 状态的章节
- 导致 Phase 4b 无法退出

## Suggested Fix

1. 增加退出条件：当所有章节都 failed 或 completed 时退出 Phase 4b
2. 增加错误处理：当没有 written 状态的章节时，退出 Phase 4b 并报告错误
3. 增加状态机不变量：SM-20: Phase 4b 必须在所有章节都 failed/completed 时退出

## E2E Evidence

- Test version: v0.26.0
- Project: e2e-v26
- All 7 chapters failed with exceeded_max_rounds_validation
- Phase 4b stuck in reviewing status
