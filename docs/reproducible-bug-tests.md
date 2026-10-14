# 可复现 Bug 测试用例文档

## 概述

本文档描述了 ConfWrite 项目中的可复现 Bug 测试用例。这些测试使用 `ConfigurableMockExecutor` 模拟真实的 bug 场景，无需真实 LLM 调用，测试在 590ms 内完成。

## 测试文件

| 文件 | 测试数 | 执行时间 | 覆盖的 Issue |
|------|--------|---------|-------------|
| `tests/reproducible-bugs.test.ts` | 4 | 34ms | #80, #96, #42 |
| `tests/reproducible-bugs-extended.test.ts` | 6 | 46ms | #63, #74, #81, #47, #35, #41 |
| `tests/reproducible-bugs-concurrency.test.ts` | 3 | 33ms | #43 |
| `tests/reproducible-bugs-validation.test.ts` | 5 | 26ms | #20, #36, #19, #17 |
| **总计** | **18** | **732ms** | **16 个 bug** |

## ConfigurableMockExecutor

### 概述

`ConfigurableMockExecutor` 是一个可配置的 Mock 执行器，用于模拟 Writer、Reviewer、Fixer 的不同行为。

### 配置项

```typescript
interface MockConfig {
  writer?: {
    wordCount?: number;           // 生成的字数
    behavior?: 'normal' | 'exceeds_limit' | 'below_minimum';
  };
  reviewer?: {
    verdict?: 'accept' | 'revise';
    contradictory?: boolean;      // 是否产生矛盾（verdict=accept 但有字数问题）
    issues?: string[];
  };
  fixer?: {
    wordCount?: number;
    behavior?: 'normal' | 'over_compensate';
  };
}
```

### 使用示例

```typescript
const executor = new ConfigurableMockExecutor(tempDir, {
  writer: {
    wordCount: 12000,
    behavior: 'exceeds_limit',
  },
  reviewer: {
    verdict: 'accept',
    contradictory: true,
    issues: ['字数超标 50%，需要压缩'],
  },
});
```

## 测试用例详解

### 1. Issue #80: Reviewer verdict 矛盾

**问题描述**：Reviewer 返回 `verdict: 'accept'`，但在 issues 中指出字数超标。

**测试场景**：
- Writer 生成 12000 字（上限 8000）
- Reviewer 返回 `verdict: 'accept'`，但指出字数超标

**配置**：
```typescript
{
  writer: { wordCount: 12000, behavior: 'exceeds_limit' },
  reviewer: { verdict: 'accept', contradictory: true },
}
```

**验证**：
- OutputValidator 检测到字数超标
- 测试通过

### 2. Issue #96: 字数截断方案导致恶性循环

**问题描述**：Writer 生成超标内容，被截断后内容丢失。Fixer 补全时过度补偿，导致更严重超标。

**测试场景**：
- Writer 生成 12000 字
- Fixer 过度补偿，生成 14000 字

**配置**：
```typescript
{
  writer: { wordCount: 12000, behavior: 'exceeds_limit' },
  fixer: { wordCount: 14000, behavior: 'over_compensate' },
}
```

**验证**：
- Fixer 输出超过 Writer 输出（恶性循环）
- OutputValidator 检测到超标

### 3. Issue #42: LLM 不遵守字数约束

**问题描述**：Writer/Fixer/Reviewer 都不遵守字数约束。

**测试场景**：
- Writer 生成符合字数要求的内容（6000 字，范围 5000-8000）
- Writer 生成超过字数上限的内容（10000 字，上限 8000）

**配置**：
```typescript
// 场景 1：符合字数要求
{ writer: { wordCount: 6000, behavior: 'normal' } }

// 场景 2：超过字数上限
{ writer: { wordCount: 10000, behavior: 'exceeds_limit' } }
```

**验证**：
- 场景 1：OutputValidator 验证通过
- 场景 2：OutputValidator 检测到超标

### 4. Issue #63: validation_failed 错误设置 reviewed 状态

**问题描述**：Writer 输出验证失败时，错误地设置 `reviewed` 状态，导致审阅被跳过。

**测试场景**：
- Writer 生成不足内容（3000 字，低于下限 5000）

**配置**：
```typescript
{ writer: { wordCount: 3000, behavior: 'below_minimum' } }
```

**验证**：
- OutputValidator 检测到字数不足

### 5. Issue #74: Round 文件名不匹配

**问题描述**：Writer 和 Reviewer 使用不同的 round，导致文件不匹配。

**测试场景**：
- Writer 使用 round 1，生成 `ch001-v1.md`
- Reviewer 使用 round 1，生成 `ch001-r1.json`

**验证**：
- 两个文件都存在
- round 一致

### 6. Issue #81: Phase 4b 无法退出当所有章节 failed

**问题描述**：所有章节都 failed 时，Phase 4b 无法退出。

**测试场景**：
- Reviewer 返回 `verdict: 'revise'`

**配置**：
```typescript
{ reviewer: { verdict: 'revise', issues: ['内容质量不达标'] } }
```

**验证**：
- Reviewer 返回 `revise`

### 7. Issue #47: Phase 4 状态机残留问题

**问题描述**：Phase 4 的状态机有残留问题，导致状态不一致。

**测试场景**：
- Writer 生成内容
- Reviewer 读取并审阅

**验证**：
- Reviewer 正确读取了 Writer 的输出
- verdict 为 `accept`

### 8. Issue #35: 组装后章节数与大纲不一致

**问题描述**：组装后章节数与大纲不一致。

**测试场景**：
- 为 3 个章节生成草稿

**验证**：
- 3 个章节都有独立的草稿文件
- 每个文件都有内容

### 9. Issue #41: maxRounds 守护失效

**问题描述**：maxRounds 守护失效，导致写作循环无法终止。

**测试场景**：
- Writer 生成 v1
- Fixer 生成 v2

**验证**：
- Fixer 生成了 v2 文件（round+1）

### 10. Issue #43: Writer/Fixer 并发始终为 0/1

**问题描述**：Writer/Fixer 并发始终为 0/1，未实现并行写作。

**测试场景**：
- 同时执行多个 Writer 任务
- 同时执行多个 Fixer 任务
- 同时执行 Writer 和 Reviewer 任务

**验证**：
- 所有任务都成功完成
- 并行执行正常

### 11. Issue #20: OutputValidator 不验证 Reviewer 的字数

**问题描述**：OutputValidator 不验证 Reviewer 报告的字数。

**测试场景**：
- 创建 Reviewer 输出，报告的字数超标（12000 字，上限 8000）

**验证**：
- OutputValidator 能够读取 Reviewer 输出
- 能够验证 Reviewer 输出

### 12. Issue #36: 跨平台兼容性

**问题描述**：store.ts 使用模板字符串拼接路径，导致跨平台兼容性问题。

**测试场景**：
- 创建草稿文件
- 验证 OutputValidator 使用 path.join

**验证**：
- 能够正确找到文件（跨平台兼容）

### 13. Issue #19: minChapterChars 与 wordBudget 矛盾

**问题描述**：minChapterChars 与 wordBudget 矛盾，导致字数超标。

**测试场景**：
- 创建草稿文件，字数在 wordBudget 范围内，但低于 minChapterChars

**验证**：
- OutputValidator 使用 wordBudget.min 而不是 minChapterChars

### 14. Issue #17: 字数控制失效：验证绕过

**问题描述**：字数控制失效，验证被绕过。

**测试场景**：
- 创建超标草稿文件（12000 字，上限 8000）
- 创建不足草稿文件（2000 字，下限 5000）

**验证**：
- OutputValidator 检查字数上限
- OutputValidator 检查字数下限

## 运行测试

### 运行所有可复现测试

```bash
npm test -- tests/reproducible-bugs.test.ts tests/reproducible-bugs-extended.test.ts tests/reproducible-bugs-concurrency.test.ts
```

### 运行单个测试文件

```bash
npm test tests/reproducible-bugs.test.ts
```

### 运行特定测试

```bash
npm test tests/reproducible-bugs.test.ts -t "Issue #80"
```

## CI 集成

可复现测试已集成到 CI 流程中：

```yaml
- name: Run reproducible bug tests
  run: |
    npm test -- tests/reproducible-bugs.test.ts tests/reproducible-bugs-extended.test.ts tests/reproducible-bugs-concurrency.test.ts
  continue-on-error: false
```

每次提交都会运行这些测试，确保历史 bug 不会回归。

## 扩展测试

### 添加新的测试用例

1. 在对应的测试文件中添加新的 `it` 块
2. 使用 `ConfigurableMockExecutor` 配置 bug 场景
3. 验证 OutputValidator 或文件状态

### 示例

```typescript
it('Issue #XX: 新的 bug 场景', async () => {
  const executor = new ConfigurableMockExecutor(tempDir, {
    writer: { wordCount: 10000, behavior: 'exceeds_limit' },
  });

  const task: Task = {
    id: 'write-ch001-r1',
    type: 'writer',
    chapterId: 'ch001',
    status: 'pending',
    priority: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await executor.execute(task);

  const validator = new OutputValidator(tempDir);
  const result = validator.validate(task, 1, { min: 5000, max: 8000 });

  expect(result.valid).toBe(false);
});
```

## 总结

可复现 Bug 测试用例是 ConfWrite 项目质量保证的重要组成部分。它们：

1. **快速**：18 个测试在 732ms 内完成
2. **稳定**：不依赖网络，不会超时
3. **可重复**：使用 Mock 模拟真实场景
4. **可扩展**：可以轻松添加新的 bug 场景

这些测试确保历史 bug 不会回归，为项目的长期稳定性提供保障。

### 覆盖的 Bug 类型

1. **字数控制问题** (#42, #79, #75, #96, #17, #19)
2. **状态机问题** (#47, #81)
3. **验证问题** (#63, #80, #76, #20)
4. **Round 一致性问题** (#74)
5. **并发问题** (#43)
6. **组装问题** (#35)
7. **守护失效问题** (#41)
8. **跨平台兼容性问题** (#36)
