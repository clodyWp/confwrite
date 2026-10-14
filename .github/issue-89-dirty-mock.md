# Issue #87: P1 — Dirty Mock 模拟真实 LLM 脏输出的系统韧性测试

**父 Issue**: #86

## 问题

现有 `MockSubagentExecutor` 返回"完美"输出：
- Writer: 格式规范的 Markdown，字数精确达标，图表标记完整
- Reviewer: 合法 JSON，字段齐全
- Fixer: 正确追加修复内容

但真实 LLM 输出经常：
- 被 token 限制截断
- JSON 前后有大量解释文字
- 标题层级跳级（h2 → h4，缺 h3）
- 字数远低于预算（只写 30-50%）
- 图表标记不完整（有 `diagram-start` 没 `diagram-end`）
- 审阅报告返回畸形 JSON

**系统在面对这些脏输出时是否优雅降级？目前没有测试验证。**

## 方案

### 1. 新建 `tests/helpers/dirty-mock-executor.ts`

```typescript
export interface DirtinessConfig {
  /** 输出被截断（模拟 max_tokens 耗尽） */
  truncated?: boolean;
  /** JSON 外面包了多余解释文字 */
  extraTextAroundJson?: boolean;
  /** 标题层级混乱（跳级、缺 ##） */
  messyHeadings?: boolean;
  /** 字数不足预算 */
  underBudget?: { ratio: number };
  /** 图表标记不完整 */
  brokenDiagramMarkers?: boolean;
  /** 审阅报告返回畸形 JSON */
  malformedReviewJson?: boolean;
}

export class DirtyMockExecutor implements SubagentExecutor {
  // 根据配置生成"有毛病"的输出
}
```

### 2. 新建 `tests/resilience/` 目录，按场景分测试文件

```
tests/resilience/
  ├── truncated-output.test.ts       # 截断输出不崩溃
  ├── messy-headings.test.ts         # 标题层级混乱仍可组装
  ├── under-budget.test.ts           # 字数不足时触发重试/警告
  ├── broken-diagrams.test.ts        # 图表标记不完整时跳过
  ├── malformed-review.test.ts       # 畸形审阅 JSON 时降级
  └── extra-text-json.test.ts        # JSON 外有解释文字时提取
```

### 3. 每个测试验证的核心断言

| 场景 | 系统应该 | 不应该 |
|------|----------|--------|
| 截断输出 | output-validator 拦截，标记 validation_failed | 静默接受残缺内容进入组装 |
| 标题混乱 | assembler 仍能解析出章节 | throw 异常 |
| 字数不足 | content-validator 标记短节，触发 fix 循环 | 无限循环 |
| 图表标记不完整 | diagram extractor 跳过，warning 日志 | 崩溃或生成错误图片 |
| 畸形审阅 JSON | orchestrator 降级为 revise，不 throw | 静默当作 accept |
| JSON 外有文字 | 提取 JSON 部分，正常解析 | 解析失败 |

## 验收标准

- [ ] `DirtyMockExecutor` 支持 ≥ 6 种脏输出配置
- [ ] 每个脏输出场景有对应的 resilience 测试
- [ ] 所有测试通过（系统正确降级或拦截）
- [ ] 如果发现系统不能优雅降级的场景 → 开 follow-up bug issue

## 文档更新

- [ ] AGENTS.md §3.3 测试规范 — 添加 Dirty Mock 说明
- [ ] CHANGELOG.md — 添加条目

## 预估工时

2-3 小时
