# Feature: 可复现 Bug 测试用例

## 背景

当前 Issue 系统中有很多 CLOSED 的 bug issue，但实际上并没有真正解决。原因是：
1. 缺少可复现的测试用例
2. 测试只验证代码逻辑，不验证真实行为
3. E2E 测试成本高，无法频繁运行

## 目标

创建一套可复现的 Bug 测试用例，使用 `ConfigurableMockExecutor` 模拟真实的 bug 场景。

## 实现方案

### 1. ConfigurableMockExecutor

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

### 2. 测试用例

为每个关键 bug 创建可复现的测试：

| Issue | 测试场景 | 配置 |
|-------|---------|------|
| #80 | Reviewer verdict 矛盾 | `reviewer.contradictory: true` |
| #96 | 字数截断恶性循环 | `fixer.behavior: 'over_compensate'` |
| #42 | Writer 字数控制 | `writer.wordCount: 10000` |

### 3. 测试文件

- `src/scheduler/configurable-mock-executor.ts` - 可配置 Mock 执行器
- `tests/reproducible-bugs.test.ts` - 可复现 Bug 测试用例

## 验收标准

- [x] 创建 `ConfigurableMockExecutor`
- [x] 创建 4 个可复现测试用例
- [x] 测试全部通过
- [ ] 集成到 CI
- [ ] 文档化

## 优先级

**高** - 这是解决"CLOSED 但未真正解决"问题的关键。

## 相关 Issue

- #42: LLM 不遵守字数约束
- #80: Reviewer verdict 矛盾
- #96: 字数截断方案导致恶性循环
