# LLM 驱动大纲生成 - 实施计划

## 背景

当前 `OutlineGenerator` 使用 `AdaptiveOutlinePlanner`（纯代码逻辑）：
1. `HeadingTreeBuilder` 从 Markdown `#` 标题建树
2. `collectLeafNodes()` 收集叶子节点
3. 如果叶子太多，`mergeToTargetCount()` 归并

**问题**：
- 只支持 Markdown `#` 标题格式
- Word 文档转换后（mammoth）没有 `#` 标题，全是中文数字（一、二、三）
- 无法处理非标准格式的需求文档

**目标**：让 LLM 读需求文档，理解内容结构，规划章节。

## 设计方案

### 架构

```
需求文档（Word/Markdown/纯文本）
    ↓
LLMPlanner（调用 subagent）
    ↓
OutlineChapter[]（含 requirementSource）
    ↓
outline.md
```

### 核心文件

| 文件 | 职责 |
|------|------|
| `src/outline/llm-planner.ts` | LLM 规划器，调用 subagent 生成大纲 |
| `src/outline/generator.ts` | 修改 `generate()` 方法，优先使用 LLM 规划器 |

### LLM Planner 接口

```typescript
export interface LLMPlannerOptions {
  /** 需求文档内容 */
  requirementsContent: string;
  /** 目标字数 */
  targetWords: number;
  /** 单章字数预算 */
  wordBudget: { min: number; max: number };
  /** 模板名称 */
  templateName: string;
}

export class LLMPlanner {
  /**
   * 调用 LLM 生成章节列表
   */
  async plan(options: LLMPlannerOptions): Promise<OutlineChapter[]>;
}
```

### Prompt 设计

```
你是一位资深技术文档规划专家。请根据以下需求文档，规划文档的章节结构。

## 需求文档
{requirementsContent}

## 要求
- 目标总字数：{targetWords} 字
- 每章字数预算：{wordBudget.min}-{wordBudget.max} 字
- 章节数量：根据内容自动规划，确保覆盖所有需求

## 输出格式
返回 JSON 数组，每个元素包含：
- id: 章节ID（如 "ch001"）
- title: 章节标题
- type: 章节类型（overview/requirements/functional/architecture/implementation/support/appendix）
- description: 章节描述（100-200字）
- requirementSource: 需求来源（章节号列表，如 ["2.1", "2.2"]）

示例：
[
  {
    "id": "ch001",
    "title": "项目概述",
    "type": "overview",
    "description": "介绍项目背景、目标和范围...",
    "requirementSource": ["1", "1.1"]
  }
]
```

### 集成到 OutlineGenerator

```typescript
async generate(templateName: string, requirements: Requirement[], targetWords?: number): Promise<Outline> {
  // 1. 加载模板
  const template = this.templateLoader.loadTemplate(templateName);
  const effectiveTargetWords = targetWords || template.targetWords;

  // 2. 读取需求文档
  const requirementsContent = this.readRequirementsContent();
  
  // 3. 优先使用 LLM 规划器
  if (requirementsContent) {
    try {
      const llmPlanner = new LLMPlanner();
      const chapters = await llmPlanner.plan({
        requirementsContent,
        targetWords: effectiveTargetWords,
        wordBudget: { min: 5000, max: 8000 },
        templateName,
      });
      
      if (chapters.length > 0) {
        return { title: template.name, targetWords: effectiveTargetWords, chapters, ... };
      }
    } catch {
      // 回退到 AdaptiveOutlinePlanner
    }
  }
  
  // 4. 回退：AdaptiveOutlinePlanner
  // ...
}
```

## 实施步骤

### Phase B1: 实现 LLMPlanner（30min）
- 新建 `src/outline/llm-planner.ts`
- 实现 `plan()` 方法，调用 subagent
- 解析 LLM 返回的 JSON

### Phase B2: 集成到 OutlineGenerator（30min）
- 修改 `src/outline/generator.ts`
- 添加 `readRequirementsContent()` 方法
- 优先使用 LLM 规划器，失败时回退

### Phase B3: 测试（30min）
- 单元测试：mock LLM 返回，验证解析
- 集成测试：用 eastE-v2 数据验证

### Phase B4: 部署验证（30min）
- 打包部署到远程
- 在 eastE-v2 上验证大纲生成

## 验证标准

| 项目 | 验证项 | 目标 |
|------|--------|------|
| eastE-v2 | 大纲生成成功 | ✅ |
| eastE-v2 | 章节数 > 100 | ✅ |
| eastE-v2 | 章节包含 requirementSource | ✅ |
| LMERP2V2-v2 | 大纲生成成功（回退验证） | ✅ |
