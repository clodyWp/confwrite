---
type: Technical Lesson
title: Writer Subagent 图表描述质量问题
description: Writer subagent 生成的图表描述经常不符合 4 种标准格式（Mermaid/YAML/Steps/ASCII），导致图表管线失败率高。需要在 prompt 中给出具体示例并增加后置验证。
tags: [subagent, diagram, quality, writer, prompt-engineering, doc-chapters]
timestamp: 2026-08-12T06:00:00+08:00
---

# Writer Subagent 图表描述质量问题

> Writer subagent 倾向于用自然语言描述图表，而非生成标准格式的结构化语法。这导致图表管线的解析失败率高达 46%。

## 背景

doc-chapters 技能的 Phase 5（图表生成）依赖 writer 在正文中使用 `<!-- diagram-start -->` 标记嵌入图表描述。解析器支持 4 种格式：Mermaid、YAML、Steps、ASCII。但 writer subagent 经常生成不符合任何标准格式的描述。

## 要点

1. **问题本质**：Writer 用自然语言描述"这张图应该长什么样"，而非生成可解析的结构化语法。例如写"下面是一个流程图，展示了三个模块之间的关系"而非 Mermaid 代码。

2. **失败率数据**：
   - liming-finance-manual-v3：52 个图表块中 24 个解析失败（46%）
   - procurement-system-bid：writer 生成的图表描述同样存在格式不统一问题

3. **三类常见格式问题**：
   - 自然语言描述（"模块 A 连接到模块 B"）而非 Mermaid 语法
   - 混合格式（部分 Mermaid + 部分自然语言）
   - 缺少节点连接关系的明确声明

4. **Prompt 约束不足**：SKILL.md 中虽然列出了 4 种格式，但缺少具体的正确示例和错误示例。Writer 不知道"好"长什么样。

5. **解决方向**：
   - Prompt 中必须给出每种格式的具体示例（正确 vs 错误）
   - Phase 4a 完成后立即验证图表格式（不要等到 Phase 5）
   - 增加后置解析验证脚本，自动检测格式不合规的图表描述

6. **自然语言描述的补救**：对于已生成的自然语言描述，可尝试提取【】括号和"xxx模块"模式识别实体，但效果有限。

## 实践案例

- **2026-07-29** liming-finance-manual-v3：52 个图表中 24 个失败。v3 解析器增加了 4 种解析策略（mermaid/steps/phases/text-desc），自然语言描述通过提取【】和"xxx模块"模式识别实体，但成功率仍不理想。
- **2026-08-04** procurement-system-bid：writer subagent 的图表描述同样存在格式不统一问题，reviewer 在审阅报告中标记了 D4 图表维度的 fail。

## 关联

- [[多章节文档生成工作流]] — 图表管线是文档生成工作流的 Phase 5
- [[Subagent 可靠性模式]] — Writer subagent 的产出质量需要验证
- [[Agent 不可靠前提下的 Skill 设计策略]] — Prompt 约束是"伪结构性"约束，需要后置验证补充
- [[技术图形布局设计方法论]] — 图表布局设计方法论

<!-- updated: 2026-08-12 -->
