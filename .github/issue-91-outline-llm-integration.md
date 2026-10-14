# Issue #90: P3 — OutlineGenerator LLM 路径集成测试

**父 Issue**: #86

## 问题

`OutlineGenerator.generate()` 有 3 级回退：

```
LLMPlanner（需要 llmCaller）→ AdaptiveOutlinePlanner → 模板方式
```

但在所有测试中，`OutlineGenerator` 从未注入 `llmCaller`：

```typescript
// 现有测试（generator.test.ts）
generator = new OutlineGenerator(projectDir);  // ← 没有 llmCaller
```

这意味着 LLMPlanner 路径从未在 OutlineGenerator 集成测试中走过。如果 LLMPlanner 和 OutlineGenerator 之间的数据传递有 bug，现有测试发现不了。

## 方案

### 在 `tests/outline/generator.test.ts` 中新增 describe 块

```typescript
describe('OutlineGenerator with LLM caller', () => {
  it('注入 LLMCaller 时优先走 LLMPlanner', async () => {
    const mockCaller = async (prompt: string) => {
      return JSON.stringify([
        { id: 'ch001', title: '概述', type: 'overview',
          description: '...', requirementSource: ['1'] },
        { id: 'ch002', title: '架构', type: 'architecture',
          description: '...', requirementSource: ['2'] },
      ]);
    };

    const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });
    const outline = await generator.generate('technical-proposal', requirements);

    expect(outline.chapters).toHaveLength(2);
    expect(outline.chapters[0].title).toBe('概述');
  });

  it('LLMCaller 抛异常时回退到 AdaptivePlanner', async () => {
    const failingCaller = async () => { throw new Error('LLM unavailable'); };
    const generator = new OutlineGenerator(projectDir, { llmCaller: failingCaller });

    // 应该不抛异常，回退到规则方式
    const outline = await generator.generate('technical-proposal', requirements);
    expect(outline.chapters.length).toBeGreaterThan(0);
  });

  it('LLM 返回无法解析的内容时回退', async () => {
    const badCaller = async () => 'I cannot help with document planning.';
    const generator = new OutlineGenerator(projectDir, { llmCaller: badCaller });

    const outline = await generator.generate('technical-proposal', requirements);
    expect(outline.chapters.length).toBeGreaterThan(0);  // 回退成功
  });

  it('LLM 返回空数组时回退', async () => {
    const emptyCaller = async () => '[]';
    const generator = new OutlineGenerator(projectDir, { llmCaller: emptyCaller });

    const outline = await generator.generate('technical-proposal', requirements);
    expect(outline.chapters.length).toBeGreaterThan(0);  // 回退成功
  });

  it('LLM 返回的章节缺少 wordBudget 时自动填充', async () => {
    const mockCaller = async () => JSON.stringify([
      { id: 'ch001', title: '概述', type: 'overview', description: '...' },
    ]);
    const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });
    const outline = await generator.generate('technical-proposal', requirements);

    expect(outline.chapters[0].wordBudget).toBeDefined();
    expect(outline.chapters[0].wordBudget!.min).toBeGreaterThan(0);
  });
});
```

## 涉及文件

| 源文件 | 测试文件 |
|--------|----------|
| `src/outline/generator.ts` | `tests/outline/generator.test.ts` |

## 验收标准

- [ ] ≥ 5 个 LLM 路径集成测试
- [ ] 覆盖：正常路径、异常回退、畸形输入回退、空结果回退
- [ ] 所有测试通过
- [ ] 如果回退逻辑有 bug → 修复后测试变绿

## 文档更新

- [ ] CHANGELOG.md — 添加条目

## 预估工时

1 小时
