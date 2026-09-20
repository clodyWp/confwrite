# ConfWrite v0.8.0 迭代完成报告

> **版本**：v0.7.3 → **v0.8.0**
> **日期**：2026-09-20
> **分支**：`fix/diagram-and-export`（基线 `feat/ch-level-length` @ `39fdf88`）
> **方法**：TDD（Red → Green → Refactor），每步真机验证
> **状态**：✅ 已完成 —— 「图表准确 → 导出完整 Word」端到端跑通

---

## 1. 一句话总结

**把一条从头到尾都走不通的链路修成能自动化跑完的链路，并产出一份真正可用的 Word 文件。**

```
修复前：29 张图全是单色 → 一张都没进文档 → 导出 pandoc 直接报错 → 流程永不到达
修复后：29 张图 5 层配色 → 29/29 全部内嵌 → final.docx 1.47 MB + TOC + 正确层级
```

**共修 22 个 bug**，新增 70 个测试（735 通过）。

---

## 2. 起点：为什么要做这一轮

上一轮（`feat/ch-level-length`）定位到**真正的根因**：writer prompt 把「节」误写成「子节」，
导致度量层级错了一层——要求单个 ch 写 135,000 字，而模型单次回答只能产出约 18,000 字，
差 7.5 倍。模型于是陷入「量字数 → 补内容 → 再量」的循环，吃掉 50% 运行时间。

修正后做了**一次完整的端到端运行**（07:55 → 11:52，15 章），结果：

| 阶段 | 结果 |
|---|---|
| 4a 写作 | ✅ 15 章，226,332 中文字 |
| 4b 审阅 | ✅（多轮反复） |
| 4c 决策 | ⚠️ 死锁 |
| 4d 修复 | ✅ |
| 5 图表生成 | ⚠️ 29 张图**全部只有 2 个颜色值** |
| 6 组装 | ⚠️ 首次跳过 → 第二次成功 |
| 7 定稿 | ✅ |
| **8 导出** | ❌ **卡死** |

**产物：`assembly/merged-v1.md` = 1.16 MB / 310,887 中文字 —— 但 29 张图一张都没进文档，
而且永远无法导出成 Word。** 这次运行同时产出了 `BUGS.md`（当时 18 个 bug）。

本轮的任务：**不重做第 4 阶段，沿用这 15 章草稿，把图表修准、把 Word 导出来。**

---

## 3. 修复清单（22 个，分三轮）

### 3.1 第一轮：图表准确 + 图表进文档 + 接线（14 个）

| Bug | 问题 | 修复 |
|---|---|---|
| 17 | 所有节点同一颜色（实测每张图仅 2 个色值） | `DEFAULT_LAYER_PALETTE` 五层配色（接入蓝/应用绿/支撑橙/数据紫/基础灰） |
| 18 | 硬编码 `Microsoft YaHei`，Linux 上 0 匹配 | `CJK_FONT_FAMILY` 字体回退链（**含连接线标签的漏网处**） |
| 19 | 分段标题只认半角 `:` | 兼容中文全角 `：` |
| 20 | 连接标签带 `- ` 项目符号 | 分支前剥离列表前缀 |
| 21 | 多跳链 `A → B → C → D` 只解析首尾一条边 | 拆分后依次连接；`（注解）` 提取为边的 label |
| 14 | `init` 复制 `dist/knowledge`（编译产物） | `resolveKnowledgeDir(moduleUrl)` 上溯三层到包根 |
| 12 | **29 张图从未插入文档** | 新增 `src/diagrams/injector.ts`，组装时注入 |
| 15 | `path-adjuster.ts` 是死代码 | 结案：injector 不需要它（它只改已存在的引用） |
| 1 | 熔断后空转 2000 tick（实测刷 12,036 条通知） | 熔断时 `break` 外层循环 |
| 2 | `stoppedReason` 被 `max_ticks` 覆盖 | 仅在不为空时才赋值 |
| 9 | phase 8 的导出动作无人处理 | `execute()` 内真调用 `exportDocument` |
| 10 | waitPoint 跳过 `execute()` | 引入 `waitPoint.timing: 'entry' \| 'after-execute'` |
| 16 | `checkDependencies()` 死代码 | phase 8 `validate()` 调用它，缺失给安装指引 |
| 22 | 组装产物缺文档标题 | `resolveDocumentTitle(projectDir)` |

### 3.2 第二轮：导出质量（5 个，都是真机导出才暴露的）

| Bug | 问题 | 关键证据 |
|---|---|---|
| 23 | TOC 链接指向 `#ch001`，但文档里 0 个锚点 | 15 条链接全点不动 |
| 24 | 标题层级扁平 | docx 里 **Heading1 有 17 个** |
| 25 | 分隔符 `---` 紧跟标题被 pandoc 当 YAML 元数据块 | **导出退出码 64**，`did not find expected <document start>` |
| 26 | pandoc 按**进程 cwd** 解析相对图片路径 | **29 张图全部未嵌入**，且 `success` 仍是 `true`（静默） |
| 27 | 导出未解析 title | 缺文档标题 + 章节未降级 |

修复后：Heading1 从 17 → **1**，图片 0 → **29**，`success` 名副其实。

### 3.3 第三轮：重跑暴露的静默错误（3 个）

**这一轮才是对前两轮修复的真正验收。** 三个 bug 有个共同特征——都是**静默错误**：

| Bug | 静默方式 | 证据 |
|---|---|---|
| **28** | 残留产物让阶段跳过自己的工作 → pandoc 报错，流程报成功 | 状态进入 `done`，产物是 552 KB 的坏文件（29 张图全变 alt 文字） |
| **29** | 图表缓存只比哈希、不查产物是否存在 → 29 张图全 skip，阶段报完成 | 清空 `figures/*` 但留 manifest 后，一张图都没生成 |
| **30** | 到达 `done` 后收尾报 Error，成功运行看起来像失败 | `Error: ⛔ 未知: 未知 Phase: done` |

---

## 4. 关键发现（技术洞察）

### 4.1 出口条件先于 execute —— 一个系统性的设计陷阱

状态机的 tick 顺序是：

```
1. 检查出口条件 → 满足就跳转（**在 validate / execute 之前**）
2. validate    3. waitPoint    4. execute
```

而 phase 6/7/8 的出口条件都是「某个文件存在」，**那个文件又正是本阶段自己要产出的**。
于是上次运行留下的残件让出口条件直接成立：

| 残留文件 | 后果 |
|---|---|
| `assembly/merged-v1.md` | phase 6 跳过组装，**连人工确认点也跳过** |
| `output/finalization.json` | phase 7 跳过定稿 |
| `output/final.docx` | phase 8 **跳过导出**并报 done |

**修 Bug 28 时发现真相比最初描述更严重**：不只是「失败被掩盖」，而是出口检查在前、
**阶段根本不会执行导出**。

> 我第一版测试把状态直接设成 phase 8，结果 `onEnter` 不触发（没有「进入」动作）。
> 改成从 phase 7 真实跳转后才通过——**测试的搭建方式本身会成为盲区**。

**修法**：`PhaseDefinition` 新增 `onEnter` 钩子，phase 6/7/8 各自清掉自己产物的残件。
**只清工作产物，不清缓存** —— `figures/manifest.json` 是缓存，命中时跳过重算是正确行为，
故 phase 5 不加 `onEnter`。

### 4.2 pandoc 解析相对路径看的是「进程 cwd」

Bug 26 的对照实验：

| 调用方式 | 结果 |
|---|---|
| `cd output/` 后手动跑 pandoc | **0 警告**，图片全嵌入 |
| 经 `exportDocument`（cwd = 调用方） | **29 警告**，图片全缺失 |

修法：`execFileSync(..., { cwd: dirname(tempMdPath) })`。

### 4.3 「素材层做对了」不等于「流程走通了」

这是本轮最重要的方法论结论。第一轮修完 14 个 bug 后，各层单独看都没问题，
但**只有把 5→8 真跑一遍**才暴露 28/29/30。三者都是「磁盘上有产物 ≠ 流程真的走通了」。

### 4.4 为方案 B 留的接口

图表分层配色落地为**可配置数据**而非硬编码常量：

```ts
DEFAULT_LAYER_PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#64748b']
DiagramStyle.layerPalette?          // 项目可通过 assets/diagram-style.json 覆盖
getLayerPalette(style)              // 单一读取入口
```

这样方案 B（知识库作为生成器一等输入：模块子项、横切关注点侧栏、多布局选择）
不需要推翻方案 A。

---

## 5. 真机验证：端到端跑通

清空 `figures/`、`assembly/`、`output/`（保留 `drafts/`），从**阶段 5**重跑：

```
Phase 5 → 6     14:07:53   29 张图（7~8 色）+ 组装 → 停在人工确认点
Phase 6 → 7     14:09:43   定稿
Phase 7 → 8     14:09:43   导出
Phase 8 → done  14:09:44   ✓ 收尾干净，无报错
```

### 最终产物

| 文件 | 大小 | 内容 |
|---|---|---|
| `figures/` | 29 SVG + 29 PNG + manifest | 分层配色（实测每张 3~8 个色值） |
| `assembly/merged-v1.md` | 1,127,292 B | 14 个安全分隔符、29 处图片引用、标题 + 目录 |
| `output/final.md` | 1,127,292 B | 同上 |
| `output/finalization.json` | 463 B | `images: 29`（修复前 0） |
| **`output/final.docx`** | **1,472,671 B** | **29 张内嵌图 + TOC 域 + Heading1×1 / 2×16 / 3×67** |

**从用户「确认」到出 Word 文件约 20 秒。**

### 修复前后对照

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 每张图的色值数 | 2 | 3~8（五层各一色） |
| 文档中的图片数 | **0** | **29** |
| pandoc 导出 | **退出码 64，失败** | 退出码 0 |
| 图片嵌入 | 全被替换为 alt 文字（552 KB） | 29 张真实内嵌（1.47 MB） |
| Heading1 数量 | 17（标题/目录/章节同级） | **1**（仅文档标题） |
| TOC 可跳转链接 | 0/15 | **15/15** |
| `finalization.json` images | 0 | 29 |
| 流程终点 | 卡在 phase 8 空转 | **`done`** |

---

## 6. 测试

```
全量 735 通过（84 文件）
本次新增 70 个（相对基线 39fdf88）
```

新增/重写的测试文件（13 个）：

| 文件 | 覆盖 |
|---|---|
| `tests/diagrams/generator-render.test.ts` | 分层配色、跨平台字体（含连接标签） |
| `tests/diagrams/description-parser.test.ts` | 全角冒号、列表前缀、多跳链、注解→边标签 |
| `tests/diagrams/injector.test.ts` | 图表注入 |
| `tests/assemble/assembler-structure.test.ts` | 分隔符、锚点、标题层级（含围栏感知） |
| `tests/assemble/assembler-title.test.ts` | 文档标题解析 |
| `tests/commands/export-docx-images.test.ts` | **解包 docx 校验图片真实内嵌**（需 pandoc+unzip，缺失自动 skip） |
| `tests/commands/init-knowledge.test.ts` | 知识库目录解析 |
| `tests/orchestrator/circuit-breaker-stop.test.ts` | 熔断真的停止 |
| `tests/orchestrator/phase8-export.test.ts` | 导出接线 + 依赖预检 + 残留产物 |
| `tests/orchestrator/stale-artifacts.test.ts` | `onEnter` 清理残件 |
| `tests/orchestrator/done-terminal.test.ts` | `done` 是成功终态 |
| `tests/writing/prompt-length-level.test.ts` | 篇幅口径锁定在 ch 级 |
| `tests/scheduler/pi-executor-*.test.ts` | 工具解析、turn 预算 |

### 测试质量

**三组测试特意验证过「未修复时会失败」**，避免写出无意义的测试：

```
tests/orchestrator/circuit-breaker-stop.test.ts
  expected 2000 to be less than 50          ← ticks 从 2000 降下来
  expected 'max_ticks' to be 'circuit_breaker'
tests/commands/export-docx-images.test.ts
  [WARNING] Could not fetch resource ../figures/ch001-fig1.png
  expected 0 to be greater than or equal to 1
tests/orchestrator/done-terminal.test.ts
  expected 'blocked' to be 'completed'
tests/orchestrator/stale-artifacts.test.ts
  expected true to be false                 ← 残件没被清掉
```

**还删除/修正过假测试**：原先的跨平台工具测试把 `platform() === 'win32' ? …` 复制进测试体
断言自己，根本没碰源码。改为调用真实导出的 `resolveShellTool`。

---

## 7. 交付物

### 源码（12 文件，+769/−149）

新增：
- `src/diagrams/description-parser.ts` —— 图表描述解析（从 `pipeline.ts` 抽出，实现净减 86 行）
- `src/diagrams/injector.ts` —— 把生成的图表注入文档

改动：
- `src/diagrams/generator.ts` / `style.ts` —— 分层配色 + 跨平台字体
- `src/assemble/assembler.ts` —— 分隔符、锚点、标题层级、文档标题
- `src/commands/export.ts` —— cwd 修正、title 解析
- `src/orchestrator/phases.ts` —— `onEnter`、`timing`、`phaseDone`、phase 8 真导出、依赖预检
- `src/orchestrator/state-machine.ts` —— `onEnter` 调用点
- `src/diagrams/cache.ts` —— 产物存在性检查
- `src/commands/init.ts` —— 知识库目录解析
- `src/index.ts` —— 终态判定

### 测试（16 文件，+1660/−29）

### 文档（3 文件，+980/−228）

| 文件 | 内容 |
|---|---|
| `BUGS.md` | **30 个 bug 的证据、根因、修复状态**（22 已修 / 1 部分 / 7 未修） |
| `TODO.md` | 现在在哪、下一步做什么、分支与文档版本控制约定 |
| `GIT-GUIDE.md` | Git 操作指南 + §8「文档与多分支：怎么改才不会冲突」 |

---

## 8. 未做的事（有意为之）

**第 4 阶段（写作/审阅/修复）的收敛性问题，7 个 bug 全部保留：**

| Bug | 问题 | 说明 |
|---|---|---|
| **6** | 「段落/图表说明 ≥300 字」 → **永不收敛** | 根本原因。实测 ch010 报「需要扩充至少 17 字以上」，来回拉锯 |
| 4 | 审阅 accept 门槛「全部通过」几乎达不到 | 15 章里 12 章被判 revise |
| 5 | 裁决与严重度不相关 | low 级问题也触发 revise |
| 7 | 审阅报告被覆盖（`round` 卡在 1） | 无法对比修复效果 |
| 8 | 429 指数退避是死代码 | 7 次限流事件时间戳完全相同 → 退避从未等待 |
| 3 | `pending` 孤儿 / 4c 死锁 | 本次手工改状态绕开 |
| 11 | `finalization.json` `chapters` 统计口径 | 标题降级后 67 → 16（仍多算「目录」） |

**理由**：本轮目标是「沿用已有草稿 → 图表 → Word」，不重做第 4 阶段。
若要做，建议分 `fix/review-convergence`（4、5、6、7、8）与 `fix/pipeline-blockers`（3）。

**方案 B（知识库驱动的图表）** 也未做——A 已为它留好数据接口。

---

## 9. 已知风险

### 9.1 ✅ `feat/responsibility-separation` 已合入并修正

该分支含**与本次根因同源的层级错误**（「每个子节建议 3000–5000 字」）。
已于 `e6e6fe6` 合入本分支，处理方式是「保留职责分离、丢弃错误口径」。
该分支现已是本分支的祖先，可安全删除。

合入时的原始冲突分析（实测两边都改过 `src/writing/task-executor.ts`）：

```
vs feat/responsibility-separation: 双方都改过 → src/writing/task-executor.ts
vs feat/ch-level-length:           无共同修改文件 → 不冲突
vs feat/tool-least-privilege:      无共同修改文件 → 不冲突
```

**文档不冲突，代码会。** 合并前需把该分支的措辞一并改为 ch 级。

### 9.2 数据可信度提醒

- 15 章里有 5 章（ch002/ch006/ch007/ch010/ch011）是**为解决 4c 死锁手工从 `pending` 改为
  `completed`** 的，其质量未经最终确认；ch007/ch010 只有 v1（未修复）。
- 早期「deepseek vs qwen」的对比数据**不干净**：subagent 的模型解析自
  `join(cwd, '.pi', 'settings.json')`（精确 cwd，不向上查找），全局默认是 qwen。
  已通过写入 `LmERP2/.pi/settings.json` 修正。
- 有一条**无效测量勿引用**：曾报告「ch002 从 34 turns 降到 7 turns」，那次运行
  **没有调用任何 write/edit**，只是读取上次遗留的草稿并校验。

### 9.3 环境依赖

docx 导出需要 **pandoc**。phase 8 的 `validate()` 会预检，缺失时给出
pacman / apt / pandoc.org 三种安装指引（不再是一句难懂的 `execFileSync` 报错）。

---

## 10. 下一步

| 优先级 | 事项 |
|---|---|
| **P1** | 决定是否重做第 4 阶段（清掉那 7 个收敛性 bug） |
| **P1** | ~~处理 `feat/responsibility-separation` 的层级笔误后再合并~~ ✅ 已完成（`e6e6fe6`） |
| **P2** | 方案 B：图表生成器接知识库 |
| **P3** | Bug 11 统计口径；turn 预算阈值校准（当前 40，历史最大 34） |
| **P3** | 结构稳定性观察（节数曾 37→6 波动，`ch` 级度量修正后**可能**已间接解决） |

---

## 11. 验收清单

- [x] 29 张图分层配色（实测每张 3~8 个色值，修复前为 2）
- [x] 29 张图全部注入文档（修复前 0 张）
- [x] pandoc 导出退出码 0（修复前 64）
- [x] `final.docx` 含 29 张**真实内嵌**图片（非 alt 文字）
- [x] 文档标题存在，Heading1 唯一
- [x] TOC 15/15 条链接可跳转
- [x] 流程自行走完 5 → 6 → 7 → 8 → `done`
- [x] 收尾无报错，`stoppedReason = 'completed'`
- [x] 全量 735 测试通过
- [x] 关键修复验证过「未修复时会失败」
- [x] `BUGS.md` / `TODO.md` / `GIT-GUIDE.md` 已同步
- [x] 版本已更新到 v0.8.0
- [x] 代码已提交并打标签

---

## 12. 版本历史

```
94b796e docs: TODO.md 更新到「重跑打通」状态
89153fd docs: BUGS.md 补充第二轮重跑发现的 Bug 28/29/30
1f1a17c fix: 到达 done 之后收尾报错，成功运行看起来像失败（Bug 30）
637e8b9 fix: 图表缓存不检查产物是否存在，导致一张图都不生成（Bug 29）
b9b119f fix: 残留产物导致阶段跳过自己的工作（Bug 28）
83c3732 docs: 重写 TODO；GIT-GUIDE 增加「文档与多分支」一节
ef0c34f docs: 补充 Bug 19-27 与修复状态（27 个，19 已修）
17db496 fix: docx 导出未嵌入图片 + 缺少文档标题（Bug 26、27）
d449a45 fix: 组装产物结构 —— pandoc 兼容分隔符/TOC 锚点/标题层级（Bug 23、24、25）
54897b3 fix: 连接线标签仍用硬编码 Windows 字体（Bug 18 漏网处）
a43dece fix: 熔断后空转到 MAX_TICKS + 终止原因被覆盖（Bug 1、2）
8e06fcf fix: phase8 导出无人执行 + 依赖预检（Bug 9、16）
1c438a8 fix: waitPoint 跳过 execute + 组装产物缺文档标题（Bug 10、22）
ed05a4d feat: 把生成的图表注入文档（Bug 12、15）
ebae90b fix: init 复制错误的 knowledge 目录（Bug 14）
32a6238 fix: 图表描述解析 —— 全角冒号/列表前缀/多跳链（Bug 19、20、21）
beccb97 fix: 图表分层配色 + 跨平台中文字体（Bug 17、18）
```

---

**迭代状态**：✅ 完成
**核心成果**：从「图表全废 + 永远导不出 Word」到「端到端自动化跑通、产出 1.47 MB 完整 Word」
**方法论收获**：磁盘上有产物 ≠ 流程走通了；静默失败比显式报错更危险
