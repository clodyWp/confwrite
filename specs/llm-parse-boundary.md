# Spec: LLM 输出解析边界测试

> Issue #91 — P2: LLM 输出解析边界测试
> 版本: v1.0 (2026-10-09)

## 1. 范围

本 spec 覆盖 ConfWrite 中所有解析 LLM 输出的 JSON 解析路径的边界行为。

### 涉及的解析入口

| 入口 | 文件 | 方法 | 输入来源 |
|------|------|------|----------|
| E1 | `src/writing/output-validator.ts` | `tryFixJSON()` | Reviewer 输出的 JSON 文件（磁盘） |
| E2 | `src/writing/task-executor.ts` | `parseReviewDecision()` | Reviewer 输出文本（内存字符串） |
| E3 | `src/writing/orchestrator.ts` | `parseReviewResult()` | Reviewer JSON 文件 + task.result 文本 |
| E4 | `src/outline/llm-planner.ts` | `parseResponse()` / `extractJSON()` | LLM 大纲规划响应 |

## 2. 不变量

### INV-PB-1: 空 JSON 对象

- **前置**: LLM 输出为 `{}` 或 `{"verdict": ""}`
- **预期行为**:
  - E1 (`tryFixJSON`): 解析成功，返回空对象 `{}`。后续 verdict 校验报 "verdict 无效: missing"
  - E2 (`parseReviewDecision`): 解析成功，verdict 缺失 → 返回默认 `{ decision: 'revise', confidence: 0.5, reasons: [] }`
  - E3 (`parseReviewResult`): verdict 为空/缺失 → fallback 到文本解析，最终返回 `{ decision: 'revise', confidence: 0, reasons: ['empty review result'] }` 或类似默认值
- **不应**: 抛出未捕获异常

### INV-PB-2: 嵌套 JSON（Markdown 代码块包裹）

- **前置**: LLM 输出包含 ` ```json\n{...}\n``` ` 包裹的 JSON
- **预期行为**:
  - E2: 正则 `/\{[\s\S]*\}/` 提取最外层 `{...}`，解析成功
  - E4: `extractJSON()` 从代码块中提取 JSON 字符串，解析成功
  - E1: 文件内容直接是 JSON（无代码块），正常解析
- **不应**: 因代码块标记导致解析失败

### INV-PB-3: 特殊字符（中文引号、转义字符、Unicode）

- **前置**: JSON 字符串值中包含 `""`（中文引号）、`\n`、`\t`、emoji、CJK 字符
- **预期行为**:
  - E1 (`tryFixJSON`): 中文引号 `""` 被移除（步骤 4），其余特殊字符由 `JSON.parse` 原生处理
  - E2: `JSON.parse` 原生处理转义字符，无需额外修复
- **风险**: 中文引号移除可能破坏字符串值内容（如 `"他说"你好""`→`"他说你好"`），但这是可接受的降级
- **不应**: 因特殊字符导致解析崩溃

### INV-PB-4: 超大 JSON（>100KB）

- **前置**: LLM 输出 JSON 体积超过 100KB（如 issues 数组含大量条目）
- **预期行为**:
  - 所有入口: `JSON.parse` 无内置大小限制，正常解析
  - 内存消耗在合理范围内（Node.js 默认堆上限 1.5GB+）
- **不应**: OOM 或超时（100KB 级别远低于 V8 限制）
- **注意**: 本 spec 不要求主动限制 JSON 大小，仅验证不崩溃

### INV-PB-5: JSON 数组（而非对象）

- **前置**: LLM 输出为 `[{...}, {...}]` 而非 `{...}`
- **预期行为**:
  - E1 (`tryFixJSON`): 解析成功返回数组。后续 `parsed.verdict` 为 `undefined` → verdict 校验失败
  - E2 (`parseReviewDecision`): 贪婪正则 `/\{[\s\S]*\}/` 匹配从第一个 `{` 到最后一个 `}` 的文本（如 `{"verdict":"accept"},{"verdict":"reject"}`），`JSON.parse` 抛出 SyntaxError → 被 catch → fallback 到文本正则 → 未匹配 → 返回默认 `{ decision: 'revise', confidence: 0.5, reasons: [] }`
  - E4 (`parseResponse`): 明确检查 `Array.isArray(parsed)` → 走数组处理路径（大纲场景正常）
- **不应**: 抛出未捕获异常

### INV-PB-6: 完全非 JSON 文本

- **前置**: LLM 输出为纯文本（无 JSON 结构），如 "我认为这章写得不错"
- **预期行为**:
  - E1 (`tryFixJSON`): 所有修复步骤失败 → 抛出 `Error('JSON 格式错误，无法修复')`，被 `validateReviewerOutput` 捕获为验证错误
  - E2 (`parseReviewDecision`): JSON 路径失败 → fallback 到文本正则匹配 `/**决定**: (accept|reject|revise)` 或 `/verdict["\s:]+(accept|reject|revise)/` → 未匹配则返回默认 `{ decision: 'revise' }`
  - E3 (`parseReviewResult`): JSON 解析失败 → fallback 文本解析 → 最终返回默认 revise
- **不应**: 抛出未捕获异常

### INV-PB-7: JSON 注释（// 和 /* */）

- **前置**: JSON 中包含 `// 注释` 或 `/* 注释 */`
- **预期行为**:
  - E1 (`tryFixJSON`): 步骤 2 移除注释后解析成功
  - E2 (`parseReviewDecision`): 直接 `JSON.parse` 失败（标准 JSON 不支持注释）→ fallback 到文本解析
- **注意**: E2 不处理注释，这是已知的降级行为

## 3. 边界情况矩阵

| # | 输入 | E1 tryFixJSON | E2 parseReviewDecision | E3 parseReviewResult | E4 parseResponse |
|---|------|---------------|----------------------|---------------------|-----------------|
| 1 | `{}` | ✅ 返回 `{}` | ✅ 默认 revise | ✅ 默认 revise | ✅ throw "not array" |
| 2 | `{"verdict":""}` | ✅ 返回对象 | ✅ 默认 revise (空字符串 falsy) | ✅ 默认 revise | N/A |
| 3 | ` ```json\n{...}\n``` ` | N/A (文件无代码块) | ✅ 正则提取 | ✅ 文本 fallback | ✅ extractJSON |
| 4 | `{"v":"他说\"你好\""}` | ✅ 正常解析 | ✅ 正常解析 | ✅ 正常解析 | N/A |
| 5 | `{"v":"他说"你好""}` | ✅ 移除中文引号后解析 | ❌ JSON.parse 失败→文本 fallback | ❌ fallback | N/A |
| 6 | 100KB+ JSON | ✅ 正常解析 | ✅ 正常解析 | ✅ 正常解析 | ✅ 正常解析 |
| 7 | `[{...}]` | ✅ 返回数组→verdict 缺失 | ⚠️ 贪婪匹配→可能异常 | ❌ fallback | ✅ 数组路径 |
| 8 | 纯文本无 JSON | ❌ throw | ✅ 默认 revise | ✅ 默认 revise | ❌ throw |
| 9 | `{"verdict":"accept"/*ok*/}` | ✅ 移除注释后解析 | ❌ JSON.parse 失败→文本 fallback | ❌ fallback | N/A |
| 10 | `null` / `undefined` 输入 | ❌ throw (非 string) | ⚠️ 需验证 | ⚠️ 需验证 | ⚠️ 需验证 |

## 4. 测试设计

### 测试文件

`tests/writing/llm-parse-boundary.test.ts`

### 测试用例

#### TC-PB-1: 空 JSON 对象解析

```
输入 (E1): '{}' 写入 review JSON 文件
预期: tryFixJSON 返回 {}，verdict 校验报 "verdict 无效"

输入 (E2): '{}' 作为 reviewOutput
预期: parseReviewDecision 返回 { decision: 'revise', confidence: 0.5, reasons: [] }
```

#### TC-PB-2: Markdown 代码块包裹的 JSON

```
输入 (E2): '以下是审阅结果：\n```json\n{"verdict":"accept","scores":{"accuracy":8}}\n```\n希望有帮助'
预期: parseReviewDecision 返回 { decision: 'accept', confidence: 0.8, reasons: [] }
```

#### TC-PB-3: 特殊字符处理

```
输入 (E1): '{"verdict":"accept","summary":"他说\u201c你好\u201d"}' 写入文件
预期: tryFixJSON 移除中文引号后解析成功，verdict 为 accept

输入 (E2): '{"verdict":"accept","summary":"包含\\n换行和\\t制表符"}'
预期: parseReviewDecision 正常解析，decision 为 accept
```

#### TC-PB-4: 超大 JSON 不崩溃

```
输入 (E2): 构造含 1000 个 issues 条目的 JSON 字符串（约 100KB+）
预期: parseReviewDecision 正常解析，不超时（< 1s），decision 正确
```

#### TC-PB-5: JSON 数组输入

```
输入 (E2): '[{"verdict":"accept"},{"verdict":"reject"}]'
预期: parseReviewDecision 不抛异常，返回有效的 ReviewDecision（默认 revise 或从子对象提取）

输入 (E1): '[{"verdict":"accept"}]' 写入 review JSON 文件
预期: tryFixJSON 返回数组，verdict 校验报 "verdict 无效: missing"
```

### 覆盖率目标

| 模块 | 行覆盖率目标 | 备注 |
|------|-------------|------|
| `output-validator.ts` tryFixJSON | ≥ 90% | 覆盖所有修复步骤 |
| `task-executor.ts` parseReviewDecision | ≥ 85% | 覆盖 JSON + 文本 fallback |
| `orchestrator.ts` parseReviewResult | ≥ 80% | 覆盖文件读取 + 文本 fallback |

## 5. 实现要点

### 需要修改的文件

| 文件 | 修改内容 | 原因 |
|------|---------|------|
| `tests/writing/llm-parse-boundary.test.ts` | 新增 | 边界测试用例 |
| `src/writing/task-executor.ts` | 可能无需修改 | 验证现有行为是否满足 spec |
| `src/writing/output-validator.ts` | 可能无需修改 | 验证现有行为是否满足 spec |

### 测试结构

```typescript
describe('LLM Parse Boundary (Issue #91)', () => {
  describe('INV-PB-1: 空 JSON 对象', () => { ... })
  describe('INV-PB-2: 嵌套 JSON（代码块包裹）', () => { ... })
  describe('INV-PB-3: 特殊字符', () => { ... })
  describe('INV-PB-4: 超大 JSON', () => { ... })
  describe('INV-PB-5: JSON 数组', () => { ... })
  describe('INV-PB-6: 完全非 JSON 文本', () => { ... })
  describe('INV-PB-7: JSON 注释', () => { ... })
})
```

### 实现注意事项

1. **不 mock fs**: 使用临时目录 + `afterEach` 清理（遵循 AGENTS.md §3.3）
2. **E2 的 `parseReviewDecision` 可直接实例化 `TaskExecutor` 调用**
3. **E1 的 `tryFixJSON` 是模块内部函数**，需通过 `OutputValidator.validate()` 间接测试（写入 review JSON 文件）
4. **E3 的 `parseReviewResult` 是 `private` 方法**，需通过 orchestrator 间接测试或提取为可测试接口
5. **E4 的 `parseResponse` 需要 `LLMPlanner` 实例**，依赖较多，可单独测试

### 已知风险

1. **E2 贪婪正则**: `/\{[\s\S]*\}/` 对嵌套 JSON 可能匹配错误（如 `{"a":{"b":1}}` 会正确匹配，但多个顶层对象会合并）
2. **E1 中文引号移除**: 可能破坏字符串语义（已知可接受降级）
3. **E3 private 方法**: 无法直接单元测试，需通过集成路径覆盖
