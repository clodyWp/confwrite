# LMERP2V2 第二轮运行发现的 Bug 汇总

> 本次运行（2026-10-08）从 Phase 1 → 2 → 4a 跑通了写作流程，但暴露了多个问题。
> 等全部章节写完后统一修复。

---

## Bug A: outline 生成格式与 OutlineParser 解析格式不匹配（严重）

**现象**：Phase 2 → 4a 直接跳过 Phase 3（素材准备），chapter-kits 目录为空。

**根因**：
- `outlineCommand` 生成的大纲格式：`### 1. 概述章 (ch001)`
- `OutlineParser` 期望的格式：`ch001 概述章`（以 `ch\d+` 开头的行）
- `readChaptersFromOutline()` 解析不到任何章节 → 返回空数组
- `kitsMatchOutline()` 对空数组返回 `true`（vacuously true）
- Phase 2 出口条件 `hasFile(outline.md) && kitsMatchOutline(ctx)` 成立 → 直接跳到 4a

**影响**：Writer 没有精选素材包，只能从 inputs/ 和 reference_material/ 盲目读取，效率低且可能遗漏关键素材。

**修复方向**：
- 方案 1：修改 `generateOutlineMarkdown()` 输出 `ch001 概述章` 格式
- 方案 2：修改 `OutlineParser` 支持 `(ch001)` 括号格式
- 方案 3：`kitsMatchOutline()` 在 chapters 为空时返回 `false`（防御性修复）
- 建议三个都做。

---

## Bug B: Phase 1 需求提取器是纯规则匹配，无法处理 Word 转换文档（严重）

**现象**：280KB 的 requirements.md（3810 行）只提取出 1 条需求，且只有标题没有描述。

**根因**：
- `RequirementExtractor.extractFromDocument()` 用正则 `/^\d+\.\s+(.+)$/` 匹配数字开头的行
- requirements.md 是 Word 转换来的，格式是 `### 2.1.1 标题` + 详细段落描述
- 正则只匹配到极少数行，且只提取标题文本，丢失了所有详细描述段落
- 代码注释写着 "注意：实际实现中应该调用LLM"，但实际没有实现

**影响**：
- requirements.json 只有 1 条记录（应该是几百条）
- 需求描述为空，只有标题
- 大纲生成没有需求驱动，章节描述都是模板默认文字
- Writer 没有需求上下文，只能盲目参考原始文档

**硬约束：不得遗漏任何需求**

需求提取必须覆盖 requirements.md 中的每一条需求，不能因为合并、截断、过滤而丢失。
这是因为：
- 招标技术规格中的每一条都是应标必须响应的，遗漏 = 废标风险
- Writer 依赖 requirements.json 作为写作上下文，遗漏 = 文档缺漏
- 后续审阅阶段用 requirements.json 作为验收基线，遗漏 = 无法发现缺失

**修复方向**：
- 用 LLM 提取需求（按 AGENTS.md 设计，LLM 应该负责内容理解）
- 需求应该包含：id、title、description（详细描述）、priority、category、source
- 提取完成后必须做完整性校验：对比原始文档的标题数量 vs 提取的需求数量，确保无遗漏
- **决策**：用 LLM 做分类和优先级判断，分块处理（按章节分块），保证完整性

---

## Bug C: 大纲只有 7 章、目标 50000 字（与目标 1000000 字差距巨大）

**现象**：模板 `technical-proposal.md` 只定义了 7 个章节类型，targetWords=50000。

**影响**：即使每章写满上限（90000 字），也远达不到 100 万字目标。

**修复方向**：
- 需要为 LMERP2V2 项目定制大纲模板，扩展到 30-50+ 章
- 或让 Phase 2 根据目标字数自动扩展章节数量
- 模板中的 targetWords 应该从项目配置读取而非硬编码

---

## Bug D: CRLF 换行符导致知识库文件解析失败（已修复）

**现象**：`Invalid chapter type file format: overview` / `Invalid outline template format: technical-proposal`

**根因**：knowledge/ 下的 md 文件从 Windows 传输，使用 CRLF 换行符，但正则只匹配 LF。

**已修复文件**：
- `src/outline/template-loader.ts` — frontmatter 正则加 `\r?`
- `src/knowledge/chapter-type-loader.ts` — 同上
- `src/knowledge/requirement-category-loader.ts` — 同上
- `src/knowledge/validator.ts` — 同上

**教训**：所有文件解析正则都应该兼容 CRLF/LF。

---

## Bug E: Phase 2 waitPoint timing 错误（已修复）

**现象**：Phase 2 从 Phase 1 跳转后立即暂停（waitPoint），execute 从未被调用，outline.md 不生成。

**根因**：waitPoint timing 默认是 `entry`（进入即暂停），但 Phase 2 需要先执行大纲生成再暂停。

**已修复**：`src/orchestrator/phases.ts` — Phase 2 waitPoint 添加 `timing: 'after-execute'`。

---

## Bug F: Phase 2 execute 后 chapters 被状态机覆盖（已修复）

**现象**：outlineCommand 正确写入了 chapters 到磁盘，但状态机用自己的内存 state 覆盖保存，导致 chapters 为空 `{}`。

**根因**：`outlineCommand` 通过 `ProjectStore` 写入 chapters，但状态机的 `ctx.state` 是旧引用，execute 后 `this.store.save(state)` 覆盖了磁盘上的 chapters。

**已修复**：`src/orchestrator/phases.ts` — Phase 2 execute 末尾从磁盘重新加载 chapters 同步到 `ctx.state`（与 Phase 3 相同的修复模式）。

---

## Bug G: 大纲没有智能拆分章节，未利用 Word 标题层级结构（严重）

**现象**：Phase 2 生成的 outline.md 只有 7 章（ch001-ch007），完全按照模板的章节类型机械生成，没有根据 LMERP2V2 的实际需求进行智能拆分。

**期望行为**：
- 应该根据 280KB 的需求文档和 167 个参考资料，智能拆分成 30-50+ 个独立写作章节
- 每个 ch 应该是一个独立的写作单元（如 "ch012 采购管理模块"、"ch023 质量管理模块"）
- 目标 100 万字需要足够多的章节来承载

**根因**：
- `OutlineGenerator.generate()` 只是遍历模板的 `chapters` 数组，每个 type 生成一个章节
- 模板只有 7 个 type，所以只生成 7 章
- 没有 LLM 参与大纲规划，纯规则生成

**设计思路（待实现）—— 基于 Word 标题层级的逐级展开**：

Word 转换后的 Markdown 标题编号是有层级的，如：
```
2 系统主要功能
  2.1 战略管理
    2.1.1 完善数字化规划目标体系
      2.1.1.1 规划目标管理
      2.1.1.2 拉通“规划目标-衡量指标-重点工作”解码路径
    2.1.2 规划框架管理
    2.1.3 拉通集成计划参数与策略
  2.2 市场营销
  2.3 生产制造
    2.3.1 管理生产制造策略
    2.3.2 管理计划参数
    2.3.3 一本计划
    ...
```

大纲规划应该利用这个层级结构，采用“逐级展开”策略：

1. **先估算每级标题下的内容字数**（从 requirements.md 正文统计）
2. **从顶层开始**：如果某个标题下的内容字数 ≤ 章节字数预算上限（如 20000 字），
   则将整个标题作为一个 chapter，不再展开
3. **如果字数超出预算**：则将该标题拆分为多个 chapter，每个子标题各一个
4. **递归处理**：对子标题重复上述判断

示例：
- `2.1 战略管理` 下内容约 50000 字 → 超出预算 → 展开到 2.1.1、2.1.2、2.1.3 各一个 ch
- `2.1.1 完善数字化规划目标体系` 下内容约 8000 字 → 在预算内 → 整体作为一个 ch
- `2.3 生产制造` 下内容约 80000 字 → 展开到 2.3.1~2.3.12 各一个 ch

这样生成的章节数量自然与内容量匹配，能覆盖 100 万字目标。

**修复方向**：
- Phase 2 应该解析 requirements.md 的标题层级树
- 用字数估算驱动逐级展开决策
- 结合 LLM 判断语义完整性（有些标题虽然字数少但语义独立，应该单独成章）
- 最终生成 ch001~ch0XX 的扁平列表，每个 ch 对应一个写作任务

---

## ~~Bug H: Phase 2 waitPoint 没有真正等待用户确认~~ （已排除）

**结论**：不是 bug，是测试操作问题。

waitPoint 机制正常工作：
1. 第一次 `/confwrite:write`：Phase 2 execute → 生成 outline.md → 设置 waitPoint → 停止
2. 用户审阅/编辑 outline.md
3. 第二次 `/confwrite:write`：清空 waitPoint → 检查出口条件 → 继续

当时操作者没有编辑 outline.md 就直接再次运行，相当于跳过了用户确认步骤。代码注释明确说明了这是预期的恢复路径。

---

## Bug I: 字数预算超出目标时缺少自适应合并机制（设计问题）

**现象**：如果根据 Word 标题层级逐级展开后，所有 chapter 的预计总字数远大于目标字数（如展开后预计 200 万字，目标 100 万字），当前系统只打印警告，不做任何调整。

**当前实现**：
```typescript
// generator.ts: evaluateWordCount()
if (Math.abs(deviationRate) > tolerance) {
  warnings.push(`字数预算超出目标 ${(deviationRate * 100).toFixed(1)}%`);
  warnings.push('建议：减少章节数量或降低某些章节的字数预算');
}
```

**问题**：只生成警告，没有实际动作。

### 设计思路：基于目录层级的叶子节点向上合并

当逐级展开后总字数远超目标时，按需求的目录编号层级，**向上合并叶子层级**的章节，让多个小章节合并为一个大章节任务。

示例：
```
展开后：
  ch005: 2.1.2 规划框架管理 (3000字)
  ch006: 2.1.3 拉通集成计划参数 (5000字)
  ch007: 2.1.4 构建计划监控指标 (4000字)
  → 总计 12000字，低于单章下限

合并后：
  ch005: 2.1 战略规划与计划体系 (12000字)
  → 包含 2.1.2 + 2.1.3 + 2.1.4 的全部内容
```

合并规则：
1. 从同一父节点下的叶子章节开始合并
2. 合并后的章节字数不超过单章上限（如 20000字）
3. 合并时考虑语义相关性，不强行合并不相关内容
4. 合并后重新评估总字数，如仍超出则继续向上层合并

### 待设计的问题

#### Q1: 是否需要知识库条目来指导 LLM 做合并决策？

**需要。** 理由：
- 合并决策不是纯数学问题，需要判断语义相关性
- 比如「2.1.2 规划框架管理」和「2.1.4 构建计划监控指标」可以合并为「战略规划与监控」
- 但「2.1 战略管理」和「2.6 财经管理」不能合并，虽然它们都是「管理」
- 需要知识库提供：合并原则、示例、禁忌

**知识库条目内容设计：**
- 合并原则：同父节点优先、语义相近优先、字数互补优先
- 合并禁忌：不同业务域不合并、不同技术栈不合并
- 合并命名规则：合并后的章节标题如何生成（抽取共性、保留关键信息）
- 示例：给出几个典型的合并/不合并案例

#### Q2: 在什么地方实现？

**Phase 2 大纲规划中实现，分两步：**

```
Phase 2 执行流程（重新设计）：

  Step 1: 解析 requirements.md 的标题层级树
          ↓
  Step 2: 逐级展开，估算每个节点的字数
          ↓
  Step 3: 如果总字数 > 目标 × (1+tolerance)
          → 调用 LLM 做叶子节点向上合并
          → 输入：层级树 + 每节点字数估算 + 目标字数 + 知识库规则
          → 输出：合并后的 chapter 列表
          ↓
  Step 4: 如果合并后仍超出 → 继续向上层合并，或提示用户确认
          ↓
  Step 5: 生成 outline.md + 更新 state.chapters
          ↓
  Step 6: waitPoint 暂停，等待用户确认
```

**实现位置：**
- `src/outline/generator.ts` — 新增 `adaptiveMerge()` 方法
- `src/orchestrator/phase2.ts` — 调用 LLM 参与合并决策
- `knowledge/outline-templates/` — 新增合并规则知识库条目

#### Q3: LLM 的输入输出格式？

**输入：**
```json
{
  "targetWords": 1000000,
  "currentTotalWords": 2000000,
  "excessRate": "100%",
  "chapterTree": [
    {"id": "ch001", "path": "2.1.1", "title": "规划目标管理", "estimatedWords": 8000, "parent": "2.1"},
    {"id": "ch002", "path": "2.1.2", "title": "规划框架管理", "estimatedWords": 3000, "parent": "2.1"},
    ...
  ],
  "mergeRules": "（来自知识库）"
}
```

**输出：**
```json
{
  "mergedChapters": [
    {
      "id": "ch001",
      "title": "战略规划目标体系",
      "mergedFrom": ["2.1.1", "2.1.2"],
      "estimatedWords": 11000,
      "description": "..."
    },
    ...
  ]
}
```

#### Q4: 合并后如何保证 Writer 能写好合并后的大章节？

- 合并后的 chapter prompt 需要包含所有子章节的需求内容
- Writer 需要知道这是一个合并章节，内部按子节组织
- 审阅时按子节分别检查，而不是整体检查

#### Q5: 字数预算与容差机制

**设计决策**：
- 字数预算是可配置的（如 5000-8000 字），由业务需求决定
- 模型单次产出能力不可控（可能 3000 字，也可能 40000 字）
- 需要机制控制 Writer 产出在预算范围内

**容差规则**：±30%
- 实际字数 ≤ 预算上限 × 1.3 → 通过
- 实际字数 > 预算上限 × 1.3 → revise（要求精简）
- 实际字数 < 预算下限 × 0.7 → revise（要求补充）

**示例**：
- 预算：5000-8000 字
- 可接受范围：3500-10400 字
- 产出 9000 字 → 通过
- 产出 15000 字 → revise
- 产出 3000 字 → revise

**实现位置**：
- Writer prompt：严格限制字数（"本章字数预算 5000-8000 字，请控制在此范围内"）
- 审阅阶段：Reviewer 检查实际字数 vs 预算，超出容差则 verdict: revise

---

## 数据流因果关系

```
requirements.md (280KB Word转换)
       │
       ▼
  ┌─────────────┐
  │  Phase 1    │  Bug B: 需求提取器是纯规则匹配
  │  需求提取    │  → 只提取 1 条需求（应该几百条）
  │             │  → 丢失详细描述，只有标题
  └──────┬──────┘
         │ requirements.json
         ▼
  ┌─────────────┐
  │  Phase 2    │  Bug G: 没有利用 Word 标题层级逐级展开
  │  大纲规划    │  Bug C: 只按模板 7 个 type 机械生成 7 章
  │             │  Bug H: waitPoint 没等待确认就直接跳过
  └──────┬──────┘
         │ outline.md (格式: `### 1. 标题 (ch001)`)
         ▼
  ┌─────────────┐
  │  Phase 3    │  Bug A: outline 格式与 OutlineParser 不匹配
  │  素材准备    │  → readChaptersFromOutline() 返回空
  │  (被跳过)   │  → kitsMatchOutline() 对空数组返回 true
  │             │  → chapter-kits 为空，Writer 没有精选素材
  └──────┬──────┘
         │ (空)
         ▼
  ┌─────────────┐
  │  Phase 4a   │  Writer 盲目读原始文档，没有需求上下文
  │  写作       │  → 7 章 × ~45000 字 ≈ 31 万字（目标 100 万）
  └─────────────┘
```

核心因果链：**B → G → A → 写作质量差**

1. **B（需求提取）** 是源头 — 需求没提取出来，后面全部缺上下文
2. **G（大纲逐级展开）** 是结构 — 没有按 Word 层级智能展开，7 章承载不了 100 万字
3. **A（素材包跳过）** 是放大器 — Writer 连精选素材包都没有，只能盲读
4. **H（waitPoint 跳过）** 让人失去了干预机会 — 本来应该在 Phase 2 后编辑大纲的

## 修复优先级

| 优先级 | Bug | 理由 |
|--------|-----|------|
| P0 | B 需求提取 | 源头，不修后面全错。硬约束：不得遗漏任何需求 |
| P0 | G 大纲逐级展开 | 决定文档结构，直接影响能否达到 100 万字 |
| P0 | A/J/N outline 格式统一 | 同一个根因，影响素材包、导出、校验。统一用 OutlineParser |
| P1 | H waitPoint | 修了才能让人介入确认 |
| P1 | I 自适应合并 | 字数超出时需要有机制控制 |
| P1 | M 审阅质量 | 全部 accept 不合理，需要调整审阅标准 |
| P2 | C 模板字数 | G 修好后 C 自然解决 |
| P2 | K 定稿处理 | 当前只是复制文件，可以增强 |
| P2 | L 基线检查 | 乱码问题需要修复基线提取或匹配逻辑 |

B 和 G 是设计层面的问题，需要重新规划 Phase 1 和 Phase 2 的实现逻辑。
A 和 H 是代码 bug，改几行就行。

---

## Bug J: Phase 8 导出 DOCX 失败，流程卡在 Phase 8 空转到 MAX_TICKS

**现象**：
- `output/` 目录只有 `final.md` 和 `finalization.json`，没有 `final.docx`
- `currentPhase` 停在 `"8"`，没有转到 `"done"`
- 远程 pi 显示 "达到最大推进次数 (2000)"

**根因链**：
1. `exportDocument()` 调用 `getChapterOrder()` 从 outline.md 提取章节顺序
2. `getChapterOrder()` 用正则 `/^(ch\d{3})\s+/gm` 匹配 `ch001 ...` 开头的行
3. 但 outline.md 格式是 `### 1. 概述章 (ch001)` — ch001 在括号里，不在行首
4. `getChapterOrder()` 返回空数组
5. `exportDocument()` 返回 `{ success: false, error: 'No chapters found in outline' }`
6. Phase 8 execute 不抛异常，只返回消息
7. `final.docx` 从未创建
8. Phase 8 出口条件 `hasFile(ctx, 'output/final.docx')` 永远不满足
9. 状态机在 Phase 8 空转，直到 MAX_TICKS (2000)

**与 Bug A 的关系**：同一个根因 — outline 格式与解析器不匹配。Bug A 影响 OutlineParser，这里影响 getChapterOrder()，两处用了不同的解析逻辑。

---

## Bug K: Phase 7 定稿只是复制文件，没有真正的定稿处理

**现象**：Phase 7 (finalizer) 的 `finalize()` 函数只是：
1. 把 `assembly/merged-v1.md` 复制到 `output/final.md`
2. 计算统计信息（字数、标题数、表格数等）
3. 做基线一致性检查
4. 写入 `finalization.json`

**问题**：
- 没有真正的"定稿"操作（如格式修正、交叉引用检查、目录生成等）
- `final.md` 就是 `merged-v1.md` 的副本，没有增值
- 名字叫"定稿"但实际只是"统计"

---

## Bug L: 基线一致性检查结果是乱码

**现象**：`finalization.json` 的 `baselineMissing` 包含大量乱码片段：
```json
"实现风险可控 - **实施成效**客户及: 25%",
"齐套交付率提升25%月均实物存货降低23: 24%",
"ERP内嵌S&OP+预测BOM/计划BO: 25%",
```

**根因**：`data-baseline.json` 中的 metrics 值是长字符串（可能是从 Word 表格中提取的），`checkConsistency()` 用 `content.includes(value)` 做子串匹配，但这些长字符串在 Markdown 中被拆分或格式变了，匹配不上。

**影响**：
- 452 个基线匹配 vs 200+ 个缺失 — 但缺失项是乱码，无法判断哪些数据真的缺失
- 一致性检查结果不可信

---

## Bug M: 审阅全部 accept，Phase 4c/4d 从未触发

**现象**：7 个章节全部获得 `accept` 判定，没有任何章节需要修复或重写。Phase 4c（决策）和 Phase 4d（修复）从未执行。

**审阅结果**：
```
ch001-r1.json: accept (scores: 8-9)
ch002-r1.json: accept
ch003-r1.json: accept
ch004-r1.json: accept
ch005-r1.json: accept
ch006-r1.json: accept
ch007-r1.json: accept
```

**问题**：
- 审阅没有检查字数是否在预算范围内
- 所有章节都 accept 不太合理 — 尤其是只有 7 章、需求提取不完整的情况下

**修复方案**：
- 审阅阶段增加字数检查
- 如果实际字数超出预算的±30%，verdict 设为 `revise`
- 交给 fixer 处理字数问题

**实现位置**：
- `src/writing/task-executor.ts` — 审阅 prompt 中增加字数检查要求
- 或者在审阅后处理中增加字数校验逻辑

---

## Bug N: export 的 getChapterOrder() 与 OutlineParser 是两套独立解析逻辑

**现象**：
- `OutlineParser`（outline-parser.ts）解析 outline.md 用于素材包校验
- `getChapterOrder()`（export.ts）解析 outline.md 用于导出
- 两者用不同的正则，都不支持当前 outline 格式

**根因**：没有统一的 outline 解析入口，各处各自实现。

**修复方向**：所有需要解析 outline.md 的地方都应该使用 `OutlineParser`，删除 `getChapterOrder()` 的独立实现。

---

## 当前运行状态

| 章节 | 状态 | 字符数 |
|------|------|--------|
| ch001 概述章 | ✅ written | 34,355 |
| ch002 需求章 | ✅ written | 52,049 |
| ch003 架构章 | ✅ written | 40,010 |
| ch004 功能章 | ✅ written | 47,061 |
| ch005 实施章 | ✅ written | 42,534 |
| ch006 保障章 | 🔄 writing | ~45,319 |
| ch007 附录章 | ⏳ pending | - |

**总计**：~261,000 字符（约 26 万字），目标 100 万字。
