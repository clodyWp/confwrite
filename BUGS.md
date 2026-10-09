# ConfWrite Bug 清单（全流程实测）

> 记录时间：2026-09-20（第三轮更新）
> 来源：LmERP2 项目端到端运行实测
> 所有 bug **均有实测证据**，非静态分析推测
> 当前分支：`dev`（v0.12.1）

---

## 0. 本次实测结果概览

### 0.1 首次运行（未修复）

| 阶段 | 结果 |
|---|---|
| 4a 写作 | ✅ 15 章 |
| 4b 审阅 | ✅（多轮反复） |
| 4c 决策 | ⚠️ 死锁（Bug 3） |
| 4d 修复 | ✅ |
| 5 图表生成 | ✅ 29 张图（均为单色） |
| 6 组装 | ⚠️ 首次跳过（Bug 10）→ 第二次成功 |
| 7 定稿 | ✅ `output/final.md` |
| **8 导出** | ❌ **卡死（Bug 9）** |

**产出**：`assembly/merged-v1.md` = 1.16 MB / **310,887 中文字 / 约 282 页**
**但**：29 张图**一张都没进文档**（Bug 12），且**永远无法导出成 Word**（Bug 9）。
**图表质量**：知识库未加载（Bug 13/14）+ 生成器无分层配色（Bug 17），29 张图全部只有 2 个颜色值。

### 0.2 修复后的最终产物

| 文件 | 大小 | 状态 |
|---|---|---|
| `assembly/merged-v1.md` | 1,127,292 B | 14 个安全分隔符、29 处图片引用、文档标题 + 目录 |
| `output/final.md` | 1,127,292 B | 同上 |
| **`output/final.docx`** | **1,470,199 B** | **29 张图全部内嵌 + TOC 域 + 正确标题层级** |

```
final.docx 结构
  ├─ 内嵌图片    29 张（word/media/）
  ├─ TOC 域      1 个
  ├─ Heading1    1 个（仅文档标题）
  ├─ Heading2    16 个（目录 + 15 章）
  └─ Heading3    67 个（章节内小节）
```

### 0.3 第二轮：重跑（彻底走通）

修复 19 个 bug 后，从阶段 5 重跑（**不重做阶段 4**，沿用现有 15 章草稿）：

```
Phase 5 → 6     14:07:53   29 张图 + 组装（停下等人工确认）
Phase 6 → 7     14:09:43   定稿
Phase 7 → 8     14:09:43   导出
Phase 8 → done  14:09:44   ✓
```

| 产物 | 大小 |
|---|---|
| `figures/` 29 SVG + 29 PNG + manifest | — |
| `assembly/merged-v1.md` | 1,127,292 B |
| `output/final.md` | 1,127,292 B |
| `output/finalization.json` | 463 B |
| **`output/final.docx`** | **1,472,671 B，29 张内嵌图片 + TOC + Heading1 × 1** |

**这次重跑又暴露了 3 个 bug（28/29/30，均已修）**，见 §1 末尾。

### 0.4 修复状态总览

| # | 标题 | 严重度 | 状态 | 提交 |
|---|---|---|---|---|
| 1 | 熔断后空转到 MAX_TICKS | P0 | ✅ 已修 | `a43dece` |
| 2 | `stoppedReason` 被 `max_ticks` 覆盖 | P0 | ✅ 已修 | `a43dece` |
| 3 | `pending` 孤儿 / 4c 死锁 | P0 | ⬜ 未修 | — |
| 4 | accept 门槛「全部通过」 | P1 | ✅ 已修 | — |
| 5 | 裁决与严重度不相关 | P1 | ✅ 已修 | — |
| 6 | ≥300 字/段规则导致不收敛 | P1 | ✅ 已修 | — |
| 7 | 审阅报告被覆盖 | P2 | ✅ 已修 | — |
| 8 | 429 指数退避是死代码 | P1 | ✅ 已修 | — |
| 9 | phase8 导出的动作无人处理 | P0 | ✅ 已修 | `8e06fcf` |
| 10 | waitPoint 跳过 execute | P0 | ✅ 已修 | `1c438a8` |
| 11 | `finalization.json` 字段命名 | P3 | ✅ 已修 | — |
| 12 | 图表生成了但未插入文档 | P0 | ✅ 已修 | `ed05a4d` |
| 13 | 生成阶段不读知识库 | P2 | 🔶 部分 | `beccb97`（色表已入代码） |
| 14 | `init` 复制错目录 | P2 | ✅ 已修 | `ebae90b` |
| 15 | `path-adjuster.ts` 死代码 | P2 | ✅ 已修 | `ed05a4d`（改为不再依赖它） |
| 16 | `checkDependencies()` 死代码 | P2 | ✅ 已修 | `8e06fcf` |
| 17 | 无分层配色能力 | P2 | ✅ 已修 | `beccb97` |
| 18 | 字体硬编码 Windows 字体 | P2 | ✅ 已修 | `beccb97` + `54897b3` |
| 19 | 分段标题不认全角冒号 | P2 | ✅ 已修 | `32a6238` |
| 20 | 连接标签未剥离 `- ` 前缀 | P2 | ✅ 已修 | `32a6238` |
| 21 | 多跳链只解析首尾一条边 | P2 | ✅ 已修 | `32a6238` |
| 22 | 组装产物缺文档标题 | P2 | ✅ 已修 | `1c438a8` |
| 23 | TOC 锚点不存在 | P2 | ✅ 已修 | `d449a45` |
| 24 | 标题层级扁平 | P2 | ✅ 已修 | `d449a45` |
| 25 | 分隔符被 pandoc 当 YAML 块 | P0 | ✅ 已修 | `d449a45` |
| 26 | pandoc 按进程 cwd 找图 → 图未嵌入 | P0 | ✅ 已修 | `17db496` |
| 27 | 导出未传 title → 缺标题/未降级 | P2 | ✅ 已修 | `17db496` |
| 28 | 残留产物让阶段跳过自己的工作 | P0 | ✅ 已修 | `b9b119f` |
| 29 | 图表缓存不检查产物是否存在 | P0 | ✅ 已修 | `637e8b9` |
| 30 | 到达 `done` 后收尾报错 | P2 | ✅ 已修 | `1f1a17c` |
| 31 | 素材包与大纲不对应 → 静默拿到别的章节素材 | P0 | ✅ 已修 | `ef378a7` |
| 32 | turn 预算耗尽无条件判失败（产物已正确产出） | P1 | ✅ 已修 | — |
| 33 | 提取器认 mermaid、注入器不认 → 图永远进不了文档 | P0 | ✅ 已修 | `f3b2e62` |
| 34 | 提取器扫描所有版本 → 旧版本的图成为孤儿 | P2 | ✅ 已修 | `f3b2e62` |
| 35 | 缺 mmdc 时静默降级，谎报「生成完成」 | P1 | ✅ 已修 | `f3b2e62` |

> 已修 **34** 个 / 共 **35** 个。
> 未修的仅 Bug 3（`pending` 孤儿 / 4c 死锁），
> 不影响「沿用现有产物 → 图表 → 导出 Word」这条路径 —— 该路径已端到端走通。

---

## 1. Bug 清单

按严重度排序。**P0 = 阻断流程或烧钱烧时间**。
每个 bug 末尾的「状态」行标明是否已修复及对应提交。

### 🔴 P0：流程阻断

#### Bug 9 — phase 8 导出的动作无人处理（流程永远到不了 done）

**现象**：流程推进到 phase 8（导出）后空转到 `MAX_TICKS`，`output/final.docx` 永不生成。

**证据**：

```
dispatcher 的 switch 支持:  spawn_writers / spawn_reviewers / spawn_fixers
                            generate_diagrams / assemble

export_docx 出现位置:       src/orchestrator/phases.ts:466（仅作为返回值）
                            ✗ 全代码库没有任何地方处理它

index.ts:111  EXECUTABLE_ACTIONS = {spawn_writers, spawn_reviewers, spawn_fixers}
             → export_docx 落入 else { continue; } 分支
```

**根因**：phase 5/6/7 都在自己的 `execute()` 里直接完成工作（调用 pipeline / assembler / finalizer），**只有 phase 8 例外**——它把工作委托给一个不存在的处理者。

**状态证据**：`phase: 8 | status: exporting`，`output/` 下只有 `final.md` + `finalization.json`，无 docx。

**修法**：像 phase 5/6/7 一样，在 phase 8 的 `execute()` 里直接调用 `exportDocument()`（`src/commands/export.ts` 已实现，手动命令 `/confwrite:export` 能用）。

**状态**：✅ 已修复（`8e06fcf`）——并在 `validate()` 里加入 pandoc 依赖预检

---

#### Bug 3 — `pending` 孤儿：失败的任务无法被重新拾起

**现象**：5 章卡在 `pending` 且 `round=1`，永远不再被处理，最终导致 4c 死锁。

**证据**：

```js
// phases.ts:332 — 4c 回 4a 的唯一入口
{ target: '4a', condition: ctx => chapters.some(ch => ch.status === 'pending' && ch.round > 1) }
//                                                              ↑ 要求 round > 1
```

而 `round++` **只在审阅判 reject 时发生**（phases.ts 4c）。任务**执行失败**（429 或 turn 预算超限）掉回 `pending` 时 round 不变。

**实测受害者**：ch002、ch006、ch007、ch010、ch011

| 章节 | 变成孤儿的直接原因 |
|---|---|
| ch002 | fixer 触发 turn 预算（41>40） |
| ch011 | fixer 触发 turn 预算（41>40） |
| ch006 / ch007 / ch010 | fixer 被 429 打断 |

**后果链**：

```
5 章变 pending(round=1)
  → 4c: 没有 reviewed+revise      → 不去 4d
  → 4c: 没有 pending 且 round>1    → 不去 4a
  → 4c: 不是全部终态               → 不去 5
  → 三个出口全不满足 = 死锁 → 空转到 MAX_TICKS
```

**修法**：4c 的 → 4a 条件改为 `ch.status === 'pending'`（不限 round）；同时应加**单章轮次上限**（如 3 轮后强制 accept/fail），否则会变成另一种无限循环。

**状态**：⬜ 未修复。本次通过手工改状态绕开（15 章全标 completed），
> 不影响「不重做第 4 阶段」的路径。

---

#### Bug 12 — 图表生成了但从未插入文档

**现象**：29 张图全部生成，文档里 **0 张图**，29 个占位标记原样残留。

**证据**：

```
merged-v1.md 引用 figures/ :  0
final.md     引用 figures/ :  0
markdown 图片语法 ![](...)  :  无

但文档里保留:
  29 个 <!-- diagram-start ... -->
  29 个 diagram-end

图表数量对得上: 文档 29 个标记 ↔ figures/ 29 张 PNG
```

**根因**：整条链缺了「标记 → 图片引用」这一步：

```
writer 写入 <!-- diagram-start ... --> 标记      ✓
extractor 提取标记                              ✓
pipeline 生成 figures/*.svg + *.png             ✓ 29 张
▲ 把标记替换为 ![title](figures/xxx.png)         ✗ 从未实现
assemble 组装（标记原样带过去）                    ✓
finalize 定稿（统计图片数 = 0）                   ✓
export 导出                                     ✗ Bug 9
```

**附证**：`src/diagrams/path-adjuster.ts` 的文件头写着「方案 B：在组装/定稿阶段集中替换」——**这个模块就是为此写的，但从未被任何生产代码调用**（只有它自己的测试引用，见 Bug 15）。且它只处理**已存在**引用的路径，不会创建引用。

**后果**：若修好 Bug 9，导出的 Word 会是 **282 页、0 张图、29 处残留 HTML 注释**。

**修法**：在组装或定稿阶段增加一步：读 `figures/manifest.json`，把每个 `diagram-start` 块替换为对应图片的 markdown 引用，再调用现成的 `adjustImagePaths()` 修正相对路径。

**状态**：✅ 已修复（`ed05a4d`）
> 实际实现未复用 `adjustImagePaths()`（它只能改已存在的引用路径，
> 不会创建引用）——而是在新增的 `src/diagrams/injector.ts` 里直接
> 产出相对组装目录的正确路径。实测 29/29 全部注入。

---

#### Bug 10 — 带 waitPoint 的阶段首次进入会跳过 `execute()`

**现象**：流程报告「初稿组装完成，请审阅 `assembly/merged-v1.md`」，但**该文件根本不存在**。

**证据**：

```
日志中「组装完成」出现次数: 0
面板中「组装完成」出现次数: 0
assembly/ 目录: 空
```

**根因**（`src/orchestrator/state-machine.ts:111`）：

```js
// 阶段跳转时
if (targetDef?.waitPoint) {
  state.waitPoint = { phase: exit.target, reason: ..., ... };
  this.store.save(state);
  return { action: 'wait_point', atWaitPoint: true, ... };   // ← 直接返回，execute() 从未执行
}
```

而**同文件第 168 行**的注释写的是相反意图：

```js
// 3. If waitPoint is active AND already acknowledged (execute ran before), return wait
//    The waitPoint is set AFTER execute (see below)...
```

**两处代码自相矛盾**：跳转逻辑在 execute 之前就设了 waitPoint 并返回。

**影响阶段**：`phase2 大纲规划`、`phase6 组装`（仅这两个有 waitPoint）

**实测表现**：第一次让你审阅不存在的文件；**第二次运行才真正生成**（因为 index.ts 会在启动时清空 waitPoint，tick 第 3 步就不再拦截）。实测第二次运行成功生成 1.16 MB 的 merged-v1.md。

**修法**：删除 state-machine.ts:111 的跳转快捷分支，让 waitPoint 只在 `execute()` 之后设置（与第 168 行的设计意图一致）。

**状态**：✅ 已修复（`1c438a8`）
> 实现上引入了 `waitPoint.timing: 'entry' | 'after-execute'` ——
> phase2 大纲规划是纯人工确认点（进入即暂停，当前行为正确）；
> phase6 组装是「先干活再暂停」（`after-execute`）。
> 同时把 waitPoint 判定移到出口条件之前，否则组装一旦产出就满足
> 出口条件、直接跳走而永不暂停。

---

#### Bug 1 — 熔断后外层循环不退出，空转到 MAX_TICKS

**现象**：29 个任务消耗 2000 次 tick（约 1970 次空转）。

**证据**：

```js
// index.ts:215
if (runner.isCircuitBroken()) {
  result.stoppedReason = 'circuit_breaker';
  result.completed = false;
  break;                       // ← 只跳出「内层批次循环」
}
// 外层 while (result.ticks < MAX_TICKS) 继续跑
// → 派发任务 → 熔断立即失败 → 0 执行 → 再派发 → …
```

面板上两行紧挨着，证明空转发生在瞬间：

```
⚡ 触发限流熔断，终止本轮。剩余任务将在下次运行时重试。
⚠️ 达到最大推进次数 (2000)，请检查状态
```

**修法**：熔断后 `break` 外层循环（或在 while 条件里检查 `result.stoppedReason`）。

**状态**：✅ 已修复（`a43dece`）——内层批次循环退出后如为 circuit_breaker 则一并 break 外层。
> 新增测试已验证「未修复时会失败」：`expected 2000 to be less than 50`。

---

#### Bug 2 — `stoppedReason` 被 `max_ticks` 无条件覆盖

**证据**（`index.ts:261`）：

```js
if (result.ticks >= MAX_TICKS) {
  notify(`⚠️ 达到最大推进次数 (${MAX_TICKS})，请检查状态`, 'info');
  result.stoppedReason = 'max_ticks';        // ← 无条件覆盖，包括 'circuit_breaker'
}
```

**后果**：调用方拿到的终止原因是错的。本次真实原因是**限流熔断 + 状态机死锁**，却报告成「推进次数用完」，完全误导排查方向。

**修法**：只在 `!result.stoppedReason` 时才赋值。

**状态**：✅ 已修复（`a43dece`）

---

#### Bug 25 — 章节分隔符 `---` 被 pandoc 当成 YAML 元数据块，导出直接失败

**现象**：用真实产物跑 pandoc 导出 docx 直接失败（退出码 64）：

```
Error parsing YAML metadata at "merged-v1.md" (line 1127):
YAML parse exception at line 19, column 0:
  did not find expected <document start>
```

**根因**：章节间分隔符是 `\n---\n`，而章节正文以 `# 2.2 …` 开头，
于是文档里出现：

```
（空行）
---
# 2.2 技术选型与论证      ← 紧接着非空行
```

pandoc 把「前有空行 + `---` + 紧跟非空行」识别为 **YAML 元数据块开头**，
随后尝试把正文当成 YAML 解析 → 失败。

**证据**：实测产物里 14 个分隔符，其中多个命中此模式。

**修法**：分隔符改为 `***`（普通主题分隔线，无歧义）。
实测：同一份文档，`---` 退出码 64，`***` 退出码 0。

**状态**：✅ 已修复（`d449a45`）

---

#### Bug 26 — pandoc 按进程 cwd 解析相对图片路径 → 29 张图全部未嵌入

**现象**：导出报 `success: true`，但日志里 29 张图全部警告：

```
[WARNING] Could not fetch resource ../figures/ch012-fig2.png:
          replacing image with description
```

产出的 docx 只 **552 KB**（手动测试嵌入全部图片时为 1.47 MB）。
**失败是静默的**——`success` 仍为 true，图片被降级成占位描述。

**根因**：`exportWithPandoc` 调用 `execFileSync('pandoc', args, { stdio: 'inherit' })`
**未设置 cwd**，pandoc 按进程 cwd 解析相对路径。
文档写在 `<project>/output/final.tmp.md`，图片在 `<project>/figures/`，
正文引用 `../figures/x.png`；若调用方 cwd 不是 `output/`，该路径即指向错误位置。

**对照实验**：
- `cd output/` 后手动跑 pandoc → **0 警告**，图片全嵌入
- 经 `exportDocument`（cwd = 调用方）→ **29 警告**，图片全缺失

**修法**：`execFileSync(..., { cwd: dirname(tempMdPath) })`。

**状态**：✅ 已修复（`17db496`）——实测 0 警告，docx 1,470,199 字节含 29 张图

---

#### Bug 19 — 分段标题只认半角冒号 `:`，不认中文全角 `：`

**现象**：图表所有节点落在 layer 0，使「分层配色」完全无法生效。

**证据**：

```
用真实 description 模拟解析：
  半角冒号命中的分层标记: 0 个
  全角冒号（未被识别）的行: 4 个     ← 如「五层三纵两翼架构：」
  连接关系行: 6 个
  → 最终 layer = 0（应为 5+）
```

**根因**：`pipeline.ts` 的 `layerMatch` 正则 `^(.+?):\s*$` 只匹配半角冒号，
而中文描述普遍使用全角 `：`。

**修法**：接受 `[:：]`；并区分「分段标题」（整行只有名称+冒号）与
「层/项定义」（`- 名称：子项列表`）。

**状态**：✅ 已修复（`32a6238`）——实测 5 个主层各自独立编号（接入1/网关2/服务3/数据4/基础5）

---

#### Bug 20 — 连接关系分支未剥离列表前缀，标签带 `- ` 项目符号

**证据**（生成的 SVG 文字节点）：

```
- 数据治理翼：数据采集（50+适配器）
- 接入层
- 网关层（HTTPS/WSS/MQTT）
- 基础设施层（...）
```

**根因**：解析器的分支顺序是「连接 → 列表项 → 分层」，
而连接分支直接使用未剥离的原始文本：
`- 接入层 → 网关层` 的 fromLabel 变成 `- 接入层`。

**修法**：进入任何分支前先剥离 `- `/`* ` 前缀。

**状态**：✅ 已修复（`32a6238`）

---

#### Bug 21 — 多跳链只解析出首尾一条边

**现象**：`- 数据治理翼：数据采集（50+适配器）→ ETL → 数据治理 → 数据服务`
被解析成一条边 `A → "B → C → D"`，右侧整串变成一个节点标签。

**修法**：按箭头拆分后依次连接（A→B、B→C、C→D），并让链上节点逐层递进。
附带：把 `名称（注解）` 的尾部括号提取为**边的 label**
（`ParsedConnection.label` 此前从未被赋值），避免产生重复节点。

**状态**：✅ 已修复（`32a6238`）——实测节点 19→14、连接 8 条、无重复节点

---

### 🟠 P1：导致流程不收敛（烧钱烧时间）

#### Bug 6 — 「段落/图表说明 ≥300 字」规则导致永不收敛

**这是本次流程反复循环的根本原因。**

**证据**：所有 revise 意见里，绝大多数是这条规则的机械计数：

```
ch010: 图表1 前方的描述段落仅 283 字，不满足 ≥300 字
       → 需要扩充至少 17 字以上        ← 为了 17 个字打回重做！

ch006: 架构图前的描述段落仅 219 个中文字符，不满足 ≥300 字
ch007: 表1 前的引导段落仅 35 个中文字符，远低于 300 字要求
ch011: 5.1.3 节引言段落仅 107 字，低于 300 字；表格后缺少独立总结段落
```

**为什么永不收敛**（三个特征叠加）：

| 特征 | 后果 |
|---|---|
| 可机械检验 | 审阅员每次都能数出违规项 |
| 数量巨大（每张表/图/小节引言都要） | 永远数不完 |
| 每次修改使上次检查失效 | 改完几处，重审又发现另外几处 |

**实测**：fixer 因此陷入 41 轮循环被 turn 预算中止（ch002、ch011 各一次）。

**修法**：改为定性描述（如「图表前后应有充分的说明文字，避免图表孤立出现」），或大幅降低阈值并只对图表（不对普通段落）生效。

**状态**：✅ 已修复——300 字机械计数已移除，改为定性检查。

---

#### Bug 4 — 审阅 accept 门槛「全部通过」，几乎不可能达到

**证据**（`src/writing/task-executor.ts` 决定标准）：

```
- accept: 质量达标，内容深度、图表规范、数据一致性**全部通过**
- revise: 有小问题，需要修改后重新审阅
```

「全部通过」是全称命题 → 只要审阅员找出任何一条小毛病就不能 accept。

**实测**：**14 章里 12 章判 revise（86%）**，而这些章节平均分 **7.8–8.8**。

**成本失衡**：修复阶段 7.4 分/章 > 写作阶段 6.7 分/章。

**修法**：改为「无 high 问题即可 accept」或「平均分 ≥ X 且无 high」。

**状态**：✅ 已修复——审阅 accept 门槛改为基于严重度+数量判定。

---

#### Bug 5 — 裁决与严重度不相关

**证据**：

| 章节 | 均分 | high | medium | low | 裁决 |
|---|---|---|---|---|---|
| ch013 | 8.8 | 0 | 0 | 3 | accept |
| **ch012** | **8.6** | **0** | **0** | **6** | **revise** |
| ch009 | 8.2 | 0 | 2 | 3 | accept |
| ch010 | 8.6 | 0 | 3 | 3 | revise |
| ch011 | 8.6 | 0 | 4 | 3 | revise |

**ch012 零 high、零 medium，仅因 6 条 low 被判 revise。** 分界线看起来是「问题条数」而非「严重度」。

**修法**：与 Bug 4 一并修——在 prompt 中明确「严重度为 low 的问题不构成 revise 理由」。

**状态**：✅ 已修复——裁决与严重度已显式关联。

---

#### Bug 8 — 429 指数退避是死代码

**现象**：6 次限流事件**时间戳完全相同**（同一秒），退避从未真正等待。

**证据**：

```
[2026-09-20T02:43:22.325Z ... 02:43:22.325Z]
  pause 1分钟 / 2分钟 / 4分钟 / 8分钟 / 16分钟 / 16分钟  ← 全部同一时刻
```

**根因**（`src/scheduler/runner.ts`）：

```js
// 第 296 行 —— 在 runUntilIdle() 里
if (this.pausedUntil > Date.now()) {
  await new Promise(r => setTimeout(r, waitMs));
}

// 第 69 行 —— 但 index.ts 实际调用的是 runAll()
async runAll() {
  if (this.circuitBroken) return {...};
  await this.rateLimiter.waitForSlot();     // 只等令牌桶，不看 pausedUntil
  ...
}
```

**退避逻辑写在无人调用的方法里。**

**后果**：配额用尽时不会等待，而是 1 秒内打满 5 次重试直接熔断。

**修法**：在 `runAll()` 开头也检查 `pausedUntil`，或让 index.ts 调用 `runUntilIdle()`。

**状态**：✅ 已修复——429 退避逻辑已接入 `runAll()` 调用路径。

---

### 🟡 P2：产出质量缺陷

#### Bug 13 — 生成阶段 pipeline 完全不读知识库

**证据**：

```
使用 KnowledgeLoader 的:  organize.ts / dispatcher:109 / kit-generator.ts
src/diagrams/（提取+生成图的 pipeline）:  ✗ 零引用
```

**修法**：在 `pipeline.ts` 里加载 `knowledge/diagrams/`（尤其 `architecture-style.md`、`layout.md`、`quality-lessons.md`），用于图表样式与布局决策。

**状态**：🔶 部分修复（`beccb97`）——已把 `architecture-style.md` 的
> 层级色表落地为 `DEFAULT_LAYER_PALETTE`（可配置数据）。
> 「把知识库作为生成器一等输入」属于方案 B，未做。

---

#### Bug 14 — `init` 复制错误目录，知识库从未进入项目

**证据**（`src/commands/init.ts:107`）：

```js
const knowledgeSrc = join(dirname(dirname(new URL(import.meta.url).pathname)), 'knowledge');
// 运行时 import.meta.url = .../dist/commands/init.js
// dirname(dirname()) = .../dist/
// → knowledgeSrc = .../dist/knowledge     ← tsc 编译产物所在处
```

```
dist/knowledge/   → loader.js  loader.d.ts  loader.js.map  loader.d.ts.map   ← 被复制的内容
knowledge/        → diagrams/ (16 个 .md)                                     ← 应该复制的内容

写作项目 knowledge/ 实际内容: loader.d.ts  loader.d.ts.map  loader.js  loader.js.map
写作项目 knowledge/diagrams/ : ✗ 不存在
```

**后果链**：

```
KnowledgeLoader.loadAll()  → if (!existsSync(knowledgeDir)) return { files: [] }
  → writer 任务书中「图表知识」部分: 无（grep 无匹配）
  → reviewer 任务书中「图表知识」部分: 无（0 匹配）
  → 生成的图标签带 "- " 列表符号（模型把 description 写成列表项）
```

**讽刺点**：`knowledge/diagrams/quality-lessons.md` 本身就是一条标题为
「Writer Subagent 图表描述质量问题」的教训——**写好了却因为路径 bug 从未被加载**。

**修法**：改为解析包根目录（如 `join(packageRoot, 'knowledge')`），确保复制含 `diagrams/` 的完整知识库。

**状态**：✅ 已修复（`ebae90b`）——抽出并导出 `resolveKnowledgeDir(moduleUrl)`，
> 上溯三层到包根；改用 `fileURLToPath` 避免路径含空格时 %20。

---

#### Bug 7 — 审阅报告被覆盖，历史丢失

**证据**：`review/` 下只有 15 个 `-r1.json`，**没有 r2**。

```
文件命名: review/${chapterId}-r${round}.json     （orchestrator.ts:172）
其中 round = state.round —— revise 循环不会增加它（永远是 1）
```

**实测**：11:03–11:15 的重审**覆盖了** 09:14–09:30 的第一轮报告，导致无法对比「修完是否变好」。

**修法**：文件名应包含轮次，或与 `chapters[].round`、修复次数解耦（例如用时间戳或独立的 review 序号）。

**状态**：✅ 已修复——轮次递增修复后审阅报告不再被覆盖。

---

#### Bug 11 — `finalization.json` 字段命名错误

**证据**（`src/assemble/finalizer.ts:94`）：

```js
const chapters = (content.match(/^## /gm) || []).length;   // ← 数的是所有 ## 标题
```

实测输出 `"chapters": 67`，而实际只有 **15 章**。67 是所有 `## ` 级标题的总数。

附带：`"images": 0` 在数值上正确（文档确实没有图片），但它是 Bug 12 的症状而非独立统计。

**修法**：改名为 `level2Headings`，或按章节切分逻辑正确统计章数。

**状态**：✅ 已修复——字段已重命名为 `level2Headings`。

---

#### Bug 15 — `path-adjuster.ts` 是死代码

**证据**：

```
src/diagrams/path-adjuster.ts:34  export function adjustImagePaths(...)
被引用处: 仅 src/diagrams/path-adjuster.ts 自身 + tests/diagrams/path-adjuster.test.ts
生产代码引用: ✗ 无
```

文件头注释写着「方案 B：在组装/定稿阶段集中替换」，但装配环节从未调用它。

**修法**：随 Bug 12 一起接入组装/定稿流程；若确定不做，则删除并撤销其测试。

**状态**：✅ 已结案（`ed05a4d`）——Bug 12 的实现不需要它，
> 已在 injector 注释中说明为何不能替代（只改已存在引用的路径）。
> 模块与测试暂留，待方案 B 评估。

---

#### Bug 16 — `checkDependencies()` 是死代码，不提示缺少 pandoc

**现象**：`docx` 导出失败时，用户只得到一个晦涩的 `execFileSync` 报错，看不到「请先安装 pandoc」。

**证据**：

```
converter.ts:129  checkDependencies(): { pandoc: { installed: this.isPandocInstalled(), ... } }
全代码库搜 checkDependencies → 只有它自己的定义，没有任何调用

本机实测:  $ which pandoc  →  ✗ 未安装
           export.ts:243   execFileSync('pandoc', args, ...)  ← 直接抛错
```

**附**：各格式的依赖现状

| 格式 | 依赖 | 状态 |
|---|---|---|
| `md` | 无（纯 JS） | ✅ 可用 |
| `html` | 无（纯 JS 正则转换） | ✅ 可用（质量一般） |
| `docx` | pandoc | ❌ 未安装 |

**修法**：导出前调用 `checkDependencies()`，缺失时给出明确提示（含安装命令）；或在 `init` 阶段就做依赖预检。

**状态**：✅ 已修复（`8e06fcf`）——phase8 的 `validate()` 调用它，
> 缺失时返回 blocked 并给出 pacman/apt/pandoc.org 三种安装指引。

---

#### Bug 17 — 图表生成器无「分层配色」能力，所有节点同一颜色

**现象**：29 张图全部只用 2 个颜色值（1 个填充色 + 白底），**所有节点都是同一个橙色**。

**证据**：

```
ch003-fig1.svg:
       20  #d97706    ← 20 个节点全用同一个橙色
        1  #ffffff    ← 背景

全部 29 张图: 每张都恰好只有 2 个不同颜色值
```

**根因**（`src/diagrams/generator.ts:208` generateNode）：

```js
<rect ... fill="${colors.primary}" .../>
                ↑ 所有节点统一用 primary，与 node.layer 无关
```

节点虽然带了 `layer` 字段（用于纵向分层排布），但**颜色与 layer 无关**。色板只有 7 个色位（primary/secondary/tertiary/data/line/bg/text）。

**对照知识库要求**（`knowledge/diagrams/architecture-style.md`）：

| 知识库要求 | 实际 |
|---|---|
| **按层分色**：接入层蓝 / 应用层绿 / 支撑层橙 / 数据层紫 / 基础设施灰 | ❌ 全部同一橙色 |
| 低饱和度企业色调 | ⚠️ `warm` 方案 = amber-600，饱和度偏高 |
| 信息密集，模块内展示子项 | ❌ 单行标签（甚至带着 `- ` 列表符号） |
| 横切关注点用两侧竖条 | ❌ 无 |
| 扁平纯色 + 细边框 | ✅ 做到了 |

**关键**：即使修好 Bug 13/14（让知识库能加载），**也实现不了**——渲染代码本身缺少按层取色的能力。这是两个独立缺陷。

**修法**：见下方「图表改造决策」。

**状态**：✅ 已修复（方案 A，`beccb97`）——新增 `DEFAULT_LAYER_PALETTE`
> （接入蓝/应用绿/支撑橙/数据紫/基础灰），`generateNode` 按 `node.layer` 取色。
> 实测：从「每张图 2 个颜色值」→ 5~6 个。

---

#### Bug 18 — 字体族硬编码 Windows 字体，Linux 上失效

**证据**（`src/diagrams/generator.ts:230`）：

```js
// 注释写着：解决 Windows 中文字体问题
const fontFamily = 'Microsoft YaHei, SimHei, sans-serif';
```

```
fc-list | grep -c "Microsoft YaHei"  →  0   ✗ 不存在
fc-list | grep -c "SimHei"            →  0   ✗ 不存在
fc-list :lang=zh | wc -l              →  80  ← 本机有 80 个中文字体（Noto Sans CJK 等）却用不上
```

**修法**：按平台自适应，或用 fontconfig 字体族回退链（如 `Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, sans-serif`）。

**状态**：✅ 已修复（`beccb97` + `54897b3`）
> 注意：首次只改了节点（`generateNode`），**连接线标签漏网**——
> `generateConnection` 另有一处独立的硬编码。已补充修复与回归测试。

---

#### Bug 22 — 组装/定稿产物缺少文档标题

**现象**：最终文档以 `# 目录` 开头，没有文档标题；
而 `outline.md` 第一行明明写着 `# 智慧园区综合管理平台项目投标文件——技术方案`。

**根因**：

```js
// phase6
const result = assembler.assemble(ctx.projectDir, chapters, { generateTOC: true });
//                                                                 ↑ 没传 title
// finalizer：读 assembly/merged-v1.md → 原样写入 output/final.md
```

「无标题」于是被固定成最终产物。

**为何长期未暴露**：phase6 的 `execute` 被 waitPoint 跳过（Bug 10），
组装从未真正执行过。修好 Bug 10 后立刻暴露。

**修法**：新增 `ChapterAssembler.resolveDocumentTitle(projectDir)`，
取 outline.md 的第一个一级标题，phase6 组装时传入。

**状态**：✅ 已修复（`1c438a8`）

---

#### Bug 23 — TOC 链接指向的锚点不存在

**证据**：

```
TOC 链接:        ch001 ch002 ch003 …
文档中 id="ch0…" 锚点: 0 个
```

目录列了 15 条链接，但一个都点不动。

**修法**：给每章首个标题追加 `{#chXXX}`（pandoc 原生 header identifier，
markdown / HTML / Word 均可跳转）；章节无标题时退化为 `<a id="chXXX">`。

**状态**：✅ 已修复（`d449a45`）

---

#### Bug 24 — 标题层级扁平

**证据**（导出的 docx）：

```
Heading1  17 个   ← 文档标题 + 目录 + 15 个章节标题混在同一级
Heading2  67 个
Heading3 150 个
```

Word 大纲面板里文档标题与各章平级，层次混乱。

**修法**：有文档标题时，目录降为 h2、章节内容整体降一级
（章节标题 h2、小节 h3）。降级时**跳过代码块围栏**——
Python / Shell 注释 `# xxx` 不是标题。

**状态**：✅ 已修复（`d449a45`）——实测 Heading1 从 17 → **1**

---

#### Bug 27 — 导出时未传 title，导致缺标题且章节未降级

**根因**：`exportDocument` 会自行重新组装，但 phase8 与手动
`/confwrite:export` 都不传 `title`：

```js
const assemblyOptions = { title: options.title, … };   // undefined
```

于是导出结果既没有文档标题，章节也不会降级（Heading1 × 16）。

**修法**：`title: options.title ?? assembler.resolveDocumentTitle(projectDir)`。

**状态**：✅ 已修复（`17db496`）

---

### 📐 图表改造决策（已定）

> **决定**：先用 **方案 A** 让图「能看」，后续按 **方案 B** 完整实现。
> 记录日期：2026-09-20

#### 方案 A（先做）—— 低代价、收益明显

| 改动 | 对应 Bug |
|---|---|
| `generateNode` 按 `node.layer` 从色板取不同颜色（5 层 5 色） | Bug 17 |
| 字体族改为平台自适应 / fontconfig 回退链 | Bug 18 |
| 修 `init` 复制路径，让知识库真正进入项目 | Bug 14 |
| 把 `architecture-style.md` 的层级色表接进 `style.ts` 色板 | Bug 13 |
| 导出前做 pandoc 依赖预检 | Bug 16 |

**预期效果**：从「一片橙」变成「分层清晰」。**不改布局算法**。

#### 方案 B（后续）—— 按知识库规范完整实现

- 模块内展示子项细节（信息密度）
- 横切关注点用右侧/两侧竖条
- 按 `layout.md` 实现多种布局模式
- 把知识库作为生成器的**一等输入**（而非硬编码样式）

**注意**：方案 A 不应阻碍方案 B——建议 A 的改动把「层级→颜色」映射做成可配置数据，B 阶段直接替换数据源即可。

---

### 🔵 P3：非系统性问题（偶发，已记录）

| 现象 | 频次 | 说明 |
|---|---|---|
| agent 中途重启（`agent_end` → `agent_start`） | 2/36 任务 | 机制未明，未影响结果 |
| 无工具的长轮次（300s / 328.6s） | 2/36 轮次 | 不产生任何工具调用，疑似模型长推理或端点卡顿 |
| fixer 跑进「验证工具行为」的兔子洞 | 1 次 | ch011 反复在 /tmp 建测试文件验证全角标点是否被破坏，41 轮被预算中止 |

> **补充说明**：`>200s` 的长轮次共 16 个，其中 14 个是正常的 `write` 轮（写整章本来就慢，230–290s），**不是异常**。

---

## 1b. 第二轮重跑发现的 bug（28、29、30）

这三个都是**把阶段 5→8 真正跑通**才暴露的，而且都是「静默错误」——
不报错、或者把失败报成成功。

### 🔴 Bug 28 — 残留产物让阶段跳过自己的工作

**现象**：13:36 那次重跑，pandoc 明确报错：

```
Error parsing YAML metadata at output/final.tmp.md:
  did not find expected <document start>
```

流程却仍然推进到 `done`，而那份 `final.docx` 是 **552 KB 的坏文件**
（29 张图全被替换成 alt 文字，正确应为 1.47 MB）。

**根因**：状态机 tick 的顺序是

```
1. 检查出口条件 → 满足就跳转（**在 validate / execute 之前**）
2. validate    3. waitPoint    4. execute
```

而 phase 6/7/8 的出口条件都是「某个文件存在」，那个文件又正是
本阶段自己要产出的。于是上次运行留下的残件让出口条件**直接成立**：

| 残留文件 | 后果 |
|---|---|
| `assembly/merged-v1.md` | phase 6 跳过组装，**连人工确认点也跳过** |
| `output/finalization.json` | phase 7 跳过定稿 |
| `output/final.docx` | phase 8 **跳过导出**并报 done |

> 修这个 bug 时发现真相比最初描述更严重：不只是「失败被掩盖」，
> 而是**出口检查在前，阶段根本不会执行导出**。

**修法**：`PhaseDefinition` 新增 `onEnter` 钩子（状态机在 `advance()` 时
调用），phase 6/7/8 各自清掉自己产物的残件。

只清「工作产物」，不清「缓存」：`figures/manifest.json` 属缓存，
命中时跳过重算是正确行为，故 phase 5 不加 `onEnter`。

**状态**：✅ 已修复（`b9b119f`）

---

### 🔴 Bug 29 — 图表缓存只比对源哈希，不检查产物是否存在

**发现场景**：规划重跑时确认「清空 figures/ 能否强制重生」。

```ts
shouldRegenerate(diagramId, sourceContent) {
  const entry = this.manifest[diagramId];
  if (!entry) return true;
  const currentHash = this.computeHash(sourceContent);
  return currentHash !== entry.sourceHash;   // ← 只看哈希
}
```

**后果**：清空 `figures/*.svg` 与 `*.png` 但保留 `manifest.json` 时，
pipeline 认为 29 张图「未变更」而**全部 skip** —— 一张图都没生成；
而 phase 5 的出口条件正是 `hasFile('figures/manifest.json')`，
于是流程认为图表阶段已完成，后续组装拿不到任何图片。

表现与 Bug 26 相似（导出的 Word 里图变成 alt 文字），但成因完全不同。

**修法**：哈希比对之前先检查 `entry.svgFile` / `entry.pngFile` 是否存在，
缺失即返回 `true`。两项都查 —— PNG 才是最终嵌入 docx 的产物。

**状态**：✅ 已修复（`637e8b9`）

---

### 🟡 Bug 30 — 到达 `done` 之后收尾报错，成功运行看起来像失败

**现象**（真机收尾）：

```
⏩ 8 → done (done)
📝 [done] done: 进入 done
Error: ⛔ 未知: 未知 Phase: done      ← 这里
```

**根因**：`'done'` 一直是 phase 8 的跳转目标，也在 `PhaseEnum` 里，
但**从未注册进 `phases` 表**：

```ts
phases = new Map([['0a',…], … ['8', phase8]]);   // 没有 'done'

const definition = phases.get(phase);            // undefined
return { phaseName: '未知', blocked: true, error: `未知 Phase: ${phase}` };
```

而 `index.ts:150` 把 `blocked` 一律当失败处理：

```ts
if ('blocked' in tickResult && tickResult.blocked) {
  notify(`⛔ ${tickResult.phaseName}: ${tickResult.error}`, 'error');
  result.stoppedReason = 'blocked';
  break;
}
```

**影响**：产物完整、`completed` 仍为 `true`，但 `stoppedReason` 变成
`'blocked'` 并打印红色 Error —— 用户会以为失败了。

**修法**（两处）：

1. `phases.ts` 注册终态阶段 `phaseDone`（name='完成'，无出口）
2. `index.ts` 循环顶部、**tick 之前**判定终态：

```ts
if (machine.status()?.phase === 'done') {
  result.stoppedReason = 'completed';
  break;
}
```

必须在 tick 之前 —— 终态无需任何推进，若放在身后又会走到 blocked 分支。

**真机验证**（重启 pi 加载新 dist，状态置 phase 8 后运行）：

```
修复前： 📝 [done] done: 进入 done   + Error: ⛔ 未知: 未知 Phase: done
修复后： 📝 [done] 完成: 进入 完成    （无 Error，stoppedReason=completed）
```

**状态**：✅ 已修复（`1f1a17c`）

> 附：这个 bug 上午那次「假成功」里也出现过，被当时的会话记为发现 #1，
> 但没进本文档。另那个会话还把 phase 8 空转 **222 个 tick** 也列为发现，
> 那是 Bug 25 + 28 合并造成的。

---

---

## 1c. 8 章全量重跑发现的 bug（31–35）

第四轮实测：把大纲从 15 章缩到 8 章并重新编号后做一次**全量生成**
（不重做任何旧草稿）。全程 83 分钟，写作 8/8 章，第 2 轮审阅 8/8 accept，
产出 `final.docx`（639 KB / 20 张内嵌图）。本轮暴露 5 个 bug。

### 🔴 Bug 31 — 素材包与大纲不对应时会静默拿到别的章节素材

**发现场景**：把 ch011–ch014 重新编号为 ch005–ch008 后：

```
assets/chapter-kits/ 里躺着 48 个来自更早 48 章大纲的素材包
  ch005.md 表头 = 「2.3 微服务与容器化部署方案」   ← 旧内容
  新大纲 ch005  = 「3.1 质保期服务承诺」           ← 新含义
```

三条路径都不校验内容是否对应：

| 环节 | 代码 | 行为 |
|---|---|---|
| 取素材包 | `dispatcher.readChapterKit()` | 只按 id 找文件，存在就返回 |
| 章节同步 | `chapter-syncer` | 已存在章节保留原 status（completed） |
| 素材包生成 | `kit-generator.generateBatch()` | 只写当前大纲的，不清理旧包 |

**后果**：产出一份「标题是 A、正文是 B」的文档，且完全不报错。

**更深一层**：phase 0b 与 phase 3 的 `execute()` 都是**空壳** ——
`organize_materials` / `prepare_materials` 既不在 `EXECUTABLE_ACTIONS` 里、
dispatcher 也不处理，所以**自动化流程永远不会重建素材包**，
素材包只由手动命令 `/confwrite:organize` 生成。
实测上一轮是 `0b → 2 → 4a`，phase 3 被整个跳过。

**修法**：新增 `src/organize/kit-validator.ts`（解析表头、逐章校验 id + 标题）；
phase 2/3 的出口条件加上「素材包与大纲逐章对应」；phase 3 的 execute
真正调用 `organizeMaterials()`；dispatcher 加兜底校验。

**顺带修掉一个状态覆盖问题**：`organizeMaterials` 把同步结果写到磁盘上的
state，而状态机在 execute 之后用**它内存里的** state 覆盖保存 ——
同步会被回滚，新章节永远变不成 pending。phase 3 现在会把结果合并回
`ctx.state`。

**真机验证**：`Phase 2 → 3 → 4a`，ch005 素材包表头变成
「3.1 质保期服务承诺」✓，8 个素材包全部与大纲对应 ✓

**状态**：✅ 已修复（`ef378a7`）

---

### 🔴 Bug 33 — 提取器认 mermaid，注入器不认 → 图永远进不了文档

**事故链**：

```
第 1 轮审阅把 ch001 的图表判为 high：
  「使用 type/title/description 自由文本描述，不是 Mermaid、结构化 YAML」
← 但这其实是本项目自己的图表格式约定（知识库要求 mermaid）
fixer 于是把 diagram-start 标记改写成 mermaid 围栏
```

| | `diagram-start` | mermaid 围栏 |
|---|---|---|
| **提取器** | ✓ | ✓（向后兼容） |
| **注入器** | ✓ | **✗** |

**后果**：ch001 的 3 张图全部丢失 —— 文档里只剩 3 个 mermaid 代码块，
该章图片数 0，而 pipeline 汇报「图表生成完成」。

**修法**：注入器删掉本地重复的正则，改用 `extractDiagrams`（两端共用同一套
块定位）；`DiagramBlock` 增加 `rawBlock` 供精确替换；编号改为**文档顺序**
（原来先给所有 diagram-start 编号再给 mermaid 编号，mermaid 靠前时
fig1 并非文档里第一个图）。

**状态**：✅ 已修复（`f3b2e62`）

---

### 🟠 Bug 34 — 提取器扫描所有版本，注入只针对最新版本

`pipeline.extractDiagrams()` 用 `readdirSync` 扫描所有 `chXXX-v*.md`，
而注入、审阅、组装都只取**最新版本**。

**后果**：孤儿图。实测 `ch001-fig1/fig2` 由 v1 的 diagram-start 提取，
但 v2 已改成 mermaid → 有 PNG，文档里 0 处引用；**22 张图只注入 20 张**。
旧版本还可能与新版本争夺同一个 diagramId（内容来自 v1、位置在 v2）。

**修法**：每章只取最高版本号的文件（同 dispatcher / assembler 的取法）。

**状态**：✅ 已修复（`f3b2e62`）

---

### 🟠 Bug 35 — 缺 mmdc 时静默降级，谎报「生成完成」

`mmdc` 未安装时 `processMermaidBlock` 走降级分支：写一条
`svgFile=''` / `pngFile=''` 的 manifest 记录、返回 `success: true`，
而调用方 `result.generated++`（注释写着「仍然算成功，因为保留了原始内容」）。

**后果**：图根本没生成却报「图表生成完成」。与 Bug 16（缺 pandoc）同类。
附带：空文件名是 falsy，会**绕过 Bug 29 加上的产物存在性检查**，
导致这类记录永远冒充「已缓存」，装好 mmdc 也不会重试。

**修法**：`rendered` 标志 + `mermaidKeptAsCode` 计数；缺 mmdc 时不写
manifest 记录（并清掉旧记录）；`cache.shouldRegenerate` 把空文件名视为
「需要重新生成」；phase 5 汇报改为如实汇报（含安装指引）。

**真实数据验证**：

```
修复前：generated = 23（谎报），无任何告警
修复后：mermaidKeptAsCode = 3，3 条告警，manifest 23 → 20 条
```

**状态**：✅ 已修复（`f3b2e62`）

---

### 🟠 Bug 32 — turn 预算耗尽被无条件判失败，即使产物已正确产出

**真机现象**：ch005 的审阅任务

```
Tool #40: bash → python3 ... open('review/ch005-r1.json') ... print(verdict)
[budget] turn 41 超过上限 40，中止
Task completed. Turns: 41, Tool calls: 40
```

它**已经正确写出了 accept 报告**（评分 9/9/9/9/8），却在复核自己产物时
耗尽预算 → 任务判失败 → 章节变 `pending` → 触发 Bug 3 的 4c 死锁
→ 空转 2000 tick。**本次运行唯一需要人工干预的环节。**

工具调用统计：**bash 168 次**、read 68 次、write 2 次 —— 绝大部分是在
测量与自检，正是「≥300 字」规则（Bug 6）逼出来的行为。

**修法（建议）**：分类任务结果时，若该任务的目标产物已存在且有效
（如 reviewer 的 `review/chXXX-rN.json` 是合法 JSON 且有 verdict），
应判成功而非失败。

**状态**：✅ 已修复——turn 预算耗尽时先检查产物是否存在

---

## 2. 修法优先级与执行情况

### 2.1 已在 `fix/diagram-and-export` 分支完成（22 个）

目标：**不重做第 4 阶段，沿用现有 15 章产物 → 图表准确 → 导出完整 Word**。
**已端到端走通。**

| 优先级 | Bug | 提交 |
|---|---|---|
| **P0** | 25（分隔符被 pandoc 当 YAML） | `d449a45` |
| **P0** | 26（docx 图片全部未嵌入） | `17db496` |
| **P0** | 9（导出无人处理） | `8e06fcf` |
| **P0** | 10（waitPoint 跳过 execute） | `1c438a8` |
| **P0** | 1 + 2（熔断空转 + 原因被掩盖） | `a43dece` |
| **P0** | 12（图表未插入） | `ed05a4d` |
| **P0** | **28（残留产物让阶段跳过自己的工作）** | `b9b119f` |
| **P0** | **29（图表缓存不检查产物是否存在）** | `637e8b9` |
| **P2** | 17（无分层配色） | `beccb97` |
| **P2** | 18（字体硬编码，含连接标签漏网） | `beccb97` + `54897b3` |
| **P2** | 19 + 20 + 21（描述解析） | `32a6238` |
| **P2** | 14（知识库复制路径） | `ebae90b` |
| **P2** | 22（组装缺文档标题） | `1c438a8` |
| **P2** | 23 + 24（TOC 锚点 + 标题层级） | `d449a45` |
| **P2** | 27（导出未解析标题） | `17db496` |
| **P2** | **30（done 后收尾报错）** | `1f1a17c` |
| **P2** | 16（依赖预检） | `8e06fcf` |
| **P2** | 15（path-adjuster 死代码） | `ed05a4d`（不再依赖它） |

### 2.2 未做（不影响上述目标）

| 优先级 | Bug | 说明 |
|---|---|---|
| **P0** | 3（pending 孤儿） | 唯一真正未修的 Bug |

### 2.3 若重做第 4 阶段，建议这样分分支

1. `fix/pipeline-blockers` — Bug 3（含单章轮次上限）
2. `fix/review-convergence` — Bug 4、5、6、7、8（**收敛性是核心**）
3. `fix/diagram-quality-b` — 方案 B（知识库作为生成器一等输入）

---

## 3. 本次运行的其他实测结论

### 3.1 模型解析链路（已修复）

ConfWrite 的 subagent **不指定 model**，走 pi 的默认模型：

```js
// pi-executor.ts 注释原文
// 1. createAgentSession() 不指定 model → 使用 pi 默认模型
const sessionOpts = {
  sessionManager: SessionManager.inMemory(),
  cwd: this.options.projectDir,     // ← 关键：cwd 是写作项目目录
  tools,
};
```

而 pi 读设置的路径是 `join(cwd, '.pi', 'settings.json')`——**精确匹配 cwd，不向上查找**。

```
全局   ~/.pi/agent/settings.json                      qwen-token-plan-cn / qwen3.7-plus
t3 主会话  ~/Projects/t3/.pi/settings.json             deepseek / deepseek-flash（只影响交互会话）
subagent  ~/Projects/t3/projects/LmERP2/.pi/settings.json  deepseek / deepseek-flash ← 必须放这里
```

**这不是 bug，是设计缺陷**：ConfWrite 无法指定 subagent 模型，也不记录实际用了哪个模型。面板显示 deepseek 而 subagent 实际跑 qwen，**完全看不出来**，导致 429 长期误判。

**建议修**：加 `model` 配置项并透传；在 `subagent-*.log` 开头记录实际解析到的模型名。

### 3.2 turn 预算（已实现，本次首次生效）

```
[2026-09-20T02:54:36.175Z] [budget] turn 41 超过上限 40，中止
→ ❌ [Fixer] ch011 失败: Turn budget exhausted (41 > 40)
```

**同时验证了一个关键假设**：`session.abort()` 之后 `await session.prompt()` **确实会 resolve**（否则任务会挂死而非失败）。这条此前无法用单测覆盖。

### 3.3 bash 有无的对比（subagent 模型自始至终都是 qwen，对比干净）

| | 无 bash（ch003–006） | 有 bash（ch007–015） |
|---|---|---|
| 平均耗时 | 4.6 分/章 | 6.7 分/章 |
| bash 调用 | 0 | 每章 1–15 次 |
| 出现循环的章 | 0/4 | 2/9 |
| 最短章节 | 9,182 字 | 12,067 字 |

### 3.4 术语对齐（此前沟通不畅的原因）

```
智慧园区...技术方案                        ← 文档
├── 1. 投标概述                           ← 章（6 个）
│   ├── 1.1 项目理解与需求分析              ← 节 = ch001    ← 用户说的 "ch"
│   │   ├── ## 概述                       ← 小节（模型自己切）
│   │   └── ## ...
│   └── 1.2 投标响应总览与承诺              ← 节 = ch002
```

**需求口径（已确认）**：工作单元 = **ch 级**；一次 subagent 调用 = 写一个 ch；编写与度量**都在 ch 层**，单次产出 ≥ 字数下限（现为 `MIN_CHAPTER_CHARS = 8000`）。

> 历史事故：prompt 曾写「每个**子节**（## 或 ###）不少于 5000 字」——度量层级错了一层，
> 等于要求单次写 135,000 字（模型单次只能产出约 18,000 字）。已修复。

---

## 4. 当前项目与仓库状态

### t3 / LmERP2

| 项 | 值 |
|---|---|
| 路径 | `/home/water/Projects/t3/projects/LmERP2` |
| 阶段 | **`done` ✓（8 章全量重跑，流程自行走完）** |
| 章节 | **8 章**全部 `completed`（大纲已从 15 章缩减为 8 章并重新编号） |
| 产出 | `assembly/merged-v1.md`（623,165 B，7 个安全分隔符 + 20 处图片引用） |
| 图表 | `figures/` 生成 23 个块 → 20 张实际渲染（**ch001 的 3 张因缺 mmdc 未渲染**，见 Bug 35） |
| 定稿 | `output/final.md` + `finalization.json` |
| **导出** | ✅ **`output/final.docx`（639,366 B，20 张图 + TOC + Heading1 × 1）** |
| 流程轨迹 | `2 → 3 → 4a → 4b → 4c → 4d → 4b → 4c → 5 → 6 → 7 → 8 → done` |
| 耗时 | 83 分钟（14:41 → 16:04）；写作 8/8 章约 20 分钟；第 2 轮审阅 8/8 accept |

**阶段轨迹（executionLog）**

```
Phase 5 → 6     14:07:53   29 张图 + 组装（停在人工确认点）
Phase 6 → 7     14:09:43   定稿
Phase 7 → 8     14:09:43   导出
Phase 8 → done  14:09:44   ✓
```

> ⚠️ **状态被手工修过**：为解决 4c 死锁（Bug 3），
> ch002/ch006/ch007/ch010/ch011 被手工从 `pending` 改为 `completed`/`accept`。
> 备份：`project-state.json.bak-115911`、`.bak-rerun-*`、`.bak-prerun-*`。
> 这 5 章的质量**未经最终确认**，其中 ch007/ch010 只有 v1（未修复）。
>
> 另外，重跑前清理了 `figures/`、`assembly/`、`output/`（保留 `drafts/`），
> 所以上面所有产物都是**第二次重跑真实产出的**。

### 仓库

```
分支: fix/diagram-and-export（工作区干净）
基线: feat/ch-level-length @ b6fadf6
t3 的 pi: 运行中（idle）
dist: 构建于 09-20 14:12，含本次全部 22 个修复
测试: 735 通过（84 文件）
```

**分支**

| 分支 | 内容 | 状态 |
|---|---|---|
| `master` | v0.7.3 基线 | 稳定 |
| `feat/ch-level-length` | ch 级篇幅 + bash 恢复 | 已验证 |
| **`fix/diagram-and-export`** | **本轮 22 个修复** | **当前，已端到端跑通** |
| `feat/responsibility-separation` | prompt 职责分离 | ✅ **已合入并修正**（`e6e6fe6`）：保留职责分离，层级笔误改为 ch 级 |
| `feat/tool-least-privilege` | 角色工具限制 | 被取代（回退点） |

---

## 5. 恢复与验证方法

```bash
cd /home/water/Projects/confidenceWriter
git branch --show-current      # feat/ch-level-length
git status --short             # 应为空

# 确认 dist 版本（dist/ 不被 git 跟踪，切分支后不 build 会静默跑旧代码）
grep -c '整个章节（本 ch）正文合计' dist/writing/task-executor.js   # 1
grep -c 'resolveShellTool(platform())' dist/scheduler/pi-executor.js # 1
grep -c 'TOOLS_BY_ROLE' dist/scheduler/pi-executor.js                # 0

# 本轮修复的标记
grep -c 'DEFAULT_LAYER_PALETTE' dist/diagrams/style.js            # >0 分层配色
grep -c 'Noto Sans CJK' dist/diagrams/style.js                    # >0 跨平台字体
ls dist/diagrams/description-parser.js dist/diagrams/injector.js  # 均存在
grep -c 'injectDiagrams' dist/assemble/assembler.js                # >0 图表注入
grep -c 'resolveDocumentTitle' dist/assemble/assembler.js          # >0 文档标题
grep -c 'after-execute' dist/orchestrator/phases.js                # >0 waitPoint 时机
grep -c 'exportDocument' dist/orchestrator/phases.js               # >0 phase8 真导出

grep -c 'onEnter' dist/orchestrator/phases.js           # >0 阶段进入时清理残件 (Bug 28)
grep -c 'svgFile' dist/diagrams/cache.js                 # >0 缓存检查产物存在 (Bug 29)
grep -c "'done'" dist/orchestrator/phases.js             # >0 done 已注册 (Bug 30)

npm run build && npm test      # 735 通过

# t3 侧
cat /home/water/Projects/t3/projects/LmERP2/.pi/settings.json   # 必须是 deepseek
herdr agent list                                                # 确认 pi 在跑
herdr agent prompt wD:p1 "/confwrite:write projects/LmERP2"
```

### 复现各 bug 的最小方式

| Bug | 复现 |
|---|---|
| 1 + 2 | 用 `Always429Executor` 跑 `runWriteLoop`，观察 ticks=2000 且 stoppedReason='max_ticks' |
| 9 | 跑到 phase 8 观察 `output/final.docx` 永不出现 + MAX_TICKS |
| 10 | 清空 waitPoint 后第一次进入 phase 6，检查 `assembly/` 是否为空 |
| 3 | 让任一 fixer 失败（如临时把 `maxTurnsPerTask` 设为 1），观察该章变 pending 且不再被处理 |
| 12 | `grep -c 'figures/' assembly/merged-v1.md` → 0，同时 `ls figures/*.png` → 29 |
| 14 | 新建项目后 `ls knowledge/` → 只有 loader.js 等编译产物 |
| 17 | 统计 `figures/*.svg` 里的 fill 色值种数 → 2（修复后 5~6） |
| 19 | 用含全角 `：` 的描述调 `parseDiagramDescription`，看所有 node.layer 是否为 0 |
| 20 | 用 `- A → B` 调解析器，看 label 是否带 `- ` 前缀 |
| 25 | `pandoc assembly/merged-v1.md -t docx -o /tmp/x.docx` → 退出码 64 + YAML 报错 |
| 26 | 在非 `output/` 目录调 `exportDocument` → 日志出现 `Could not fetch resource` |

---

## 6. 相关文档

| 文件 | 内容 |
|---|---|
| `GIT-GUIDE.md` | Git 分支操作指南（面向不熟悉 git 者） |
| `PLAN-tool-least-privilege.md` | 旧计划（其前提已被推翻） |
| `ITERATION-PLAN-v0.7.3.md` / `ITERATION-COMPLETE-v0.7.3.md` | v0.7.3 迭代文档 |

---

## 第五轮：重写布局引擎（v0.9.0）

用户反馈两点：「ch002 的图连线黏在图形边上」「ch007 的箭头太大，和线段、图形的关系很乱」。
顺着这两条查下去，发现的问题比反馈本身多。

| # | 问题 | 根因 | 状态 |
|---|------|------|------|
| 36 | 箭头把整条线吃掉 | `markerUnits` 默认跟随线宽，`markerWidth=10 × stroke-width=1.5` = **实际 15px**，而 9 条连线总长不足 20px（最短 12px） | 修：`userSpaceOnUse` 固定 7×6 |
| 37 | 连线黏在节点边框上 | `routeIsClear` 只判「是否进入节点内部」。距边框 2px 的横线在几何上算"通畅"，视觉上就贴着边框。真实数据 **20 张图 64 处共线** | 修：节点外扩 4px 安全间距 |
| 38 | 连线水平切入目标顶边 | `buildRoute` 的混合情形让线**沿着那一行的边框**走，必然穿过同行其它节点 | 修：进出口各加一段法向短桩 |
| 39 | 候选通道全被否决后乱兜底 | 空闲通道的判据与实际通畅校验用了**不同的间距**，返回一批"看着空闲、实际贴边"的通道 → 候选耗尽 → 退回第一个候选 | 修：判据统一 + 兜底改为「违规最少」 |
| 40 | **新引擎根本没接进管线** | `layoutDiagram` 只在自己的定义文件里出现，管线仍调 `generateSVG` —— 两个引擎并存、新的没人调，用户拿到的图仍然是坏的 | 修：管线接入，旧渲染器退役 |
| 41 | **整块缩进会让图静默失效** | diagram 块解析是行首敏感的。缩进后 `hasStructuredFormat` 为 false、解析出 **0 个节点**、`description` 为空。提示词示例本身缩进 4 格 —— 写手照抄必然踩到 | 修：dedent + 相对缩进基线 |
| 42 | 提示词与知识注入**互相矛盾** | 写手提示词写着「严禁使用 mermaid」，知识注入写着「请直接使用 mermaid 代码块」 | 修：注入改为结构化格式 |
| 43 | `style.fontSize` 静默失效 | 新引擎完全忽略该字段（旧渲染器支持），改了配置没反应 | 修：实现三档字号 |
| 44 | `extractPolylines` 正则脆弱 | 要求 `points` 紧跟标签名，属性顺序一变就返回空（加 `data-*` 钩子后立刻踩到） | 修：属性顺序无关 |
| 45 | 校验器判据过时，会**误拦** | 启用阻塞规则后真实数据被拦下 12 张，全是「层级数量 ≤5」「标签长度 ≤12 字」—— 这两条是旧渲染器的限制，新引擎会折行和压缩 | 修：改为信息项，硬约束交给页面框/文字溢出/节点重叠 |
| 46 | 图表格式检查形同虚设 | `validateDiagramFormat` **只查 mermaid 块**，对真正在用的结构化格式什么都不检查 | 修：改为检查结构化块，mermaid 直接报错 |
| 47 | 真实数据回归测试写死机器路径 | 被 `try/catch` 静默跳过，最关键的那条守卫等于不存在 | 修：`CONFWRITE_REAL_DRAFTS` 环境变量 |

**本轮最重要的一条不是代码 bug，是流程 bug（#40）**：引擎写好了、测试全绿、
真实数据 0 几何问题 —— 但**没有接进产品**。测试全绿 ≠ 用户拿到好东西。

---

## 第七轮：大纲解析与章节同步问题（v0.11.0+）

sylmerp2项目（230章节）在organize阶段丢失了34个章节（ch197-ch230），导致writer只处理了196个章节。

| # | 问题 | 根因 | 临时方案 | 长期方案 | 状态 |
|---|------|------|----------|----------|------|
| 48 | outline.md中有多个`#`级别标题导致章节丢失 | `OutlineParser`在遇到第二个`#`标题时，stack被清空（因为level=1与根节点同级），后续的ch标记无法找到父节点被丢弃 | 手动将`# 十、技术支持资料`等改为`##`级别 | 引入虚拟根节点，支持多个 `#` 级标题平级存在 | ✅ 已修复 |
| 49 | package路径解析错误 | t4的settings.json中`packages: ["../confidenceWriter"]`从`.pi/`目录出发解析到错误路径 | 改为`../../confidenceWriter` | 在`confwrite:init`或首次加载时验证package路径是否正确，提供明确的错误提示 | 已修复 |
| 50 | 审阅报告写入错误目录（审阅反馈丢失） | Review prompt 只写相对路径 `review/${chapterId}-r${round}.json`，未锚定项目根。reviewer 子代理为读取任务文件先 `cd .confwrite-tasks`，随后按相对路径写入 → 落到 `.confwrite-tasks/review/` 而非 `review/`。真实数据：ch019、ch027 报告错位 | 手动把错位报告复制回 `review/`（2 个文件） | prompt 中改用绝对路径锚定项目根 | ✅ 已修复 |
| 51 | **revise 循环无轮次递增，`maxRounds` 守护失效（潜在死循环）** | `writing/orchestrator.ts` 中：`fixer` → `chapter.status='written'`；`reviewer` 判 `revise` → `chapter.status='reviewed'`。**两者都不递增 `chapter.round`**，只有 `reject` 才 `chapter.round += 1`（phases.ts:388）。而轮次守护是 `if (chapter.round >= chapter.maxRounds)`（maxRounds=5）—— `1 >= 5` 永远为 false。只要 reviewer 持续判 revise，fix→review 循环就没有终止条件 | 无（依赖 reviewer 最终 accept） | fixer 完成后 `chapter.round += 1`，审阅报告写入新轮次文件 | ✅ 已修复 |

**关键发现**：
- outline-parser对`#`级别标题的处理过于严格，导致复杂文档结构时丢失章节
- 需要在organize阶段添加章节数量验证，确保所有ch标记都被正确解析
- 当前临时方案（手动修改outline.md）可以工作，但不够健壮

**Bug 50 补充（sylmerp2 全流程运行中发现）**：
- 现象：pi 输出 `⚠️ 验证失败 (reviewer ch019): ❌ 审阅报告不存在`，批次计数 `254/230` 溢出
- 直接后果：`dispatchFixers` → `readReviewReport()` 读不到文件时返回空串，修复者拿不到任何具体问题
- 影响面：本轮 230 章中命中 2 章（约 0.9%），随文档规模增大风险上升
- 根因分类：与 Bug 41 同源 —— **prompt 里的路径是相对路径，而子代理的 cwd 不可控**

**Bug 51 补充（同一轮运行中发现）**：
- 现象：ch001 修复出 v2 后，复审（21:26）仍判 `revise`（5 个问题），状态回到 `reviewed` —— 这已经是第二轮
- 设计缺陷：`review/ch001-r1.json` 被复审**覆写**（round 恒为 1），因此磁盘上只剩最后一版报告，历史轮次不可追溯
- 修复产物同样受影响：`dispatchFixers` 的 `outputFile = chXXX-v${round+1}.md`，round 恒为 1 → 总是输出 **v2**，二次修复会**覆写 v2**
- 风险评估：内容确实在改进（accept 率明显：已复审的 ch002/ch003 均 accept），所以多数章节能收敛；但**无终止保证**，遇到持续挑刺的 reviewer 会无限循环
- 验证方法：统计「已有 v2 且状态回到 reviewed」的章节数。若同一章节反复回到 reviewed，则循环在发生
