# Spec: OutlineGenerator LLM 路径集成测试

> **版本**: 1.0  
> **日期**: 2026-10-13  
> **源码**: `src/outline/generator.ts`, `src/outline/llm-planner.ts`  
> **关联**: Issue #90  
> **状态**: 草案

---

## 1. 职责

本 spec 定义 `OutlineGenerator` 通过 `LLMPlanner` 调用 LLM 生成大纲时的**行为不变量**和**降级策略**。

核心目标：确保 LLM 路径在各种响应场景下（标准格式、错误格式、超时、空内容）均能产生有效大纲，且在 LLM 失败时正确降级。

---

## 2. 架构上下文

```
OutlineGenerator.generate()
  │
  ├─ [Tier 1] LLMPlanner.plan()
  │     └─ LLMCaller(prompt) → response string
  │         ├─ 成功 → parseResponse() → OutlineChapter[]
  │         └─ 失败 → throw Error → 降级到 Tier 2
  │
  ├─ [Tier 2] AdaptiveOutlinePlanner.plan()
  │     └─ 需要 requirementsContent 含 Markdown # 标题
  │         ├─ 成功 → OutlineChapter[]
  │         └─ 失败 → 降级到 Tier 3
  │
  └─ [Tier 3] Template-based generation
        └─ 始终成功（依赖 knowledge/ 目录中的模板和章节类型定义）
```

---

## 3. LLM 响应分类

| 类型 | 描述 | 示例 |
|------|------|------|
| **标准 JSON** | 直接返回合法 JSON 数组 | `[{"id":"ch001","title":"概述","type":"overview",...}]` |
| **Markdown 包裹 JSON** | JSON 包裹在 ` ```json ... ``` ` 中 | ` ```json\n[...]\n``` ` |
| **混合文本 + JSON** | 前后有说明文字，中间包含 JSON 数组 | `以下是大纲：\n[...]\n希望这有帮助。` |
| **无效 JSON** | 无法解析为 JSON | `这是一份大纲规划...` |
| **空数组** | 合法 JSON 但数组为空 | `[]` |
| **非数组 JSON** | 合法 JSON 但不是数组 | `{"chapters": [...]}` |
| **缺少必填字段** | 数组元素缺少 `title` 或 `type` | `[{"id":"ch001"}]` |
| **超时/异常** | LLMCaller 抛出异常 | `throw new Error('timeout')` |
| **空字符串** | LLM 返回空字符串 | `""` |

---

## 4. 不变量 (Invariants)

以下规则**永远不得违反**。违反任何一条 = bug。

### 4.1 LLM 路径

| ID | 不变量 | 验证方式 |
|----|--------|---------|
| INV-OL-1 | **标准 JSON 响应必须产生与输入等长的章节列表** | 给定 LLM 返回 N 个合法章节的 JSON 数组，`generate()` 返回的 `Outline.chapters.length === N` |
| INV-OL-2 | **每个 LLM 生成的章节必须包含 wordBudget** | 即使 LLM 未返回字数信息，`OutlineGenerator` 必须为每个章节填充 `wordBudget: { min, max }` |
| INV-OL-3 | **LLM 返回的 requirementSource 必须转换为 `{ sections, headings }` 结构** | LLM 返回 `requirementSource: ["1", "1.1"]` → 章节的 `requirementSource === { sections: ["1", "1.1"], headings: [] }` |
| INV-OL-4 | **LLM 未返回 id 时必须自动生成** | 缺失 id 的章节按索引生成 `ch001`, `ch002`, ... |

### 4.2 降级策略

| ID | 不变量 | 验证方式 |
|----|--------|---------|
| INV-OL-5 | **LLM 抛异常时必须降级到 Tier 2 或 Tier 3** | `LLMCaller` throw → `generate()` 不抛异常，返回有效 `Outline` |
| INV-OL-6 | **LLM 返回无效 JSON 时必须降级** | `parseResponse()` 抛异常 → 被 `generate()` catch → 降级 |
| INV-OL-7 | **LLM 返回空数组时必须降级** | `parseResponse()` 检测到空数组 → throw → 降级 |
| INV-OL-8 | **LLM 返回缺少必填字段的章节时必须降级** | `parseResponse()` 检测到缺少 `title`/`type` → throw → 降级 |
| INV-OL-9 | **降级到 Tier 2 需要 requirementsContent 含 Markdown 标题** | 无 `#` 标题时 Tier 2 失败 → 继续降级到 Tier 3 |
| INV-OL-10 | **Tier 3（模板方式）必须始终成功** | 即使无 requirementsContent、无 LLM，`generate()` 必须返回有效 `Outline` |

### 4.3 Prompt 构建

| ID | 不变量 | 验证方式 |
|----|--------|---------|
| INV-OL-11 | **超长需求文档必须截断到 30000 字符** | `buildPrompt()` 对 > 30000 字符的 content 截断并追加 `[... 内容已截断 ...]` |
| INV-OL-12 | **Prompt 必须包含 targetWords 和 wordBudget** | LLM 需要这些信息来规划章节字数 |

---

## 5. 降级决策树

```
LLM 调用
  │
  ├─ 成功且 chapters.length > 0 → ✅ 返回 LLM 结果
  │
  ├─ 成功但 chapters.length === 0 → 降级
  │
  ├─ 抛异常（超时/网络/解析错误） → 降级
  │
  └─ 降级决策：
       │
       ├─ requirementsContent 存在？
       │   ├─ YES → 有 Markdown # 标题？
       │   │         ├─ YES → Tier 2 (AdaptiveOutlinePlanner)
       │   │         │         ├─ 成功 → ✅ 返回
       │   │         │         └─ 失败 → Tier 3
       │   │         └─ NO → Tier 3 (模板)
       │   └─ NO → Tier 3 (模板)
       │
       └─ Tier 3 → ✅ 始终返回
```

---

## 6. 集成测试设计

### 6.1 测试文件

- **路径**: `tests/outline/llm-integration.test.ts`
- **框架**: vitest (`describe/it/expect`)
- **Mock**: 内联 `LLMCaller` mock（不需要 `MockSubagentExecutor`，因为测试的是 `LLMCaller` 接口而非 `SubagentExecutor`）
- **临时目录**: `mkdtempSync` + `afterEach` 清理

### 6.2 公共测试基础设施

```typescript
// tests/outline/llm-integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineGenerator } from '../../src/outline/generator.js';
import type { LLMCaller } from '../../src/outline/llm-planner.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-llm-integration-'));
}

/** 创建标准测试项目结构（模板 + 章节类型） */
function setupProject(projectDir: string): void {
  // 创建 outline-templates
  const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
  mkdirSync(templatesDir, { recursive: true });
  writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术方案模板
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
  - type: requirements
    required: true
    order: 2
  - type: architecture
    required: true
    order: 3
  - type: functional
    required: true
    order: 4
  - type: implementation
    required: true
    order: 5
---
`);

  // 创建 chapter-types
  const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
  mkdirSync(chapterTypesDir, { recursive: true });
  for (const [type, name, min, max, imp] of [
    ['overview', '概述章', 5000, 8000, 3],
    ['requirements', '需求章', 8000, 12000, 4],
    ['architecture', '架构章', 10000, 15000, 5],
    ['functional', '功能章', 12000, 20000, 5],
    ['implementation', '实施章', 10000, 15000, 4],
  ]) {
    writeFileSync(join(chapterTypesDir, `${type}.md`), `---
name: ${name}
wordBudget:
  min: ${min}
  max: ${max}
importance: ${imp}
writingStyle: functional
---
`);
  }
}

/** 创建需求文档 */
function writeRequirements(projectDir: string, content: string): void {
  const inputsDir = join(projectDir, 'inputs');
  mkdirSync(inputsDir, { recursive: true });
  writeFileSync(join(inputsDir, 'requirements.md'), content);
}

/** 标准 LLM 响应（3 章） */
const STANDARD_LLM_RESPONSE = JSON.stringify([
  { id: 'ch001', title: '项目概述', type: 'overview', description: '项目背景和目标', requirementSource: ['一'] },
  { id: 'ch002', title: '系统架构', type: 'architecture', description: '技术架构设计', requirementSource: ['二', '2.1'] },
  { id: 'ch003', title: '功能实现', type: 'functional', description: '核心功能模块', requirementSource: ['三'] },
]);
```

### 6.3 测试用例

#### Test 1: INV-OL-1/2/3 — 标准 JSON 响应

```typescript
it('INV-OL-1/2/3: 标准 JSON 响应产生完整章节列表', async () => {
  // Arrange
  setupProject(projectDir);
  writeRequirements(projectDir, '# 需求文档\n\n## 一、项目概述\n\n内容\n\n## 二、架构需求\n\n内容\n\n## 三、功能需求\n\n内容');

  const mockCaller: LLMCaller = async () => STANDARD_LLM_RESPONSE;
  const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });

  // Act
  const outline = await generator.generate('technical-proposal', []);

  // Assert
  expect(outline.chapters).toHaveLength(3);
  // INV-OL-1: 章节数量匹配
  expect(outline.chapters[0].title).toBe('项目概述');
  expect(outline.chapters[1].title).toBe('系统架构');
  expect(outline.chapters[2].title).toBe('功能实现');

  // INV-OL-2: 每个章节都有 wordBudget
  for (const ch of outline.chapters) {
    expect(ch.wordBudget).toBeDefined();
    expect(ch.wordBudget!.min).toBeGreaterThan(0);
    expect(ch.wordBudget!.max).toBeGreaterThan(ch.wordBudget!.min);
  }

  // INV-OL-3: requirementSource 转换为 { sections, headings } 结构
  expect(outline.chapters[0].requirementSource).toEqual({ sections: ['一'], headings: [] });
  expect(outline.chapters[1].requirementSource).toEqual({ sections: ['二', '2.1'], headings: [] });
});
```

**验证要点**：
- 章节数量与 LLM 返回一致
- 每个章节都有 wordBudget（由 OutlineGenerator 填充，非 LLM 提供）
- requirementSource 格式转换正确

---

#### Test 2: INV-OL-5/6 — 错误格式响应（无效 JSON）降级

```typescript
it('INV-OL-5/6: LLM 返回无效 JSON 时降级到 Tier 2/3', async () => {
  // Arrange
  setupProject(projectDir);
  // 需求文档包含 Markdown 标题（Tier 2 可处理）
  writeRequirements(projectDir, '# 需求文档\n\n## 1 项目概述\n\n内容\n\n## 2 功能需求\n\n内容');

  const badCaller: LLMCaller = async () => '这是一份大纲规划建议，但格式不对';
  const generator = new OutlineGenerator(projectDir, { llmCaller: badCaller });

  // Act
  const outline = await generator.generate('technical-proposal', []);

  // Assert — INV-OL-5: 不抛异常，返回有效 Outline
  expect(outline).toBeDefined();
  expect(outline.title).toBe('技术方案');
  expect(outline.chapters.length).toBeGreaterThan(0);
  // 降级成功 — 章节不来自 LLM（因为 LLM 返回无效）
  // 如果降级到 Tier 2，章节标题来自 Markdown 标题
  // 如果降级到 Tier 3，章节标题来自模板
});
```

**验证要点**：
- LLM 返回无法解析的文本时不抛异常
- 降级链路正常执行
- 最终返回有效 Outline

---

#### Test 3: INV-OL-5 — LLM 超时/异常降级

```typescript
it('INV-OL-5: LLM 抛异常（超时）时降级到 Tier 2/3', async () => {
  // Arrange
  setupProject(projectDir);
  writeRequirements(projectDir, '# 需求文档\n\n## 1 项目概述\n\n内容\n\n## 2 功能需求\n\n内容');

  const timeoutCaller: LLMCaller = async () => {
    throw new Error('LLM request timed out after 30000ms');
  };
  const generator = new OutlineGenerator(projectDir, { llmCaller: timeoutCaller });

  // Act
  const outline = await generator.generate('technical-proposal', []);

  // Assert — INV-OL-5: 不抛异常
  expect(outline).toBeDefined();
  expect(outline.chapters.length).toBeGreaterThan(0);

  // 额外验证：Outline 结构完整
  expect(outline.createdAt).toBeDefined();
  expect(outline.version).toBe('1.0.0');
  for (const ch of outline.chapters) {
    expect(ch.id).toBeDefined();
    expect(ch.title).toBeDefined();
    expect(ch.type).toBeDefined();
  }
});
```

**验证要点**：
- LLM 抛异常时 `generate()` 不抛异常
- 降级后返回的 Outline 结构完整（所有必填字段存在）
- createdAt 和 version 正确

---

#### Test 4: INV-OL-7/8 — 空内容/缺少必填字段降级

```typescript
it('INV-OL-7: LLM 返回空数组时降级', async () => {
  // Arrange
  setupProject(projectDir);
  writeRequirements(projectDir, '# 需求文档\n\n## 1 概述\n\n内容');

  const emptyCaller: LLMCaller = async () => '[]';
  const generator = new OutlineGenerator(projectDir, { llmCaller: emptyCaller });

  // Act
  const outline = await generator.generate('technical-proposal', []);

  // Assert — INV-OL-7: 空数组触发降级
  expect(outline).toBeDefined();
  expect(outline.chapters.length).toBeGreaterThan(0);
});

it('INV-OL-8: LLM 返回缺少必填字段的章节时降级', async () => {
  // Arrange
  setupProject(projectDir);
  writeRequirements(projectDir, '# 需求文档\n\n## 1 概述\n\n内容');

  const badFieldsCaller: LLMCaller = async () =>
    JSON.stringify([{ id: 'ch001' }]); // 缺少 title 和 type
  const generator = new OutlineGenerator(projectDir, { llmCaller: badFieldsCaller });

  // Act
  const outline = await generator.generate('technical-proposal', []);

  // Assert — INV-OL-8: 缺少必填字段触发降级
  expect(outline).toBeDefined();
  expect(outline.chapters.length).toBeGreaterThan(0);
});
```

**验证要点**：
- 空数组 `[]` 触发降级（`parseResponse` 检测并 throw）
- 缺少 `title`/`type` 的章节触发降级
- 两种情况都返回有效 Outline

---

## 7. 实现要点

### 7.1 测试文件结构

```
tests/outline/llm-integration.test.ts
├── describe('OutlineGenerator LLM integration')
│   ├── beforeEach: 创建临时目录 + setupProject()
│   ├── afterEach: rmSync 清理
│   │
│   ├── describe('LLM 成功路径')
│   │   └── it('INV-OL-1/2/3: 标准 JSON 响应')
│   │
│   ├── describe('LLM 降级路径')
│   │   ├── it('INV-OL-5/6: 无效 JSON 降级')
│   │   ├── it('INV-OL-5: 超时/异常降级')
│   │   └── it('INV-OL-7: 空数组降级')
│   │
│   └── describe('LLM 数据验证')
│       └── it('INV-OL-8: 缺少必填字段降级')
```

### 7.2 Mock 配置

- **不使用** `MockSubagentExecutor`：本测试直接 mock `LLMCaller` 函数签名 `(prompt: string) => Promise<string>`
- **不使用** `fs` mock：使用临时目录 + `afterEach` 清理
- 每个测试用例通过不同的 `LLMCaller` 实现模拟不同场景

### 7.3 断言策略

| 场景 | 关键断言 |
|------|---------|
| 标准响应 | `chapters.length === N`、`wordBudget` 存在、`requirementSource` 格式转换 |
| 无效 JSON | `outline` 存在、`chapters.length > 0`、不抛异常 |
| 超时/异常 | `outline` 存在、结构完整（id/title/type 都有值） |
| 空数组/缺字段 | `outline` 存在、`chapters.length > 0` |

### 7.4 与现有测试的关系

现有 `tests/outline/generator.test.ts` 已有 4 个 LLM 集成测试：
1. `should use LLMPlanner when llmCaller is provided and requirements exist` — 覆盖 INV-OL-1
2. `should fall back to AdaptiveOutlinePlanner when LLM fails` — 覆盖 INV-OL-5
3. `should fall back to template when both LLM and AdaptivePlanner fail` — 覆盖 INV-OL-10
4. `should work without llmCaller (backward compatible)` — 覆盖向后兼容

本 spec 新增的测试用例补充了：
- **INV-OL-2/3**: wordBudget 填充和 requirementSource 格式转换的详细验证
- **INV-OL-6**: 无效 JSON（非异常，而是可返回但不可解析的字符串）
- **INV-OL-7**: 空数组响应
- **INV-OL-8**: 缺少必填字段
- **INV-OL-11**: 超长文档截断（可选，作为额外测试）

---

## 8. 覆盖矩阵

| 不变量 | 现有测试覆盖 | 本 spec 新增 | 优先级 |
|--------|------------|------------|--------|
| INV-OL-1 | ✅ generator.test.ts | 增强（详细字段验证） | P0 |
| INV-OL-2 | ❌ | ✅ 新测试 | P0 |
| INV-OL-3 | ✅ 部分（仅 sections） | 增强 | P1 |
| INV-OL-4 | ❌ | 可选（边界场景） | P2 |
| INV-OL-5 | ✅ generator.test.ts | 增强（结构完整性验证） | P0 |
| INV-OL-6 | ❌ | ✅ 新测试 | P0 |
| INV-OL-7 | ❌ | ✅ 新测试 | P0 |
| INV-OL-8 | ❌ | ✅ 新测试 | P1 |
| INV-OL-9 | ✅ 隐含覆盖 | 可选 | P2 |
| INV-OL-10 | ✅ generator.test.ts | — | P0 |
| INV-OL-11 | ❌ | 可选 | P2 |
| INV-OL-12 | ❌ | 可选 | P2 |

---

## 9. 风险与注意事项

1. **LLMPlanner 的 throw 语义**：`parseResponse()` 在遇到空数组、缺少字段、无效 JSON 时均 throw Error。`generate()` 的 catch 块捕获后降级。测试需验证 catch 确实被触发。

2. **Tier 2 的前置条件**：`AdaptiveOutlinePlanner` 需要 `HeadingTreeBuilder` 能从 requirementsContent 中提取 `#` 标题。如果需求文档没有 Markdown 标题格式，Tier 2 也会失败，直接到 Tier 3。

3. **诊断日志副作用**：`readRequirementsContent()` 会写诊断日志到 `logs/diag-outline-generator.json`。测试的临时目录中会产生此文件，但不影响断言。

4. **config 默认值**：测试中 `OutlineGenerator` 使用默认 config（`loadConfig(projectDir)`），需要确保临时目录中不存在 `confwrite.config.json`，否则会加载意外配置。当前 `loadConfig` 在文件不存在时返回默认值，无风险。
