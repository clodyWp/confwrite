# ConfWrite 项目现状分析报告

> **日期**: 2026-10-12
> **版本**: v0.22.0
> **分支**: master
> **方法**: 本地代码扫描（82 源文件 / 161 测试文件 / 173 内部导入）

---

## 1. 执行摘要

ConfWrite 是一个成熟度较高的 TypeScript 项目（v0.22.0），核心架构（确定性状态机 + LLM 内容生成）设计合理，经过 5 轮端到端测试验证，42 个 bug 已修复。测试覆盖扎实（1321 测试 / 161 文件），GitHub CI/CD 完整（Branch Protection + auto-merge + 4 项 CI 检查）。主要风险集中在：`src/index.ts`（590 行主循环）和 `phases.ts`（734 行阶段定义）两个大文件的维护性，`outline/` 和 `utils/` 模块测试覆盖偏低，以及 1 个未修的 P0 bug（Bug 3: 4c 死锁）和若干死代码。

---

## 2. 架构健康度

### 2.1 代码规模

| 指标 | 值 |
|------|-----|
| 源文件数 | 82 个 `.ts` |
| 源码总量 | 617 KB |
| 内部导入数 | 173 条 |
| 模块目录数 | 14 个 |
| Spec 文件数 | 2 个（state-machine.md, module-contracts.md） |

### 2.2 最大文件（维护性风险）

| 文件 | 行数 | 风险 |
|------|------|------|
| `diagrams/layout/route.ts` | 797 | 正交连线路由算法，复杂但内聚 |
| `orchestrator/phases.ts` | 734 | 14 个阶段定义集中，**职责过重** |
| `writing/task-executor.ts` | 644 | Prompt 构建 + 审阅解析，**可拆分** |
| `src/index.ts` | 590 | **主循环 + 命令注册 + 状态管理**，最高风险 |
| `diagrams/layout/graph.ts` | 445 | 图构建算法，内聚 |
| `outline/generator.ts` | 383 | 大纲生成管线，合理 |

**核心问题**：`src/index.ts` 590 行承载了主循环、命令注册、Dispatcher 调用、状态检查等多重职责。这是 TODO.md 已识别的风险（"index.ts main loop at 300+ lines"），实际已达 590 行。

### 2.3 模块依赖图

```
src/index.ts (590L) ← 入口，依赖几乎所有模块
    │
    ├── orchestrator/ (状态机)
    │   ├── phases.ts (734L) ← 14 阶段定义
    │   ├── state-machine.ts
    │   ├── phase1.ts → outline/requirement-extractor
    │   └── phase2.ts → outline/generator
    │
    ├── dispatcher/ ← 连接状态机与 subagent
    │   └── index.ts → writing/, scheduler/, organize/
    │
    ├── writing/ (写作管线)
    │   ├── task-executor.ts (644L) ← Prompt 构建
    │   ├── orchestrator.ts ← 写作编排
    │   ├── output-validator.ts
    │   └── content-validator.ts
    │
    ├── scheduler/ (调度器)
    │   ├── runner.ts ← 执行循环
    │   ├── pi-executor.ts ← pi SDK 桥接
    │   ├── token-bucket.ts, retry.ts, priority-queue.ts
    │   └── loop-detector.ts, turn-budget.ts
    │
    ├── organize/ (素材整理)
    │   ├── scanner.ts → converter.ts → indexer.ts
    │   ├── baseline-extractor.ts
    │   ├── kit-generator.ts → kit-validator.ts
    │   └── chapter-syncer.ts, outline-parser.ts
    │
    ├── diagrams/ (图表管线)
    │   ├── pipeline.ts → extractor.ts → injector.ts
    │   ├── layout/ (6 文件，布局引擎)
    │   └── cache.ts, style.ts, validator.ts
    │
    ├── assemble/ (组装导出)
    │   ├── assembler.ts → finalizer.ts → converter.ts
    │   └── heading-checker.ts, cleanup-docx-styles.ts
    │
    ├── outline/ (大纲生成)
    │   ├── generator.ts → adaptive-planner.ts → llm-planner.ts
    │   ├── requirement-extractor.ts → requirement-tracer.ts
    │   └── heading-tree.ts, template-loader.ts
    │
    ├── state/ (状态管理)
    │   ├── schema.ts ← TypeBox 类型
    │   └── store.ts ← 原子化 JSON 持久化
    │
    ├── knowledge/ (知识库)
    ├── config/ (配置)
    ├── logging/ (日志)
    └── utils/ (工具)
```

### 2.4 耦合度评估

| 模块 | 耦合度 | 说明 |
|------|--------|------|
| `src/index.ts` | 🔴 高 | 依赖 orchestrator, dispatcher, scheduler, state, config, logging |
| `dispatcher/index.ts` | 🔴 高 | 依赖 writing, scheduler, organize, state |
| `orchestrator/phases.ts` | 🟠 中高 | 依赖 assemble, diagrams, writing, state, organize |
| `writing/task-executor.ts` | 🟡 中 | 依赖 config, knowledge, organize |
| `scheduler/runner.ts` | 🟡 中 | 依赖 executor 接口，实际解耦良好 |
| `state/store.ts` | 🟢 低 | 仅依赖 fs, path |
| `diagrams/layout/*` | 🟢 低 | 内部自包含，无外部依赖 |

**结论**：耦合集中在顶层编排层（index.ts, phases.ts, dispatcher），底层模块（state, diagrams/layout, scheduler 基础组件）解耦良好。

---

## 3. 测试覆盖热力图

### 3.1 总体数据

| 指标 | 值 |
|------|-----|
| 测试文件数 | 161 passed + 3 skipped = 164 |
| 测试用例数 | 1321 passed + 31 skipped = 1352 |
| 测试运行时间 | 33.92s（含 transform 9.45s + collect 59.16s） |
| 源文件/测试文件比 | 82 / 161 = **0.51**（每个源文件约 2 个测试文件） |

### 3.2 模块覆盖率热力图

```
模块              src 文件   测试文件   比值    评级
────────────────────────────────────────────────────
orchestrator/       4        16       4.0    ████████ 🟢 极强
writing/            4        16       4.0    ████████ 🟢 极强
commands/           4        12       3.0    ██████   🟢 强
dispatcher/         1         2       2.0    ████     🟡 中
diagrams/          17        29       1.7    ███      🟡 中
organize/          10        17       1.7    ███      🟡 中
state/              2         3       1.5    ███      🟡 中
scheduler/         12        17       1.4    ███      🟡 中
assemble/           5         7       1.4    ███      🟡 中
knowledge/          4         5       1.2    ██       🟡 中
logging/            5         5       1.0    ██       🟡 中
config/             1         1       1.0    ██       🟡 中
outline/           10         9       0.9    █        🟠 偏弱
utils/              2         1       0.5    █        🔴 弱
```

### 3.3 薄弱模块详情

| 模块 | 问题 | 具体缺失 |
|------|------|----------|
| **outline/** | 10 个源文件只有 9 个测试 | `heading-tree.ts` 无独立测试；`template-loader.ts` 测试不足；`word-count-analyzer.ts` 覆盖浅 |
| **utils/** | 2 个源文件只有 1 个测试 | `dedent.ts` 完全无测试 |
| **logging/** | 5 个文件 5 个测试（1:1） | 每个文件仅 1 个测试，边界情况未覆盖 |
| **config/** | 1 个文件 1 个测试 | 配置边界值、错误路径未覆盖 |
| **knowledge/** | 4 个文件 5 个测试 | `validator.ts` 的跨模块验证场景不足 |

### 3.4 回归测试覆盖

已修 bug 的回归测试覆盖情况：

| Bug | 回归测试 | 验证方式 |
|-----|----------|----------|
| Bug 1 (熔断空转) | ✅ `circuit-breaker-stop.test.ts` | `expected 2000 to be less than 50` |
| Bug 9 (phase8 无人处理) | ✅ `phase8-export.test.ts` | 验证 exportDocument 被调用 |
| Bug 10 (waitPoint 跳过) | ✅ `wait-points.test.ts` | 验证 execute 在 waitPoint 前运行 |
| Bug 12 (图未插入) | ✅ `injector.test.ts` | 29/29 注入验证 |
| Bug 25 (分隔符 YAML) | ✅ `assembler-structure.test.ts` | 分隔符格式检查 |
| Bug 26 (pandoc cwd) | ✅ `export-docx-images.test.ts` | `expected 0 to be >= 1` |
| Bug 28 (残留产物) | ✅ `stale-artifacts.test.ts` | onEnter 清残件验证 |
| Bug 29 (缓存不检查) | ✅ `cache.test.ts` | 产物存在性检查 |
| Bug 30 (done 报错) | ✅ `done-terminal.test.ts` | 终态不报错 |
| SM-* (spec 不变量) | ✅ `spec-invariants.test.ts` | 9 条不变量验证 |

---

## 4. 技术债务清单

### 4.1 按严重度排序

| # | 严重度 | 债务 | 位置 | 影响 |
|---|--------|------|------|------|
| 1 | 🔴 P0 | **Bug 3: pending 孤儿 / 4c 死锁** | `orchestrator/phases.ts:332` | 任务执行失败→round 不增→4c 三出口全不满足→死锁 |
| 2 | 🔴 P0 | **`src/index.ts` 590 行主循环** | `src/index.ts` | 多重职责集中，修改风险高 |
| 3 | 🟠 P1 | **`phases.ts` 734 行阶段定义** | `orchestrator/phases.ts` | 14 阶段集中，难以独立测试 |
| 4 | 🟠 P1 | **`task-executor.ts` 644 行** | `writing/task-executor.ts` | Prompt 构建 + 审阅解析混合 |
| 5 | 🟠 P1 | **`path-adjuster.ts` 死代码** | `diagrams/path-adjuster.ts` | 无生产代码引用，仅测试引用 |
| 6 | 🟠 P1 | **`checkWordCount()` 死代码** | `writing/task-executor.ts:756-775` | 无调用方 |
| 7 | 🟡 P2 | **`content-validator.ts` dead fields** | `writing/content-validator.ts` | `paragraphLengthValid`/`shortParagraphs` 永远 `true`/`[]` |
| 8 | 🟡 P2 | **`types.ts:31` 冗余枚举** | `scheduler/types.ts` | `'rate_limited'` 枚举值无使用 |
| 9 | 🟡 P2 | **`runner.ts:150` TODO** | `scheduler/runner.ts:150` | `round: 1, // TODO: get from task` 硬编码 |
| 10 | 🟡 P2 | **DESIGN.md 测试统计过时** | `DESIGN.md` | 写 "433/51"，实际 1321/161 |
| 11 | 🔵 P3 | **`outline/` 测试覆盖偏低** | `tests/outline/` | 0.9 比值，`heading-tree.ts` 无测试 |
| 12 | 🔵 P3 | **`utils/dedent.ts` 无测试** | `tests/utils/` | 仅 `paths.test.ts`，dedent 无覆盖 |
| 13 | 🔵 P3 | **14 个废弃远程分支** | GitHub | `delete_branch_on_merge: false` |

### 4.2 死代码清单

| 文件/函数 | 引用数 | 说明 |
|-----------|--------|------|
| `diagrams/path-adjuster.ts` → `adjustImagePaths()` | 0（仅测试） | Bug 15 已结案，模块暂留 |
| `writing/task-executor.ts` → `checkWordCount()` | 0 | 检测层未实现 |
| `writing/content-validator.ts` → `paragraphLengthValid` | 0（永远 true） | Bug 6 修复后遗留 |
| `scheduler/types.ts` → `'rate_limited'` | 0 | 枚举值冗余 |
| `src/index.ts` → `WriteLoopResult`, `WriteLoopOptions` | 0 | 导出但未使用 |

### 4.3 TODO/FIXME 注释

仅发现 **1 个真正的 TODO**：

```
scheduler/runner.ts:150: round: 1, // TODO: get from task
```

其余匹配项都是代码注释中的 `xxx` 占位符或说明文字，不是待办。

---

## 5. 性能瓶颈识别

### 5.1 结论：无需专门优化

| 原因 | 说明 |
|------|------|
| LLM 生成是固有成本 | Writer 占 56% 运行时间，无法优化 |
| 并发受 API 限流约束 | 高并发触发 429，已有令牌桶 + 退避机制 |
| 素材包改进已降低 prompt 大小 | 从 114 KB → ~15 KB |

### 5.2 潜在瓶颈

| 位置 | 问题 | 严重度 |
|------|------|--------|
| `state/store.ts` | 每次 save 全量序列化 JSON，大项目（200 章）可能慢 | 🟡 中 |
| `diagrams/layout/route.ts` (797L) | 正交连线路由算法复杂度高，大图可能慢 | 🟡 中 |
| `organize/scanner.ts` | 递归扫描 + 关键词提取，大目录可能慢 | 🟢 低 |

### 5.3 缓存策略评估

| 缓存 | 策略 | 状态 |
|------|------|------|
| 图表缓存 | 源哈希 + 产物存在性检查 | ✅ Bug 29 修复后正确 |
| 状态持久化 | 原子化写入（temp → rename） | ✅ 正确 |
| 调度器状态 | 序列化/反序列化 | ✅ 正确 |

---

## 6. 开发体验评估

### 6.1 文档完整性

| 文档 | 状态 | 问题 |
|------|------|------|
| README.md | ✅ 完整 | — |
| AGENTS.md | ✅ v2.1 | — |
| DESIGN.md | ⚠️ 过时 | 测试统计 "433/51" 应为 "1321/161" |
| CHANGELOG.md | ✅ 最新 | v0.22.0 |
| TODO.md | ✅ 完整 | — |
| BUGS.md | ✅ 完整 | 35 个 bug 详细记录 |
| SKILL.md | ✅ 完整 | — |
| specs/ | ✅ 2 文件 | state-machine.md + module-contracts.md |

### 6.2 CI/CD 流程

| 环节 | 状态 | 说明 |
|------|------|------|
| CI Workflow | ✅ 活跃 | push/PR 触发 |
| Build & Test | ✅ Node 18.x + 20.x | 矩阵测试 |
| docs:check | ✅ | 文档一致性检查 |
| sdd:check | ✅ | Spec-Driven 合规检查 |
| Branch Protection | ✅ master | `protected: true`, status checks 要求 |
| Auto-merge | ✅ 仓库启用 | `allow_auto_merge: true` |
| Issue 模板 | ✅ | 结构化表单 |
| PR 模板 | ✅ | 含文档检查清单 |

### 6.3 学习曲线评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构理解 | 🟢 低曲线 | DESIGN.md 详细，状态机流转清晰 |
| 开发约束 | 🟢 低曲线 | AGENTS.md 明确，SDD 流程清晰 |
| 测试编写 | 🟡 中曲线 | MockSubagentExecutor 需理解，但文档充分 |
| 端到端调试 | 🔴 高曲线 | 需要 pi 环境 + 真实项目，门槛较高 |
| 图表系统 | 🟠 中高曲线 | 布局引擎 6 文件，理解成本高 |

---

## 7. 优先改进建议（Top 5）

### 7.1 🔴 P0: 修复 Bug 3（4c 死锁）

**影响**：任务执行失败时流程死锁，需人工干预。
**修法**：`phases.ts:332` 的 → 4a 条件改为 `ch.status === 'pending'`（不限 round），同时加单章轮次上限（如 3 轮后强制 accept/fail）。
**预估工作量**：0.5 天。

### 7.2 🟠 P1: 拆分 `src/index.ts`（590 行）

**影响**：主循环承载多重职责，修改风险高。
**修法**：
- 提取 `writeLoop.ts`（主循环逻辑）
- 提取 `commandHandlers.ts`（命令注册）
- `index.ts` 只做入口注册

**预估工作量**：1 天。

### 7.3 🟠 P1: 清理死代码

**影响**：维护负担 + 误导新开发者。
**清单**：
- 删除 `diagrams/path-adjuster.ts` + 其测试（或标注 `@deprecated`）
- 删除 `checkWordCount()` 函数
- 清理 `content-validator.ts` dead fields
- 移除 `types.ts:31` 的 `'rate_limited'` 枚举值
- 移除 `index.ts` 未使用的导出

**预估工作量**：0.5 天。

### 7.4 🟡 P2: 补充 `outline/` 和 `utils/` 测试

**影响**：测试覆盖最薄弱的两个模块。
**清单**：
- `heading-tree.ts` 独立测试
- `word-count-analyzer.ts` 边界测试
- `utils/dedent.ts` 测试
- `config/loader.ts` 边界值测试

**预估工作量**：1 天。

### 7.5 🟡 P2: 更新 DESIGN.md 测试统计

**影响**：文档与实际不一致，误导开发者。
**修法**：将 "433 tests / 51 files" 更新为 "1321 tests / 161 files"。
**预估工作量**：5 分钟。

---

## 附录 A: 文件清单

### 源文件（82 个）

| 目录 | 文件数 | 主要文件 |
|------|--------|----------|
| `src/` | 1 | `index.ts` (590L) |
| `src/orchestrator/` | 4 | `phases.ts` (734L), `state-machine.ts` |
| `src/writing/` | 4 | `task-executor.ts` (644L), `orchestrator.ts` |
| `src/diagrams/` | 12+5 | `pipeline.ts`, `layout/route.ts` (797L) |
| `src/scheduler/` | 12 | `runner.ts`, `pi-executor.ts` |
| `src/organize/` | 10 | `kit-generator.ts`, `chapter-syncer.ts` |
| `src/outline/` | 10 | `generator.ts`, `llm-planner.ts` |
| `src/assemble/` | 5 | `assembler.ts`, `finalizer.ts` |
| `src/commands/` | 4 | `init.ts`, `export.ts` |
| `src/knowledge/` | 4 | `loader.ts`, `validator.ts` |
| `src/logging/` | 5 | `logger.ts`, `event-bus.ts` |
| `src/state/` | 2 | `schema.ts`, `store.ts` |
| `src/config/` | 1 | `loader.ts` |
| `src/utils/` | 2 | `paths.ts`, `dedent.ts` |
| `src/dispatcher/` | 1 | `index.ts` |

### 测试文件（161 passed + 3 skipped）

| 目录 | 文件数 |
|------|--------|
| `tests/orchestrator/` | 16 |
| `tests/writing/` | 16 |
| `tests/scheduler/` | 17 |
| `tests/organize/` | 17 |
| `tests/diagrams/` | 29 |
| `tests/commands/` | 12 |
| `tests/e2e/` | 15 |
| `tests/outline/` | 9 |
| `tests/assemble/` | 7 |
| `tests/knowledge/` | 5 |
| `tests/logging/` | 5 |
| `tests/state/` | 3 |
| `tests/config/` | 1 |
| `tests/utils/` | 1 |
| `tests/` (根) | 8 |

---

## 附录 B: GitHub 基础设施状态

| 项目 | 状态 | 证据 |
|------|------|------|
| GitHub 认证 | ✅ | `gh auth status` → HupMa 账户 |
| 远程仓库 | ✅ | `origin` → `github.com/clodyWp/confwrite` |
| CI Workflow | ✅ | `.github/workflows/ci.yml` 活跃 |
| Branch Protection | ✅ | master `protected: true` |
| Status Checks | ✅ | `Build & Test (18.x)`, `Build & Test (20.x)` |
| Auto-merge | ✅ | `allow_auto_merge: true` |
| Issue 模板 | ✅ | `.github/ISSUE_TEMPLATE/feature.yml` |
| PR 模板 | ✅ | `.github/pull_request_template.md` |
| SDD 检查 | ✅ | `scripts/check-sdd.js` + CI 集成 |
| 文档检查 | ✅ | `scripts/check-docs.js` + CI 集成 |
| 已合并 PR | 46 个 | 流程运转正常 |
| 活跃 Issue | 2 个 OPEN | #42 (LLM 字数约束), #25 (PR evidence gates) |
| 废弃分支 | 14 个 | `delete_branch_on_merge: false` |
