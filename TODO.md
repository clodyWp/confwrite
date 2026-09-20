# 待办与交接（ConfWrite）

> 最后更新：2026-09-20（第三轮：重跑打通，收尾干净）
> 当前分支：`fix/diagram-and-export` @ `89153fd`
> 基线：`feat/ch-level-length` @ `39fdf88`
> 测试：**735 通过**（84 文件）
> Bug 详情见 **`BUGS.md`**（30 个，22 已修）——本文档只记「现在在哪 / 下一步做什么」

---

## 1. 一句话现状

**「沿用现有 15 章产物 → 图表准确 → 导出完整 Word」已端到端走通，
而且是自动化流程自己走完的（不是我手工调代码生成的）。**

```
Phase 5 → 6     14:07:53   29 张图（分层配色）+ 组装 → 停在人工确认点
Phase 6 → 7     14:09:43   定稿
Phase 7 → 8     14:09:43   导出
Phase 8 → done  14:09:44   ✓ 收尾干净，无报错
```

**产物**：`output/final.docx` = 1,472,671 B，29 张内嵌图片 + TOC 域 +
Heading1 × 1 / Heading2 × 16 / Heading3 × 67。

**共修 22 个 bug**（分三轮）：

| 轮次 | 修了什么 | 数量 |
|---|---|---|
| 一轮 | 图表准确 + 图表进文档 + 阶段/导出接线 | 14 |
| 二轮 | 导出质量（分隔符、图片、标题、层级、锚点） | 5 |
| 三轮 | 重跑暴露的静默错误（28/29/30） | 3 |

**未做**：第 4 阶段（写作/审阅/修复）的收敛性问题（7 个 bug）。
本次刻意不碰 —— 目标是复用已有草稿，不重做第 4 阶段。

- 图表从「全部单色、29 张一张没进文档」修到「5 层配色、29/29 全部内嵌」
- 导出从「pandoc 直接报错、流程永不到达」修到「`output/final.docx` = 1,470,199 B，29 张图 + TOC + 正确标题层级」
- 共修 **19 个 bug**，新增 57 个测试

**未做**：第 4 阶段（写作/审阅/修复）的收敛性问题（7 个 bug）。
本次刻意不碰——目标是复用已有草稿，不重做第 4 阶段。

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

> ⚠️ 这份 docx 是**直接用 phase 8 相同的代码路径**（`exportDocument`）生成的，
> 没有让自动化流程自己走完 `5→6→7→8`。产物本身可信，但流程状态仍停在 phase 6 的等待点。

---

## 3. 已完成（本轮）

### 3.1 图表准确

| Bug | 问题 | 修复 |
|---|---|---|
| 17 | 所有节点同一颜色（每张图只有 2 个色值） | `DEFAULT_LAYER_PALETTE` 五层配色，可配置数据 |
| 18 | 硬编码 `Microsoft YaHei`（Linux 上 0 匹配） | `CJK_FONT_FAMILY` 回退链；**含连接线标签的漏网处** |
| 19 | 分段标题只认半角 `:` | 兼容中文全角 `：` |
| 20 | 连接标签带 `- ` 前缀 | 分支前剥离列表前缀 |
| 21 | 多跳链 `A → B → C → D` 只解析首尾一条边 | 拆分后依次连接；`（注解）` 提取为边的 label |
| 14 | `init` 复制 `dist/knowledge`（编译产物） | `resolveKnowledgeDir(moduleUrl)` 上溯三层到包根 |

### 3.2 图表进文档

| Bug | 问题 | 修复 |
|---|---|---|
| 12 | 29 张图从未插入文档 | 新增 `src/diagrams/injector.ts`，组装时注入 |
| 15 | `path-adjuster.ts` 是死代码 | 结案：injector 不需要它（它只改已存在的引用） |

### 3.3 流程与导出

| Bug | 问题 | 修复 |
|---|---|---|
| 1 | 熔断后空转 2000 tick（实测刷 12,036 条通知） | 熔断时 `break` 外层循环 |
| 2 | `stoppedReason` 被 `max_ticks` 覆盖 | 仅在不为空时才赋值 |
| 9 | phase 8 的导出动作无人处理 | `execute()` 内真调用 `exportDocument` |
| 10 | waitPoint 跳过 `execute()` | 引入 `timing: 'entry' \| 'after-execute'` |
| 16 | `checkDependencies()` 死代码 | phase8 `validate()` 调用它，缺失给安装指引 |
| 22 | 组装产物缺文档标题 | `resolveDocumentTitle(projectDir)` |
| 23 | TOC 锚点不存在（15 条链接全点不动） | 标题追加 `{#chXXX}` |
| 24 | 标题层级扁平（Heading1 × 17） | 有标题时目录与章节整体降一级 |
| 25 | 分隔符 `---` 被 pandoc 当 YAML 块 → **导出失败** | 分隔符改 `***` |
| 26 | pandoc 按进程 cwd 找图 → **29 张图全未嵌入** | `execFileSync` 传 `cwd` |
| 27 | 导出未解析 title → 缺标题、未降级 | `?? assembler.resolveDocumentTitle(projectDir)` |
| **28** | **残留产物让阶段跳过自己的工作**（pandoc 报错却报 done） | **新增 `onEnter` 钩子；phase 6/7/8 进入时清自己的残件** |
| **29** | **图表缓存只比哈希、不查产物是否存在**（29 张图全 skip） | **`shouldRegenerate` 先查 svg/png 是否存在** |
| **30** | **`done` 未注册进 phases 表 → 收尾报错** | **注册终态阶段 + 循环顶部 tick 前判终态** |

> Bug 28/29/30 都是**把 5→8 真正跑通**才暴露的静默错误，
> 详见 `BUGS.md` §1b。其中 28 的真相比我最初描述的更严重：
> 不只是「失败被掩盖」，而是出口检查在前、**阶段根本不会执行导出**。

### 3.4 测试

```
全量 735 通过（84 文件），新增 70 个

关键：三组测试验证过「未修复时会失败」，避免写出无意义的测试
  tests/orchestrator/circuit-breaker-stop.test.ts   expected 2000 to be less than 50
  tests/commands/export-docx-images.test.ts         expected 0 to be greater than or equal to 1
  tests/assemble/assembler-structure.test.ts        标题层级断言
```

---

## 4. 待办

### 4.1 P0：无

本轮目标已达成 —— **完整 Word 文件已由自动化流程产出**（§1）。
**没有阻断性待办。**

### 4.2 P1：第 4 阶段收敛性（未做，需用户决策）

这一组是**写作/审阅阶段反复循环**的原因。本次刻意不碰。

| Bug | 问题 | 说明 |
|---|---|---|
| **6** | 「段落/图表说明 ≥300 字」规则永不收敛 | **根本原因**。实测 ch010 报「需要扩充至少 17 字以上」，来回拉锯 |
| 4 | 审阅 accept 门槛「全部通过」几乎达不到 | 15 章里 12 章被判 revise |
| 5 | 裁决与严重度不相关 | low 级问题也触发 revise |
| 7 | 审阅报告被覆盖（`round` 卡在 1） | 无法对比修复效果 |
| 8 | 429 指数退避是死代码 | 7 次限流事件时间戳完全相同 → 退避从未等待 |
| 3 | `pending` 孤儿 / 4c 死锁（`round > 1` 条件） | 本次手工改状态绕开 |

> 若决定重做第 4 阶段，建议分 2–3 个分支：
> `fix/review-convergence`（4、5、6、7、8）＋ `fix/pipeline-blockers`（3，含单章轮次上限）。

### 4.3 P2：图表方案 B（已决策「A 先做、B 后续」）

**方案 A 已完成**（分层配色 + 自适应字体 + 知识库路径 + 色表落地为可配置数据）。

**方案 B**（未做）：把知识库作为生成器的**一等输入**——
`pipeline.ts` 加载 `knowledge/diagrams/`（`architecture-style.md`、`layout.md`、
`quality-lessons.md`），据此做模块子项、横切关注点侧栏、多布局选择。

设计上已为 B 留好接口：配色是数据（`DEFAULT_LAYER_PALETTE` / `DiagramStyle.layerPalette`），
不是硬编码常量。

### 4.4 P3：小项

| # | 事项 | 说明 |
|---|------|------|
| 1 | Bug 11：`finalization.json` 字段命名 | `chapters: 67` 实际是 `## ` 计数，真实 15 章；`images: 0` |
| ~~2~~ | ~~让流程自己走完 `5→6→7→8`~~ | ✅ **已完成**（14:07→14:09，见 §1） |
| 3 | 篇幅下限 8000 是否合适 | 实测 ch003–ch015 产出 12,067–17,917 字，均在 8000 以上 |
| 4 | turn 预算阈值校准 | 当前 40；历史最大 34，ch002/ch011 的 fixer 触发过 41 次 |
| 5 | 结构稳定性（节数 37→6 波动） | 上次修复**可能**已间接解决（不再需要碎片化迎合要求），待新数据 |

### 4.5 ⚠️ 合并前必做

**`feat/responsibility-separation` 含同样的层级错误。**

该分支写着「每个子节建议 3000–5000 字」，与本项目此前的根本原因同源
（见 §6.1）。合并前必须一并改为 **ch 级**口径，否则事故会重演。

---

## 5. 分支与文档版本控制

### 5.1 分支现状

```
master ──── 4d30e14 (v0.7.3 已发布基线)
  │
  ├── feat/responsibility-separation @ f62f85c      （从 master 分出，未验证，无 TODO.md）
  │
  └── 1e502ff (tag: before-ch-level-fix)
        └── feat/tool-least-privilege              （回退点，已被取代）
              └── feat/ch-level-length @ 39fdf88    （ch 级篇幅 + bash 恢复，已验证）
                    └── fix/diagram-and-export @ 89153fd  ← 当前，22 个修复
```

`fix/diagram-and-export` **线性包含** `feat/ch-level-length` 的全部提交。

### 5.2 文档会不会因多分支冲突？

**会，但可以控制。** 分两种情况：

**① 现在不会。** git 冲突的条件是「两边都改了同一文件的同一区域」。
目前只有一条分叉线有 `TODO.md` / `BUGS.md`：

| 分支 | TODO.md | 合并到当前分支的结果 |
|---|---|---|
| `feat/ch-level-length` | 11,760 B | 快进合并，不冲突 ✓ |
| `feat/tool-least-privilege` | 7,207 B（旧） | 它是祖先，不冲突 ✓ |
| `feat/responsibility-separation` | 无（分叉点 master 也无） | 只有我们这边「新增」→ 不冲突 ✓ |

**② 以后会。** 一旦两个分支都从「已有 TODO.md」的基点各自修改它，合并必然冲突。

### 5.3 约定（照这个做就不会冲突）

| 文档类型 | 放哪 | 为什么 |
|---|---|---|
| **迭代计划/完成报告**（`ITERATION-PLAN-vX.md`） | 分支内新增，文件名带版本号 | 各分支只「新增」自己的文件，永不同改 → 永不冲突（已见效） |
| **专项方案**（`PLAN-tool-least-privilege.md`） | 同上 | 同上 |
| **`BUGS.md`** | 跟着**修复分支**走 | 它是「这一轮修了什么」的记录，随分支合并 |
| **`TODO.md`** | 只在**主干线**改 | 它是「当前状态摘要」，不承载历史 → 合并时直接选一边即可 |
| **`GIT-GUIDE.md`** | 只在 `master` 改 | 与具体功能无关的通用文档 |

**冲突时的处理**（`TODO.md` 这类状态型文档）：

```bash
# 冲突后不要手工编辑，直接选一边（反正是状态摘要，不是历史）
git checkout --ours TODO.md      # 保留当前分支的版本
# 或
git checkout --theirs TODO.md    # 保留传入分支的版本

git add TODO.md && git commit
```

> ❌ 不推荐 `.gitattributes` 的 `merge=union`——它会把两个版本直接拼接，
> 产生重复段落，比冲突更难清理。

---

## 6. 已确认的关键结论（勿重复推翻）

### 6.1 根本原因：prompt 的度量层级错了一层（已修复）

```
prompt 写着：「每个子节（## 或 ### 下的内容）整体不少于 5000 字」
                ↑ 度量发生在 ch 的内部（小节层）
```

一个 ch 被切成约 27 个小节：

```
27 个小节 × 5000 字 = 要求这一个 ch 写 135,000 字
模型单次回答实际只能产出 ≈ 18,000 字
                       ─────────────────────
                       差 7.5 倍
```

**修复**：`MIN_CHAPTER_CHARS = 8000`，措辞统一为
「整个章节正文合计 ≥ 8000 字，**不按**内部小节分别计算」。

### 6.2 连锁后果（全由这一个词引起）

| # | 现象 | 机制 |
|---|------|------|
| ① | 「量字数→补内容→再量」循环 | 每节要求 5000 而实际 660，模型反复测量补充 |
| ② | 循环吃掉 **50% 运行时间** | ch001: 554.8s / 1108.3s |
| ③ | 章节被切成 27 个碎片 | 为迎合「每节独立达标」而过度细分 |
| ④ | 结构在 **37→6 节**之间剧烈波动 | 碎片化程度不受控 |

### 6.3 前几版的错误结论（已废弃，勿再引用）

| 曾经的结论 | 实际情况 |
|---|---|
| ❌「80% 工具调用是病态校验循环」 | 那些 bash 原文是 `Count characters per ## section`，是**有目的的补写尝试** |
| ❌「移除 bash 可让循环物理上不可能」 | 循环确实消失，但代价是**连「写得不够」也感知不到**（篇幅 -37%） |
| ❌「问题在于任务粒度太大，需重构调度器」 | 不需要。**改一个词即可** |
| ❌「工具最小权限是主要优化」 | 它在修一个由 prompt 笔误制造出来的伪问题 |

### 6.4 ⚠️ 一条无效测量，勿引用

曾报告「ch002 从 34 turns 降到 7 turns，-79%」——**无效**。
那次运行**没有调用任何 write/edit**，只是读取上次遗留的草稿并校验。

```
logs/subagent-write-ch002-r1.log
  第1次: 写入（产生 ch002-v1.md）
  第2次: 仅校验，无写入 → Turns: 7
```

**教训**：在非干净初始状态上重跑，模型只做校验不做写作。

### 6.5 术语对齐（此前沟通不畅的原因）

```
智慧园区...技术方案                              ← 文档
│
├── 1. 投标概述                                 ← 章（6 个）
│   ├── 1.1 项目理解与需求分析                    ← 节  = ch001  ← 用户说的 "ch"
│   │   ├── ## 概述                             ← 小节（模型自己切）
│   │   │   └── ### xxx                        ← 更下一层
```

| 层级 | 编号 | 系统内 id | 用户叫它 | 曾误叫成 |
|------|------|-----------|---------|---------|
| 章 | `1.` `2.` | 大纲 h2 | — | — |
| **节** | `1.1` `2.1` | **ch001–ch015** | **ch** | ❌「章」 |
| 小节 | `2.1.1` | 草稿里的 `##` | — | ❌「节」 |
| 小小节 | `2.1.1.1` | 草稿里的 `###` | — | ❌「子节」 |

**需求口径**：工作单元 = **ch 级**。一次 subagent 调用 = 写一个 ch，
编写与度量**都在 ch 层**，单次产出 ≥ 字数下限。

---

## 7. 历史数据（证据基础）

### 7.1 各 ch 实测（ch 级篇幅修复后）

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

**按「每 ch ≥ 8000 字」核对：全部达标（1.5x–3.1x 余量）。**

### 7.2 耗时构成（修复前后）

```
ch001 旧  总 1108.3s │ 写作 534.5s (48%) │ 读取 19.0s │ 循环 554.8s (50%)
ch003 新  总  343.7s │ 写作 273.2s (79%) │ 读取 52.7s │ 循环  17.8s ( 5%)
```

「循环」那 50% 就是 §6.1 根因造成的浪费。

### 7.3 turn 预算（已实现，已生效）

`[budget] turn 41 超过上限 40，中止` —— ch002、ch011 的 fixer 各触发一次。

> 这**同时验证了** `abort()` 之后 `session.prompt()` 会正常 resolve，
> 即预算机制真的能中断而不是挂死。

### 7.4 模型解析链路（已修复，这条曾经很坑）

```
PiSubagentExecutor 构造时只传 {projectDir, maxTurnsPerTask}，没有 model
  → createAgentSession({ cwd: projectDir })
  → pi 在 join(cwd, '.pi', 'settings.json') 找配置（**精确 cwd，不向上查找**）
```

全局 `~/.pi/agent/settings.json` 里是 `qwen-token-plan-cn / qwen3.7-plus`，
所以 **subagent 一直跑的是 qwen，不是面板上显示的 deepseek**——
早期所有「deepseek vs qwen」的对比都不干净。

**修复**：写 `LmERP2/.pi/settings.json`：

```json
{ "defaultProvider": "deepseek", "defaultModel": "deepseek-flash" }
```

---

## 8. 恢复工作的方法

```bash
cd /home/water/Projects/confidenceWriter
git branch --show-current      # 应为 fix/diagram-and-export
git status --short             # 应为空

# ① 确认 dist 是新版（dist/ 不被 git 跟踪，切分支后不 build 会静默跑旧代码）
grep -c '整个章节（本 ch）正文合计' dist/writing/task-executor.js   # 1
grep -c 'DEFAULT_LAYER_PALETTE'   dist/diagrams/style.js           # >0
grep -c 'injectDiagrams'          dist/assemble/assembler.js       # >0
grep -c 'exportDocument'          dist/orchestrator/phases.js      # >0

# ② 构建与测试
npm run build && npm test      # 735 通过

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

### 回退方式

```
tag   before-ch-level-fix          ─┐
                                    ├─→ 1e502ff  ← 修正前的快照
分支  feat/tool-least-privilege     ─┘             （原地未动）
```

```bash
git checkout feat/tool-least-privilege
npm run build     # ← 必须，dist/ 不被 git 跟踪
```

---

## 9. t3 / LmERP2 项目状态

| 项 | 值 |
|----|-----|
| 路径 | `/home/water/Projects/t3/projects/LmERP2` |
| 阶段 | **`done` ✓（流程自行走完，收尾无报错）** |
| 章节 | **15 章全部 completed** |
| 草稿 | `drafts/chapters/ch001-v1.md` … `ch015-v1.md` |
| 图表 | `figures/` 29 张（png+svg，分层配色 7~8 色） |
| 产物 | `assembly/merged-v1.md`、`output/final.md`、`output/final.docx` |
| 阶段轨迹 | `5 → 6`（14:07:53）→ `6 → 7`（14:09:43）→ `7 → 8` → `8 → done`（14:09:44） |
| herdr | t3 会话 `wD:p1`，idle（已加载 14:12 构建的 dist） |
| 手工改动 | ① ch002/ch006/ch007/ch010/ch011 由 `pending` 改为 `completed`（绕开 Bug 3）<br>② 重跑前清空 `figures/`、`assembly/`、`output/`（保留 `drafts/`）<br>备份：`project-state.json.bak-115911` / `.bak-rerun-*` / `.bak-prerun-*` |

> 所有产物都是**第二次重跑真实产出的** —— 不是我手工调代码生成的。
> 从用户「确认」到出 Word 文件约 20 秒。

---

## 10. 附带文档

| 文件 | 内容 |
|------|------|
| **`BUGS.md`** | **27 个 bug 的证据、根因、修复状态（19 已修）** |
| `GIT-GUIDE.md` | Git 分支操作指南（面向不熟悉 git 者） |
| `PLAN-tool-least-privilege.md` | 旧计划（**其前提已被推翻**，见 §6.3） |
| `ITERATION-PLAN-v0.7.3.md` | 上一轮迭代计划 |
| `ITERATION-COMPLETE-v0.7.3.md` | 上一轮迭代完成报告 |
