## Summary

Issue #91: LLM 输出解析边界测试

### Changes
- 新增 `tests/writing/llm-parse-boundary.test.ts`（35 tests）
- 新增 spec `specs/llm-parse-boundary.md`

### Coverage

覆盖 4 个解析入口的边界行为：
- **E1**: `OutputValidator.tryFixJSON()` — JSON 修复能力
- **E2**: `TaskExecutor.parseReviewDecision()` — 三级 fallback（JSON → 文本 → 默认）
- **E3**: `WritingOrchestrator.parseReviewResult()` — 文件读取 + 文本 fallback
- **E4**: `LLMPlanner.parseResponse()` / `extractJSON()` — 大纲 JSON 解析

### 边界情况矩阵

| # | 输入 | 覆盖的不变量 |
|---|------|------------|
| 1 | 空 JSON 对象 `{}` | INV-PB-1 |
| 2 | Markdown 代码块包裹 | INV-PB-2 |
| 3 | 特殊字符（中文引号、emoji、CJK） | INV-PB-3 |
| 4 | 超大 JSON（>100KB） | INV-PB-4 |
| 5 | JSON 数组 | INV-PB-5 |
| 6 | 完全非 JSON 文本 | INV-PB-6 |
| 7 | JSON 注释（// 和 /* */） | INV-PB-7 |

### Notes
- 不修改现有代码，仅验证现有行为是否满足 spec
- 所有测试使用临时目录，不 mock fs

Closes #91
