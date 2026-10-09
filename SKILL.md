---
name: confwrite
description: "Generate 10+ chapter long documents (technical proposals, whitepapers, manuals) with structured material organization, write-review-fix loops, and multi-format export. Trigger: user asks to generate a long document, technical proposal, whitepaper, or manual."
---

# ConfWrite — 长文档生成

> 流程由 TypeScript 状态机控制，LLM 只做内容生成。

## 命令

| 命令 | 用途 |
|------|------|
| `/confwrite:init <slug> [material-dir]` | 初始化新项目 |
| `/confwrite:organize` | 整理素材（扫描→转换→索引→基线→素材包→同步大纲） |
| `/confwrite:outline <slug> <template> [words]` | 自动生成大纲（基于模板和需求） |
| `/confwrite:write` | 启动/推进写作流程 |
| `/confwrite:status` | 查看项目进度 |
| `/confwrite:resume` | 恢复中断的项目 |
| `/confwrite:compact` | 手动压缩上下文（防止长任务 429 错误） |
| `/confwrite:export <slug> <fmt> [output-path]` | 导出文档（md / html / docx） |

## 流程概览

```
Phase 0a: 项目初始化     → 创建目录结构 + state + 复制知识库
Phase 0b: 素材整理       → 扫描资料 → 格式转换(PDF/DOCX/HTML→MD) → 索引 → 数据基线 → 素材包 → 同步大纲
Phase 1:  需求分析       → 从输入文档中提取需求 → 生成需求列表和报告
Phase 2:  大纲规划       → 根据模板和需求自动生成大纲（人机协作确认）
Phase 3:  素材准备       → 素材索引（如 0b 未完成）
Phase 4a: 写作           → writer subagent 批量（Writer 在草稿中写结构化图表）
Phase 4b: 审阅           → reviewer subagent 批量
Phase 4c: 决策           → 自动判断 accept/revise/reject
Phase 4d: 修复           → fixer subagent 批量
Phase 5:  图表处理       → 提取结构化图表 → 内置布局引擎渲染 → SVG → PNG → 替换草稿
Phase 6:  组装           → 合并章节 → final.md
Phase 7:  定稿           → 文档统计 + 数据基线一致性检查 → finalization.json
Phase 8:  导出           → DOCX（自动流程仅导出 DOCX；手动命令支持 md/html/docx）
```

## 完整使用流程

```
1. 初始化项目
   /confwrite:init my-project
   
   → 创建项目目录结构
   → 复制默认章节类型知识库（7种默认 + 3种自定义）
   → 复制大纲模板（技术方案、投标文档）
   → 复制需求分类知识库（6个分类）

2. 准备参考资料
   将 PDF/Word/HTML/Markdown 文件放入:
   projects/my-project/reference_material/
   projects/my-project/inputs/

3. 整理素材
   /confwrite:organize
   
   → 扫描资料 → 格式转换 → 索引 → 数据基线 → 素材包

4. 提取需求（自动）
   /confwrite:write
   
   → Phase 1 自动从输入文档中提取需求
   → 生成 assets/requirements.json

5. 生成大纲（自动或手动）
   自动：Phase 2 根据模板自动生成大纲
   手动：/confwrite:outline my-project technical-proposal [50000]
   
   → 生成 outline.md
   → 生成 assets/outline-evaluation.md（评估报告）

6. 确认大纲
   编辑 outline.md，确认章节结构
   
7. 继续写作
   /confwrite:write
   
   → 状态机自动推进: Phase 3 → 4a → 4b → 4c → 4d → 5 → 6 → 7 → 8

8. 查看进度
   /confwrite:status

9. 导出文档
   /confwrite:export my-project md
   /confwrite:export my-project html
   /confwrite:export my-project docx
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

## 执行方式

**重要：这些命令由 extension 实现，不是 skill 直接执行。**

当用户输入 `/skill:confwrite <command> [args]` 时，你应该：

1. **识别命令**：从用户输入中提取 `command` 和 `args`
2. **调用 extension 命令**：使用对应的 `/confwrite:<command>` 格式

例如：
- 用户输入：`/skill:confwrite write projects/dongd`
- 你应该调用：`/confwrite:write projects/dongd`

**不要自己执行写作逻辑！** 调用注册的 extension 命令即可。

## 使用方式

```bash
# 1. 初始化项目
/skill:confwrite init my-project
# → 实际调用: /confwrite:init my-project

# 2. 将参考资料放入 projects/my-project/reference_material/
#    支持 PDF、Word、HTML、Markdown

# 3. 整理素材（自动转换格式、提取基线、同步大纲章节）
/skill:confwrite organize
# → 实际调用: /confwrite:organize

# 4. 编辑 outline.md，用 ch001/ch002 标记章节

# 5. 启动写作（状态机自动推进 write→review→fix→assemble→finalize→export）
/skill:confwrite write
# → 实际调用: /confwrite:write

# 6. 查看进度
/skill:confwrite status
# → 实际调用: /confwrite:status

# 6.5 长任务防止 429：手动压缩上下文
/skill:confwrite compact
# → 实际调用: /confwrite:compact

# 7. 导出
/skill:confwrite export my-project md
# → 实际调用: /confwrite:export my-project md
/skill:confwrite export my-project html
/skill:confwrite export my-project docx
```

## 写作循环

```
Writer → Reviewer → 决策:
  accept  → 章节完成 ✅
  revise  → Fixer 修复 → 重新审阅
  reject  → 重置为 pending，下一轮重写
```

## 图表

Writer 在草稿中写结构化图表格式（`containers / nodes / edges`）。Phase 5 自动：
1. 提取所有结构化图表代码块
2. 内置布局引擎渲染（正交连线 + 分层配色 + 自适应压缩）
3. 生成 SVG → 用 sharp 转换 PNG
4. 替换草稿中的图表代码为 `![图表](figures/xxx.png)`

布局引擎详见 `src/diagrams/layout/`（graph → metrics → route → render → validate）。

## 定稿检查 (Phase 7)

自动执行：
- 文档统计（章节数、字数、标题、表格、代码块、图表、图片、链接）
- 数据基线一致性（检查关键指标是否在文档中出现）
- 术语一致性（检查技术术语覆盖率）
- 生成 `output/finalization.json` 报告
