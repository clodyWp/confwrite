# ConfWrite Bug 清单（全流程实测）

> 记录时间：2026-09-20
> 来源：LmERP2 项目一次完整的端到端运行（写作 → 审阅 → 修复 → 图表 → 组装 → 定稿 → 导出）
> 所有 bug **均有实测证据**，非静态分析推测
> 代码基线：`feat/ch-level-length` @ `b6fadf6`（dist 构建于 09-20 07:53）

---

## 0. 本次实测结果概览

| 阶段 | 结果 |
|---|---|
| 4a 写作 | ✅ 15 章 |
| 4b 审阅 | ✅（多轮反复） |
| 4c 决策 | ⚠️ 死锁（Bug 3） |
| 4d 修复 | ✅ |
| 5 图表生成 | ✅ 29 张图（59 文件） |
| 6 组装 | ⚠️ 首次跳过（Bug 10）→ 第二次成功 |
| 7 定稿 | ✅ `output/final.md` |
| **8 导出** | ❌ **卡死（Bug 9）** |

**产出**：`assembly/merged-v1.md` = 1.16 MB / **310,887 中文字 / 约 282 页 / 29 张图表**
**但**：29 张图**一张都没进文档**（Bug 12），且**永远无法导出成 Word**（Bug 9）。

---

## 1. Bug 清单

按严重度排序。**P0 = 阻断流程或烧钱烧时间**。

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

---

### 🟡 P2：产出质量缺陷

#### Bug 13 — 生成阶段 pipeline 完全不读知识库

**证据**：

```
使用 KnowledgeLoader 的:  organize.ts / dispatcher:109 / kit-generator.ts
src/diagrams/（提取+生成图的 pipeline）:  ✗ 零引用
```

**修法**：在 `pipeline.ts` 里加载 `knowledge/diagrams/`（尤其 `architecture-style.md`、`layout.md`、`quality-lessons.md`），用于图表样式与布局决策。

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

---

#### Bug 7 — 审阅报告被覆盖，历史丢失

**证据**：`review/` 下只有 15 个 `-r1.json`，**没有 r2**。

```
文件命名: review/${chapterId}-r${round}.json     （orchestrator.ts:172）
其中 round = state.round —— revise 循环不会增加它（永远是 1）
```

**实测**：11:03–11:15 的重审**覆盖了** 09:14–09:30 的第一轮报告，导致无法对比「修完是否变好」。

**修法**：文件名应包含轮次，或与 `chapters[].round`、修复次数解耦（例如用时间戳或独立的 review 序号）。

---

#### Bug 11 — `finalization.json` 字段命名错误

**证据**（`src/assemble/finalizer.ts:94`）：

```js
const chapters = (content.match(/^## /gm) || []).length;   // ← 数的是所有 ## 标题
```

实测输出 `"chapters": 67`，而实际只有 **15 章**。67 是所有 `## ` 级标题的总数。

附带：`"images": 0` 在数值上正确（文档确实没有图片），但它是 Bug 12 的症状而非独立统计。

**修法**：改名为 `level2Headings`，或按章节切分逻辑正确统计章数。

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

---

### 🔵 P3：非系统性问题（偶发，已记录）

| 现象 | 频次 | 说明 |
|---|---|---|
| agent 中途重启（`agent_end` → `agent_start`） | 2/36 任务 | 机制未明，未影响结果 |
| 无工具的长轮次（300s / 328.6s） | 2/36 轮次 | 不产生任何工具调用，疑似模型长推理或端点卡顿 |
| fixer 跑进「验证工具行为」的兔子洞 | 1 次 | ch011 反复在 /tmp 建测试文件验证全角标点是否被破坏，41 轮被预算中止 |

> **补充说明**：`>200s` 的长轮次共 16 个，其中 14 个是正常的 `write` 轮（写整章本来就慢，230–290s），**不是异常**。

---

## 2. 修法优先级建议

| 优先级 | Bug | 理由 |
|---|---|---|
| **P0** | 9（导出无人处理） | 流程无法完成，产品直接用不了 |
| **P0** | 3（pending 孤儿）+ 轮次上限 | 死锁主因 |
| **P0** | 10（waitPoint 跳过 execute） | 让你审阅不存在的文件 |
| **P0** | 1 + 2（熔断空转 + 原因被掩盖） | 烧时间且掩盖真实原因 |
| **P1** | 6（≥300 字规则） | **不收敛的根因** |
| **P1** | 4 + 5（accept 门槛 / 严重度） | 同上 |
| **P1** | 8（退避死代码） | 配额问题无法自愈 |
| **P2** | 12 + 15（图表未插入） | 产出缺 29 张图 |
| **P2** | 13 + 14（知识库未加载） | 图表质量受损 |
| **P2** | 7（审阅报告覆盖） | 无法对比修复效果 |
| **P3** | 11（统计命名） | 仅影响可读性 |

**建议分三条分支修**，保持单一变量便于归因：

1. `fix/pipeline-blockers` — Bug 9、10、1、2（流程能否走完）
2. `fix/review-convergence` — Bug 3、4、5、6（能否收敛）
3. `fix/diagram-injection` — Bug 12、13、14、15（图表能否进文档）

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
| 阶段 | `8`（导出）— 卡死 |
| 章节 | 15 章全部 `completed`（其中 5 章为手工标记，见下方说明） |
| 产出 | `assembly/merged-v1.md`（1.16 MB / 310,887 字 / 约 282 页） |
| 图表 | `figures/` 29 张（png+svg）**未插入文档** |
| 定稿 | `output/final.md` + `finalization.json` |
| 导出 | ✗ 无 |

> ⚠️ **状态被手工修改过**：为解决 4c 死锁（Bug 3），ch002/ch006/ch007/ch010/ch011
> 被手工从 `pending` 改为 `completed`/`accept`。备份在 `project-state.json.bak-115911`。
> 这 5 章的质量**未经最终确认**，其中 ch007/ch010 只有 v1（未修复）。

### 仓库

```
分支: feat/ch-level-length @ b6fadf6（工作区干净）
任务: t3 的 pi 会话运行中（idle）
dist: 构建于 09-20 07:53，含 ch 级篇幅修正 + bash 恢复 + turn 预算
```

**其他分支**

| 分支 | 内容 | 状态 |
|---|---|---|
| `master` | v0.7.3 基线 | 稳定 |
| `feat/responsibility-separation` | prompt 职责分离 | ⚠️ **含同样的「每个子节 3000-5000 字」层级错误**，合并前必须一并修正 |
| `feat/tool-least-privilege` | 角色工具限制 | 被取代（回退点） |
| `feat/ch-level-length` | ch 级篇幅 + bash 恢复 | 当前，已验证 |

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

npm run build && npm test      # 640 通过

# t3 侧
cat /home/water/Projects/t3/projects/LmERP2/.pi/settings.json   # 必须是 deepseek
herdr agent list                                                # 确认 pi 在跑
herdr agent prompt wD:p1 "/confwrite:write projects/LmERP2"
```

### 复现各 bug 的最小方式

| Bug | 复现 |
|---|---|
| 9 | 跑到 phase 8 观察 `output/final.docx` 永不出现 + MAX_TICKS |
| 10 | 清空 waitPoint 后第一次进入 phase 6，检查 `assembly/` 是否为空 |
| 3 | 让任一 fixer 失败（如临时把 `maxTurnsPerTask` 设为 1），观察该章变 pending 且不再被处理 |
| 12 | `grep -c 'figures/' assembly/merged-v1.md` → 0，同时 `ls figures/*.png` → 29 |
| 14 | 新建项目后 `ls knowledge/` → 只有 loader.js 等编译产物 |

---

## 6. 相关文档

| 文件 | 内容 |
|---|---|
| `GIT-GUIDE.md` | Git 分支操作指南（面向不熟悉 git 者） |
| `PLAN-tool-least-privilege.md` | 旧计划（其前提已被推翻） |
| `ITERATION-PLAN-v0.7.3.md` / `ITERATION-COMPLETE-v0.7.3.md` | v0.7.3 迭代文档 |
