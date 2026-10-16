# 待办与交接（ConfWrite）

> 最后更新：2026-10-16（自动化版本管理 + 技术债清理）
> 当前分支：`master`
> 版本：**v0.29.0**
> 测试：**1661 通过，35 跳过（1696 总计）**
> 覆盖率：Statements 94.16%, Branches 87.83%, Functions 94.66%

---

## 1. 一句话现状

**字数控制从 3.5x 超限改善到目标范围内，状态机 13 条不变量已通过 spec 验证，新增自动化版本管理。**

```
v6:  平均 17,500 字/章，100% 超限，总字数 175,000（目标 50,000）
v8:  平均  4,800 字/章，0% 超限，总字数 48,000（目标 50,000）
```

**核心修复（v0.21.2 → v0.29.0）**：
- 字数控制渐进式响应（移除硬性截断，改为渐进式响应）
- 状态机 spec-driven 开发（13 条不变量 SM-1~SM-20）
- 日志系统重构（JSONL 增量追加 + EventBus 整合 + 原子化写入）
- E2E 测试框架（远程执行 + 本地分析 + 验证器）
- 测试覆盖率工具（vitest coverage + 影响分析工具）
- 自动化版本管理（commitlint + release-it）

**已完成项目（v0.18.x）**：
- 图表从「全部单色、29 张一张没进文档」修到「5 层配色、29/29 全部内嵌」
- 导出从「pandoc 直接报错」修到「`output/final.docx` = 1,470,199 B，29 张图 + TOC」
- 共修 35 个 bug，新增 57 个测试

---

## 2. 当前产物

| 文件 | 大小 | 检查 |
|---|---|---|
| `assembly/merged-v1.md` | 1,127,292 B | 14 个 `***` 分隔符、29 处图片引用、文档标题 + 目录 |
| `output/final.md` | 1,127,292 B | 同上 |
| **`output/final.docx`** | **1,470,199 B** | **29 张内嵌图片 + TOC 域 + Heading1 × 1** |

```
final.docx 结构
  ├─ 内嵌图片    29 张（word/media/）
  ├─ TOC 域      1 个（Word 里按 F9 / 右键可更新）
  ├─ Heading1    1 个（仅文档标题）
  ├─ Heading2    16 个（目录 + 15 章）
  └─ Heading3    67 个（章节内小节）
```

---

## 3. 已完成（v0.21.2 → v0.29.0）

### 3.1 字数控制改进

| 版本 | 修复 | 说明 |
|------|------|------|
| v0.22.0 | Bug #47-2 | 移除 reject 时 round 双重递增 |
| v0.23.0 | Bug #63 | validation_failed 不再错误设置 reviewed 状态 |
| v0.23.0 | Bug #65 | DIAG 日志不再 flooding TUI |
| v0.25.0 | Bug #96 | 移除硬性截断，改为渐进式响应（SM-WC-2~7） |
| v0.26.0 | Issue #75/#76 | Writer/Reviewer prompt 字数控制策略改进 |
| v0.26.0 | Issue #79 | 硬性字数截断机制（后在 v0.25.0 被渐进式替代） |
| v0.26.0 | Issue #80 | Reviewer verdict 矛盾检查增强 |
| v0.26.0 | Issue #81 | Phase 4b 无法退出当所有章节 failed (SM-20) |

### 3.2 状态机与日志系统

| 版本 | 修复 | 说明 |
|------|------|------|
| v0.25.0 | SM-14 | 移除 4c → 4a 的 `&& ch.round > 1` 死代码 |
| v0.25.0 | SM-16 | Phase 4d allExceeded 死锁防护 |
| v0.25.0 | SM-17 | 关键状态变化 emit 事件（11 个事件类型） |
| v0.25.0 | SM-18 | Phase transition 保存状态快照 |
| v0.25.0 | LOG-1~3 | 日志原子化写入 + JSONL 增量追加 |
| v0.25.0 | LOG-4 | DIAG 日志整合到 EventBus |
| v0.27.0 | SM-15 | Reject 时 round 只递增一次 |
| v0.28.0 | SM-19 | reviewed 状态只应该在 Phase 4b 之后出现 |

### 3.3 测试与工具

| 版本 | 新增 | 说明 |
|------|------|------|
| v0.25.0 | E2E testing skill | 端到端测试框架（远程执行 + 本地分析） |
| v0.27.0 | 测试覆盖率工具 | vitest coverage 配置 + 影响分析脚本 |
| v0.27.0 | 可复现 Bug 测试 | ConfigurableMockExecutor 模拟 16 个历史 bug |
| v0.28.0 | Pre-commit hook | husky + lint-staged（tsc --noEmit + 相关测试） |
| v0.28.0 | Dirty Mock 测试 | DirtyMockExecutor（6 种脏模式） |
| v0.28.0 | LLM 解析边界测试 | 35 个边界测试（E1-E4） |
| v0.28.0 | PR Evidence 检查 | CI 验证 PR 包含测试/文档变更 |
| v0.29.0 | 自动化版本管理 | commitlint + release-it（Conventional Commits） |

### 3.4 其他修复

| 版本 | 修复 | 说明 |
|------|------|------|
| v0.26.0 | Issue #74 | Round 文件名一致性（chapter.round 创建 task ID） |
| v0.28.0 | TUI 状态行改进 | 合成单行显示当前任务和最新日志 |
| v0.28.0 | Impact analysis 工具 | 变更影响分析（测试与模块关联标注） |
| v0.29.0 | Bug #125 | 基线提取器表格处理（表格单元格冒号不再误解析） |

---

## 4. 待办

### 4.1 P0：无

**没有阻断性待办。**

### 4.2 P1：代码层债务

| # | 任务 | 位置 | 说明 |
|---|------|------|------|
| **D8** | 清理死代码 | `content-validator.ts` | `paragraphLengthValid` 永远返回 `true`，`shortParagraphs` 永远为 `[]` |
| **D8** | 清理死代码 | `scheduler/types.ts:31` | `'rate_limited'` 枚举值无使用 |
| **D8** | 清理死代码 | `writing/task-executor.ts` | `checkWordCount()` 无调用方 |
| **D4** | 宽松匹配未修 | `kit-generator.ts:244` | `k.includes(lower.slice(0, 2))` 只取前 2 字符，几乎匹配任何内容 |

### 4.3 P2：测试/质量

| # | 任务 | 说明 |
|---|------|------|
| **D1** | 字数控制检测层完善 | 预防层 ✅，兜底层 ✅，但检测层 ❌（Writer 完成后无轻量级后处理）。`checkWordCount()` 是死代码 |
| **D2** | Fallback 按章节类型分配 | 通用参考资料 ✅，但所有 fallback 章节获得完全相同的资料。需根据章节类型分配不同通用资料 |
| **D5** | LLM 语义规划大纲端到端测试 | 代码已实现，有单元测试，但缺少端到端测试 |
| **D6** | 篇幅下限 / turn 预算校准 | 篇幅下限 5000，实测 60% 章节低于下限。需调整字数预算策略 |

### 4.4 P3：体验/可观测性

| # | 任务 | 说明 |
|---|------|------|
| **D7** | 结构稳定性验证 | 节数 37→6 波动，根因（循环压缩）已消除，但无新端到端运行数据验证 |
| **D9** | TUI 实时显示 subagent 行为 | 远端 TUI 当前只显示 subagent 状态，需要实时显示当前正在执行的工具调用 |

---

## 5. 已确认的关键结论（勿重复推翻）

### 5.1 字数超标根因（已修复）

```
prompt 写着：「每个子节（## 或 ### 下的内容）整体不少于 5000 字」
                ↑ 度量发生在 ch 的内部（小节层）

一个 ch 被切成约 27 个小节：
27 个小节 × 5000 字 = 要求这一个 ch 写 135,000 字
模型单次回答实际只能产出 ≈ 18,000 字
差 7.5 倍
```

**修复**：`MIN_CHAPTER_CHARS = 5000`（v0.21.2 从 8000 改为 5000），措辞统一为「整个章节正文合计 ≥ 5000 字，不按内部小节分别计算」。

### 5.2 字数控制三层防御（已实现）

| 层 | 机制 | 状态 |
|----|------|------|
| **预防** | Writer prompt 明确限制 | ✅ v0.15.0 |
| **检测** | Writer 完成后轻量级后处理 | ❌ 未实现（D1） |
| **兜底** | Reviewer 最终检查 | ✅ v0.20.0 |

### 5.3 术语对齐

| 层级 | 编号 | 系统内 id | 用户叫它 |
|------|------|-----------|---------|
| 章 | `1.` `2.` | 大纲 h2 | — |
| **节** | `1.1` `2.1` | **ch001–ch015** | **ch** |
| 小节 | `2.1.1` | 草稿里的 `##` | — |
| 小小节 | `2.1.1.1` | 草稿里的 `###` | — |

**工作单元 = ch 级**。一次 subagent 调用 = 写一个 ch，编写与度量都在 ch 层。

---

## 6. 历史数据（证据基础）

### 6.1 各 ch 实测（ch 级篇幅修复后）

| ch | turns | tools | bash | edit | 耗时 | 中文字 | 节数 |
|----|-------|-------|------|------|------|--------|------|
| ch001 | 34 | 33 | 14 | 13 | 1108.9s | 24,495 | 37 |
| ch003 | 15 | 14 | 0 | 0 | 344.3s | 17,917 | 27 |
| ch007 | 22 | 20 | 7 | 6 | 749s | 14,367 | 7 |
| ch008 | 10 | 9 | 5 | 0 | 291s | 14,694 | 9 |
| ch009 | 35 | 34 | 15 | 11 | 874s | 17,663 | 11 |
| ch010 | 9 | 10 | 4 | 0 | 245s | 13,364 | 8 |
| ch011 | 14 | 13 | 7 | 0 | 313s | 13,275 | 8 |
| ch012 | 13 | 12 | 5 | 1 | 316s | 14,374 | 9 |
| ch013 | 10 | 9 | 5 | 0 | 251s | 12,189 | 12 |
| ch014 | 18 | 19 | 11 | 2 | 355s | 15,734 | 11 |
| ch015 | 16 | 15 | 9 | 1 | 246s | 12,067 | 9 |

**按「每 ch ≥ 5000 字」核对：全部达标（1.5x–3.1x 余量）。**

### 6.2 字数控制效果（v0.21.2 实测）

| 指标 | v6（修复前） | v8（修复后） | 目标 |
|------|------------|------------|------|
| 平均每章字数 | 17,500 字符 | 4,800 字符 | 5,200-7,800 |
| 超限章节比例 | 100% | 0% | 0% |
| 低于下限比例 | 0% | 60% | < 20% |
| 总字数 | ~175,000 | ~48,000 | 50,000 |

**遗留问题**：60% 章节低于字数下限（需调整字数预算策略，见 D6）。

---

## 7. 恢复工作的方法

```bash
cd /path/to/confwrite
git branch --show-current      # 应为 master
git status --short             # 应为空

# ① 确认 dist 是新版（dist/ 不被 git 跟踪，切分支后不 build 会静默跑旧代码）
npm run build

# ② 构建与测试
npm run build && npm test

# ③ 直接复现导出（不跑整个流程）
node -e "
const {exportDocument}=require('./dist/commands/export.js');
const P='/home/water/Projects/t3/projects/LmERP2';
exportDocument(P,{format:'docx',outputPath:P+'/output/final.docx',toc:true})
  .then(r=>console.log(r.success));
"

# ④ 让完整流程自己走（需先重启 t3 的 pi 以加载新 dist）
herdr agent prompt wD:p1 "/confwrite:write projects/LmERP2"
```

---

## 8. 项目状态

### 8.1 LmERP2 项目

| 项 | 值 |
|----|-----|
| 路径 | `/home/water/Projects/t3/projects/LmERP2` |
| 阶段 | **`done` ✓（流程自行走完，收尾无报错）** |
| 章节 | **15 章全部 completed** |
| 草稿 | `drafts/chapters/ch001-v1.md` … `ch015-v1.md` |
| 图表 | `figures/` 29 张（png+svg，分层配色 7~8 色） |
| 产物 | `assembly/merged-v1.md`、`output/final.md`、`output/final.docx` |

### 8.2 LMERP2V2 项目（200 章，百万字级）

| 项 | 值 |
|----|-----|
| 路径 | `/home/water/proj/c4/projects/LMERP2V2-new` |
| 阶段 | **`done` ✓（流程自行走完）** |
| 章节 | **200 章全部 completed** |
| 产物 | `output/final.docx` (13.6 MB) |
| 并发 | `maxConcurrency=2`（已验证生效） |
| 运行时间 | 约 6 小时（含多次手动触发） |

---

## 9. 附带文档

| 文件 | 内容 |
|------|------|
| **`BUGS.md`** | Bug 证据、根因、修复状态 |
| `README.md` | 项目入口 + 使用 + 架构概览 |
| `DESIGN.md` | 详细设计文档 |
| `CHANGELOG.md` | 版本变更记录 |
| `SKILL.md` | pi 框架 Skill 定义 |
| `AGENTS.md` | Coding Agent 开发指南 |
