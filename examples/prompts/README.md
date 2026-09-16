# 示例 Prompt 文件

本目录包含 Writer、Reviewer、Fixer subagent 的 prompt 示例，帮助理解各角色的输入输出。

## 文件列表

| 文件 | 说明 |
|------|------|
| `writer-ch001.md` | Writer subagent 的 prompt + 期望输出 |
| `reviewer-ch001.md` | Reviewer subagent 的 prompt + 审阅报告示例 |
| `fixer-ch001.md` | Fixer subagent 的 prompt + 修复后输出 |

## 学习路径

建议按以下顺序阅读：

1. **writer-ch001.md** — 理解 Writer 看到什么、输出什么
2. **reviewer-ch001.md** — 理解 Reviewer 如何审阅、如何给出决定
3. **fixer-ch001.md** — 理解 Fixer 如何根据审阅反馈修复

## 关键概念

- **素材包 (Chapter Kit)**: Writer 的输入，包含相关文件、关键数据、术语、需求
- **数据基线 (Data Baseline)**: 跨章节共享的数据，Reviewer 核查的依据
- **审阅决定 (Review Decision)**: accept / revise / reject 三种结果
- **Write-Review-Fix 循环**: 写作管线的核心流程
