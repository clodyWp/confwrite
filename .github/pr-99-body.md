## Summary

为关键 bug 创建可复现的测试用例，使用 `ConfigurableMockExecutor` 模拟真实的 bug 场景。

## Changes

### 1. ConfigurableMockExecutor (`src/scheduler/configurable-mock-executor.ts`)

可配置的 Mock 执行器，支持模拟不同的 bug 场景：

```typescript
const executor = new ConfigurableMockExecutor(tempDir, {
  writer: {
    wordCount: 12000,        // 控制 Writer 生成的字数
    behavior: 'exceeds_limit', // normal | exceeds_limit | below_minimum
  },
  reviewer: {
    verdict: 'accept',
    contradictory: true,     // 是否产生 verdict 矛盾
    issues: ['字数超标 50%'],
  },
  fixer: {
    wordCount: 14000,
    behavior: 'over_compensate', // normal | over_compensate
  },
});
```

### 2. 可复现测试用例 (`tests/reproducible-bugs.test.ts`)

| Issue | 测试场景 | 配置 |
|-------|---------|------|
| #80 | Reviewer verdict 矛盾 | `reviewer.contradictory: true` |
| #96 | 字数截断恶性循环 | `fixer.behavior: 'over_compensate'` |
| #42 | Writer 字数控制 | `writer.wordCount: 10000` |

## Test Results

```
✓ tests/reproducible-bugs.test.ts (4 tests) 50ms
  ✓ Issue #80: Reviewer verdict 矛盾
  ✓ Issue #96: 字数截断方案导致恶性循环
  ✓ Issue #42: Writer 生成符合字数要求的内容
  ✓ Issue #42: Writer 生成超过字数上限的内容
```

## Benefits

1. **可复现**：使用 Mock 模拟真实 bug 场景
2. **快速**：不需要真实 LLM 调用，测试在 50ms 内完成
3. **稳定**：不依赖网络，不会超时
4. **可扩展**：可以轻松添加新的 bug 场景

## Related Issues

Closes #98

## Test Plan

- [x] 创建 `ConfigurableMockExecutor`
- [x] 创建 4 个可复现测试用例
- [x] 测试全部通过
- [ ] 集成到 CI
- [ ] 文档化
