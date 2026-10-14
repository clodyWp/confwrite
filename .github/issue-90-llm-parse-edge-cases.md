# Issue #91: P2 — LLM 输出解析边界测试

**父 Issue**: #86

## 问题

现有 `orchestrator-review-parse.test.ts` 只测了 4 种审阅结果：
- accept → completed
- revise → reviewed
- reject → pending + round+1
- invalid JSON → 降级为 revise

但真实 LLM 的审阅输出有更多变异形式，每种都可能触发 bug。

同样，`LLMPlanner.parseResponse()` 只测了 markdown code block 包裹，没测更畸形的情况。

## 方案

### 1. 审阅结果解析边界（扩展 `orchestrator-review-parse.test.ts`）

```typescript
describe('Review parsing — edge cases from real LLM', () => {
  it('JSON 前后有大量解释文字', () => {
    const result = `好的，我已经完成了审阅。以下是我的分析结果：

\`\`\`json
{"decision": "accept", "confidence": 0.85, "reasons": ["内容完整"]}
\`\`\`

希望这个结果对你有帮助！`;
    // 应该能提取出 JSON
  });

  it('JSON 字段名大小写不一致', () => {
    const result = '{"Decision": "accept", "CONFIDENCE": 0.9, "Reasons": []}';
    // 应该能容错
  });

  it('confidence 是字符串而非数字', () => {
    const result = '{"decision": "accept", "confidence": "0.9", "reasons": []}';
    // 应该能转换
  });

  it('reasons 是字符串而非数组', () => {
    const result = '{"decision": "accept", "confidence": 0.9, "reasons": "looks good"}';
    // 应该能包装成数组
  });

  it('JSON 被截断（token 耗尽）', () => {
    const result = '{"decision": "accept", "confidence": 0.9, "reas';
    // 应该降级处理，不 throw
  });

  it('空字符串', () => {
    // 应该降级，不 throw
  });

  it('decision 值不在枚举中', () => {
    const result = '{"decision": "maybe", "confidence": 0.5, "reasons": []}';
    // 应该降级为 revise
  });
});
```

### 2. LLMPlanner 响应解析边界（扩展 `llm-planner.test.ts`）

```typescript
describe('parseResponse — edge cases', () => {
  it('JSON 前有 BOM 标记', () => { ... });
  it('JSON 数组元素缺少可选字段', () => { ... });
  it('JSON 包含额外未知字段（应忽略）', () => { ... });
  it('response 是多个 JSON 拼接（应取第一个）', () => { ... });
  it('response 包含中文标点（如 "decision": "accept"）', () => { ... });
});
```

### 3. 如果发现解析器不支持某些边界

→ 修改解析器代码使其容错，同时测试覆盖。

## 涉及文件

| 源文件 | 测试文件 |
|--------|----------|
| `src/writing/orchestrator.ts` (updateChapterStatus) | `tests/writing/orchestrator-review-parse.test.ts` |
| `src/outline/llm-planner.ts` (parseResponse) | `tests/outline/llm-planner.test.ts` |
| `src/writing/task-executor.ts` (parseReviewDecision) | `tests/writing/task-executor.test.ts` |

## 验收标准

- [ ] 审阅解析边界测试 ≥ 7 个场景
- [ ] LLMPlanner 解析边界测试 ≥ 5 个场景
- [ ] 所有测试通过（解析器正确容错或降级）
- [ ] 如果修改了解析器代码 → build 通过 + 原有测试不回归

## 文档更新

- [ ] CHANGELOG.md — 添加条目

## 预估工时

1-2 小时
