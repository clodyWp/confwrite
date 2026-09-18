---
name: confwrite
description: "Generate 10+ chapter long documents (technical proposals, whitepapers, manuals) with structured material organization, write-review-fix loops, and multi-format export. Trigger: user asks to generate a long document, technical proposal, whitepaper, or manual."
---

# ConfWrite — 长文档生成

> 流程由 TypeScript 状态机控制，LLM 只做内容生成。

## 命令

| 命令 | 用途 |
|------|------|
| `/confwrite:init <slug>` | 初始化新项目 |
| `/confwrite:organize` | 整理素材（扫描→转换→索引→基线→素材包→同步大纲） |
| `/confwrite:write` | 启动/推进写作流程 |
| `/confwrite:status` | 查看项目进度 |
| `/confwrite:resume` | 恢复中断的项目 |
| `/confwrite:compact` | 手动压缩上下文（防止长任务 429 错误） |
| `/confwrite:export <fmt>` | 导出文档（md / html / docx） |

## 流程概览

```
Phase 0a: 项目初始化     → 创建目录结构 + state
Phase 0b: 素材整理       → 扫描资料 → 格式转换(PDF/DOCX/HTML→MD) → 索引 → 数据基线 → 素材包 → 同步大纲
Phase 1:  需求分析       → researcher subagent（可选）
Phase 2:  大纲规划       → 人机协作多轮迭代
Phase 3:  素材准备       → 素材索引（如 0b 未完成）
Phase 4a: 写作           → writer subagent 批量（Writer 直接写 mermaid 图表）
Phase 4b: 审阅           → reviewer subagent 批量
Phase 4c: 决策           → 自动判断 accept/revise/reject
Phase 4d: 修复           → fixer subagent 批量
Phase 5:  图表处理       → 提取 mermaid 代码块 → .mmd → SVG → PNG → 替换草稿
Phase 6:  组装           → 合并章节 → final.md
Phase 7:  定稿           → 文档统计 + 数据基线一致性检查 → finalization.json
Phase 8:  导出           → MD / HTML / DOCX
```

## 核心原则

1. **流程确定性**：状态机在 TypeScript 中运行，不依赖 LLM 判断流程
2. **最大化自主推进**：无依赖的任务并行执行，失败不阻塞整体
3. **自动重试**：失败任务按令牌桶节奏自动重试，无硬上限
4. **状态持久化**：每一步都持久化，随时可恢复
5. **知识库与素材分离**：知识库存通用规则，素材存项目专属资料

## 支持的输入格式

| 格式 | 转换方式 |
|------|----------|
| Markdown (.md) | 直接使用 |
| HTML (.html/.htm) | 内置正则转换 |
| PDF (.pdf) | pdf-parse v2 提取文本 |
| DOCX (.docx) | mammoth → HTML → Markdown |

## 使用方式

```bash
# 1. 初始化项目
/confwrite:init my-project

# 2. 将参考资料放入 projects/my-project/reference_material/
#    支持 PDF、Word、HTML、Markdown

# 3. 整理素材（自动转换格式、提取基线、同步大纲章节）
/confwrite:organize

# 4. 编辑 outline.md，用 ch001/ch002 标记章节

# 5. 启动写作（状态机自动推进 write→review→fix→assemble→finalize→export）
/confwrite:write

# 6. 查看进度
/confwrite:status

# 6.5 长任务防止 429：手动压缩上下文
/confwrite:compact

# 7. 导出
/confwrite:export md
/confwrite:export html
/confwrite:export docx
```

## 写作循环

```
Writer → Reviewer → 决策:
  accept  → 章节完成 ✅
  revise  → Fixer 修复 → 重新审阅
  reject  → 重置为 pending，下一轮重写
```

## 图表

Writer 在草稿中直接写 ` ```mermaid ` 代码块。Phase 5 自动：
1. 提取所有 mermaid 代码块
2. 写入 `figures/*.mmd`
3. 用 mmdc 渲染 SVG（如可用）
4. 用 sharp 转换 PNG（如可用）
5. 替换草稿中的 mermaid 为 `![图表](figures/xxx.png)`

## 定稿检查 (Phase 7)

自动执行：
- 文档统计（章节数、字数、标题、表格、代码块、图表、图片、链接）
- 数据基线一致性（检查关键指标是否在文档中出现）
- 术语一致性（检查技术术语覆盖率）
- 生成 `output/finalization.json` 报告
