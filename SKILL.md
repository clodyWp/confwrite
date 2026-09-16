---
name: confwrite
description: "Generate 10+ chapter long documents (technical proposals, whitepapers, manuals) with structured material organization, write-review-fix loops, and Word export. Trigger: user asks to generate a long document, technical proposal, or whitepaper."
---

# ConfWrite — 长文档生成

> 流程由 TypeScript 状态机控制，LLM 只做内容生成。

## 命令

| 命令 | 用途 |
|------|------|
| `/confwrite:init` | 初始化新项目 |
| `/confwrite:organize` | 整理素材（扫描资料→建索引→生成素材包） |
| `/confwrite:write` | 启动写作流程 |
| `/confwrite:status` | 查看项目进度 |
| `/confwrite:resume` | 恢复中断的项目 |

## 流程概览

```
Phase 0a: 项目初始化     → 创建目录结构 + state
Phase 0b: 素材整理       → 扫描资料 → 索引 → 数据基线 → 素材包
Phase 1:  需求分析       → researcher subagent（可选）
Phase 2:  大纲规划       → 人机协作多轮迭代
Phase 3:  素材准备       → 素材索引（如 0b 未完成）
Phase 4a: 写作           → writer subagent 批量
Phase 4b: 审阅           → reviewer subagent 批量
Phase 4c: 决策           → 自动判断 pass/revise/reject
Phase 4d: 修复           → fixer subagent 批量
Phase 5:  图表生成       → diagram agents → SVG→PNG
Phase 6:  组装           → 合并章节 → final.md
Phase 7:  定稿           → 用户审阅确认
Phase 8:  导出           → convert-to-docx → final.docx
```

## 核心原则

1. **流程确定性**：状态机在 TypeScript 中运行，不依赖 LLM 判断流程
2. **最大化自主推进**：无依赖的任务并行执行，失败不阻塞整体
3. **自动重试**：失败任务按令牌桶节奏自动重试，无硬上限
4. **状态持久化**：每一步都持久化，随时可恢复
5. **知识库与素材分离**：知识库存通用规则，素材存项目专属资料

## 使用方式

```bash
# 1. 初始化项目
/confwrite:init my-project

# 2. 将参考资料放入 projects/my-project/reference_material/

# 3. 整理素材
/confwrite:organize

# 4. 人机协作大纲（多轮迭代）

# 5. 启动写作
/confwrite:write

# 6. 查看进度
/confwrite:status
```
