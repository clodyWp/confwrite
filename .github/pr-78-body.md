## Summary

Fix Issue #75 & #76: 字数控制 prompt 改进

## Problem

E2E v0.25.0 测试发现：
1. **Issue #75**: Writer 字数控制不足 - 所有 7 章节字数超标 5%-71%
2. **Issue #76**: 审阅者 verdict 矛盾 - 检测到字数超标但 verdict 为 accept

## Solution

### Issue #75: Writer prompt 改进
- 添加字数控制策略（6 种压缩方法）
- 强调超过上限会被直接拒绝
- 提供明确的压缩指导

### Issue #76: Reviewer prompt 改进
- 强制字数超标时必须返回 revise
- 明确字数检查是硬性规则，不可违反
- 提供压缩策略建议

## Changes

- `src/writing/task-executor.ts`: 改进 Writer 和 Reviewer prompt
- `tests/writing/word-count-prompt-improvements.test.ts`: 新增回归测试 (7 tests)
- `tests/writing/word-count-control.test.ts`: 更新测试匹配新 prompt
- `tests/wave4-review-finalize.test.ts`: 更新测试匹配新 prompt

## Test Plan

- [x] 新增测试覆盖 prompt 改进
- [x] 所有现有测试通过 (1387 tests)
- [ ] E2E 验证：字数超标率降低

Closes #75
Closes #76
