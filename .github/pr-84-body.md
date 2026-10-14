## Summary

Fix Issue #80: Reviewer verdict 矛盾检查增强

## Problem

E2E v0.26.0 测试发现：ch006 检测到字数超标但 verdict 为 accept。

```
❌ verdict 矛盾: verdict 为 accept，但审阅报告中发现字数问题
```

## Root Cause

原 verdict 一致性检查只检查 issues 中的关键词，不检查独立字数验证结果：

```typescript
// 旧代码
if (parsed.verdict === 'accept' && Array.isArray(parsed.issues)) {
  const wordCountIssues = parsed.issues.filter(...);
  if (wordCountIssues.length > 0) {
    // 标记为验证失败
  }
}
```

如果 Reviewer 在 issues 中没有提到字数问题，但实际字数超标了，这个检查就不会触发。

## Solution

增强 verdict 一致性检查，同时检查 issues 和独立字数验证结果：

```typescript
// 新代码
if (parsed.verdict === 'accept') {
  // 检查 issues 中是否有字数相关问题
  let hasWordCountIssueInReport = false;
  // ...
  
  // 检查独立字数验证是否发现超标
  let hasWordCountOverLimit = false;
  // ...
  
  // 如果任一检查发现问题，标记为验证失败
  if (hasWordCountIssueInReport || hasWordCountOverLimit) {
    // 标记为验证失败
  }
}
```

## Changes

- `src/writing/output-validator.ts`: 增强 verdict 一致性检查
- `tests/writing/verdict-consistency-enhanced.test.ts`: 新增回归测试 (5 tests)

## Test Plan

- [x] 新增测试覆盖所有场景
- [x] 所有现有测试通过 (1402 tests)
- [ ] E2E 验证：verdict 矛盾被正确检测

Closes #80
