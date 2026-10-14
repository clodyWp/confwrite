## Summary

Fix Issue #79: Writer 字数控制 - 硬性截断机制

## Problem

E2E v0.26.0 测试发现：所有 7 章节字数超标 5%-71%，尽管 PR #78 改进了 prompt。

| 章节 | 实际字数 | 上限 | 超标比例 |
|------|---------|------|---------|
| ch001 | 12581 | 8000 | +57% |
| ch002 | 9970 | 7800 | +28% |
| ch003 | 13319 | 7800 | +71% |
| ch004 | 8178 | 7800 | +5% |
| ch005 | 12278 | 7800 | +57% |
| ch006 | 12132 | 7800 | +55% |
| ch007 | 11948 | 8000 | +49% |

## Root Cause

Prompt 改进不够强，Writer 仍然倾向于"充分展开"，导致字数超标。

## Solution

添加硬性字数截断机制：

1. **触发条件**：当字数超标超过 20% 时自动截断
2. **截断策略**：
   - 优先在段落结尾处截断（两个换行符）
   - 其次在句子结尾处截断（。！？.!?）
   - 最后直接截断
3. **截断标记**：添加 `<!-- 内容已截断以符合字数要求 -->`

```typescript
// 当字数超标超过 20% 时
const excessRatio = (charCount - wordBudget.max) / wordBudget.max;
if (excessRatio > 0.2) {
  const truncated = this.truncateContent(content, wordBudget.max);
  if (truncated) {
    writeFileSync(filePath, truncated, 'utf-8');
    // 记录截断信息
  }
}
```

## Changes

- `src/writing/output-validator.ts`: 添加硬性字数截断机制
- `tests/writing/word-count-truncation.test.ts`: 新增回归测试 (4 tests)

## Test Plan

- [x] 新增测试覆盖所有场景
- [x] 所有现有测试通过 (1406 tests)
- [ ] E2E 验证：字数超标被自动截断

Closes #79
