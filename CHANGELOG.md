# Changelog

All notable changes to this project will be documented in this file.

## [0.26.0] - 2026-10-14

### Added
- **Issue #74: Round 文件名一致性** — 统一使用 chapter.round 创建 task ID 和查找文件
  - `src/dispatcher/index.ts`: dispatchReviewers 和 dispatchFixers 使用 chapter.round
  - 新增测试 `tests/dispatcher/round-consistency.test.ts`（3 个测试用例）
- **Issue #75 & #76: 字数控制 prompt 改进** — Writer 和 Reviewer prompt 改进
  - `src/writing/task-executor.ts`: Writer prompt 添加字数控制策略（6 种压缩方法）
  - `src/writing/task-executor.ts`: Reviewer prompt 强制字数超标时必须返回 revise
  - 新增测试 `tests/writing/word-count-prompt-improvements.test.ts`（7 个测试用例）

### Fixed
- **Issue #79: Writer 字数控制 - 硬性截断机制** — 当字数超标超过 20% 时自动截断
  - `src/writing/output-validator.ts`: 添加硬性字数截断机制
  - 新增测试 `tests/writing/word-count-truncation.test.ts`（4 个测试用例）
- **Issue #80: Reviewer verdict 矛盾检查增强** — 同时检查 issues 和独立字数验证结果
  - `src/writing/output-validator.ts`: 增强 verdict 一致性检查
  - 新增测试 `tests/writing/verdict-consistency-enhanced.test.ts`（5 个测试用例）
- **Issue #81: Phase 4b 无法退出当所有章节 failed (SM-20)** — 修改退出条件
  - `src/orchestrator/phases.ts`: 当所有章节都处于终态时也可以退出
  - 新增测试 `tests/orchestrator/phase4b-exit-condition.test.ts`（7 个测试用例）

## [0.25.0] - 2026-10-13

### Added
- **Issue #67: E2E testing skill and validators** — 端到端测试框架
  - 新增 `.agents/skills/e2e-testing/SKILL.md` — E2E 测试流程指南
  - 新增 `e2e-regression/validators/` — 验证脚本（phase-flow, word-count, chapter-types, integrity-check）
  - 新增 `e2e-regression/datasets/` — 测试数据集配置（minimal, standard, full）
  - 新增 `e2e-regression/bug-patterns.json` — 已知 bug 模式数据库

### Fixed
- **Issue #69: Reviewer/Fixer prompt 字数控制策略改进** — 审阅者和修复者 prompt 改进
  - Reviewer prompt 添加字数上限检查
  - Fixer prompt 添加压缩策略指导

## [Unreleased]

### Added
- **Issue #57: Phase transition 时保存状态快照** — 每次 phase transition 时在 `logs/checkpoints/` 保存快照，支持断网恢复和执行历史回溯
  - `src/orchestrator/state-machine.ts`: advance() 调用前保存快照（`saveCheckpoint()`），包含 timestamp/from/to/chapters/tasks
  - 快照文件名格式：`checkpoint-{timestamp}.json`
  - 快照保存失败不影响主流程（try-catch 包裹）
  - `forceAdvance()` 同样保存快照
  - 新增 spec SM-18：Phase transition 时必须保存状态快照
  - 新增测试 `tests/orchestrator/state-snapshot.test.ts`（6 个测试用例）
- **Issue #53: 补全事件 emit — 11 个事件类型从未 emit** — 关键状态变化现在通过 EventBus emit 事件
  - `src/orchestrator/state-machine.ts`: advance() emit `phase.transition` 事件（含章节统计）
  - `src/writing/orchestrator.ts`: updateChapterStatus() emit `chapter.status`、`chapter.failed`、`round.exceeded` 事件
  - `src/diagrams/pipeline.ts`: run() emit `diagram.scan`、`diagram.generate` 事件
  - `src/scheduler/pi-executor.ts`: emit `tool.call`、`budget.warning`、`budget.exceeded`、`loop.detected` 事件
  - `src/scheduler/runner.ts`: runAll() emit `stats.progress` 事件
  - `src/orchestrator/phases.ts`: PhaseContext 新增可选 `eventBus` 字段，Phase 5 传递 EventBus 给 DiagramPipeline
  - `src/index.ts`: 将 EventBus 注入 StateMachine、WritingOrchestrator、PiSubagentExecutor
  - 新增 spec SM-17：关键状态变化必须 emit 事件
  - 新增测试 `tests/logging/event-emission.test.ts`（12 个测试用例）

### Changed
- **Issue #55: DIAG 日志整合到 EventBus (LOG-4)** — 统一日志查询入口
  - `src/dispatcher/index.ts`: 移除直接写入 `diag-wordbudget.json`，改为通过 EventBus emit `diag.wordbudget` 事件
  - `src/writing/task-executor.ts`: 移除直接写入 `diag-task-executor.json`，改为通过 EventBus emit `diag.taskexecutor` 事件
  - `src/logging/types.ts`: 新增 `DiagWordBudgetEvent` 和 `DiagTaskExecutorEvent` 类型定义
  - `src/logging/logger.ts`: 新增 DIAG 事件格式化方法
  - `src/index.ts`: 传递 EventBus 到 Dispatcher 和 TaskExecutor
  - `specs/module-contracts.md`: 新增 LOG-4 不变量
  - 新增 `tests/logging/diag-integration.test.ts` 回归测试
- **Issue #54: 日志从全量重写改为 JSONL 增量追加** — 消除 O(n²) I/O
  - `src/logging/index.ts`: `flushLog()` → `appendLog()`，每个事件追加一行 JSONL
  - 移除 `logEntries` 内存缓存（不再需要）
  - 默认文件名从 `confwrite-log.json` 改为 `confwrite-log.jsonl`
  - `dispose()` 不再需要最终刷新
  - `specs/module-contracts.md`: 新增 §3.9 日志系统契约 (LOG-1~LOG-3)
  - 新增 `tests/logging/jsonl-incremental.test.ts` (5 tests)

### Fixed
- **Issue #47-3: Phase 4d allExceeded 死锁** — validate 检测到所有章节超过 maxRounds 时返回 blocked，但 exit 条件不满足，导致状态机死锁
  - `src/orchestrator/phases.ts`: phase4d validate 在 allExceeded 时将章节标记为终态（有产物→completed，无产物→failed），而不是返回 blocked
  - 新增 spec SM-16: Phase 4d allExceeded 死锁防护
  - 新增回归测试 `tests/orchestrator/phase4d-maxrounds-deadlock.test.ts`（6 个测试）
- **Issue #56: 日志写入原子化，防止崩溃时日志丢失** — `flushLog()` 使用 temp + rename 模式
  - `src/logging/index.ts`: 日志先写入 `.tmp` 临时文件，再 `renameSync` 到目标路径
  - 写入失败时自动清理临时文件（LOG-2）
  - 新增 spec LOG-1~3（`specs/module-contracts.md` §7）
  - 新增 `tests/logging/atomic-writing.test.ts` 回归测试
- **Bug #47 子任务 1：移除 `phases.ts:459` 的 `&& ch.round > 1` 死代码** — 4c → 4a 退出条件不再检查 `round > 1`
  - `src/orchestrator/phases.ts`: 4c → 4a 条件改为 `ch.status === 'pending'`（不检查 `round`）
  - 原因：所有设置 `pending` 的路径（phases.ts 4c reject、orchestrator.ts reject、Bug 51 fixer）都会递增 `round`，`pending` 必然 `round > 1`，原条件恒为 true
  - 新增 `tests/orchestrator/phase4c-pending-orphan.test.ts` 回归原始 Bug 3 症状（`pending(round=1)` 触发 4c → 4a）
  - `specs/state-machine.md`: 新增不变量 SM-14

## [0.24.0] - 2026-10-13

### Added
- **E2E Testing Skill** — 完整的端到端测试流程
  - `.agents/skills/e2e-testing/SKILL.md`: 7 阶段测试流程（完整性验证 → 环境准备 → 实时监控 → 工作流 → 回归数据 → Bug 分类 → 验证报告）
  - `e2e-regression/validators/`: 5 个验证脚本（phase-flow、word-count、chapter-types、integrity-check、run-all）
  - 所有脚本支持本地模式和远程模式（`--host` + `--dir`）
  - `e2e-regression/datasets/`: 3 个回归数据集配置（minimal/standard/full）
  - `e2e-regression/bug-patterns.json`: Bug 模式数据库（7 个已知模式）

### Fixed
- **E2E v24 验证**: Bug #63 和 Bug #65 修复在远程 E2E 测试中验证通过
  - 7 章全部正确经过 `written` 状态，审阅阶段没有被跳过
  - DIAG 日志不再 flooding TUI
  - 测试完整性检查通过（无源码访问）

## [0.23.0] - 2026-10-13

### Fixed
- **Bug #63: Writer validation_failed 错误设置 reviewed 状态导致审阅被跳过** — E2E 测试 v9 发现的核心状态机 bug
  - `src/writing/orchestrator.ts`: validation_failed 时设置 `status = 'written'`（让 reviewer 评估），而不是 `reviewed`
  - `src/writing/orchestrator.ts`: execution_failed + 无输出时设置 `status = 'pending'`（重试 writer），而不是 `reviewed`
  - `src/orchestrator/phases.ts`: Phase 4a 出口条件移除 `reviewed`（reviewed 只应该在 Phase 4b 之后出现）
  - 新增 spec SM-19：`reviewed` 状态只应该在 Phase 4b（审阅）之后出现
  - 新增回归测试 `tests/writing/validation-failed-status.test.ts`（5 个测试用例）
  - 更新 5 个旧测试以反映新的正确行为
- **Bug #65: DIAG 日志 flooding TUI** — DIAG 日志通过 console.log 直接输出到 TUI，淹没 subagent 状态信息
  - 将 4 处 console.log 改为通过 EventBus 发送 diag 事件
    - DIAG-DISPATCHER → `diag.dispatcher`
    - DIAG-WORD BUDGET → `diag.wordbudget`
    - DIAG-REVIEW → `diag.review`
    - DIAG-PROMPT → `diag.prompt`
  - `src/logging/index.ts`: handleEvent() 过滤 diag 事件，不输出到 TUI
  - `src/logging/types.ts`: 新增 3 个 diag 事件类型定义
  - `src/logging/logger.ts`: 新增 3 个 diag 事件格式化方法

## [0.22.0] - 2026-10-12

### Fixed
- **Issue #47-2: Reject 时 round 双重递增** — 移除 phases.ts 4c execute 中的多余 round 递增
  - `src/orchestrator/phases.ts`: 4c execute 不再递增 reject 章节的 round（round 已在 orchestrator.ts updateChapterStatus 中递增）
  - 新增 spec SM-15：Reject 时 round 只递增一次
  - 新增回归测试 `tests/orchestrator/phase4c-double-increment.test.ts`
- **Bug #33: Phase 1 状态转换绕过状态机** — 移除 phase1.ts 中的直接状态修改
  - `src/orchestrator/phase1.ts`: 删除 `state.currentPhase = '2'` 直接赋值
  - 状态转换现在由状态机 exit condition 正确驱动
- **Bug #34: Phase 1 不生成 requirements.json** — 修复 Phase 1 文件生成逻辑
  - 修复后 Phase 1 正确生成 `assets/requirements.json`
  - 添加回归测试验证文件生成
- **Bug #35: 组装后章节数与大纲不一致** — 排除 TOC 标题计数
  - `src/assemble/finalizer.ts`: 使用负向 lookahead 排除 `## 目录`
  - `src/assemble/heading-checker.ts`: 跳过标题为 `目录` 的条目
- **Bug #36: 跨平台路径拼接** — 使用 path.join() 替代模板字符串
  - `src/state/store.ts`: 修复 Windows/Linux 路径分隔符问题
- **Issue #47-4: task.start 事件 round 字段硬编码为 1** — 从 state 读取 chapter.round
  - `src/scheduler/runner.ts`: 新增 `chapterRoundLookup` 参数，替代硬编码 `round: 1`
  - `src/index.ts`: 传入 lookup 函数从 `store.load()` 读取 chapter.round
  - 新增 spec SM-14 和回归测试 `tests/scheduler/runner-round-event.test.ts`

### Added
- 5 个新测试文件覆盖状态转换、章节计数、路径拼接
- 跨平台 E2E 测试脚本 `scripts/e2e-test-herdr.sh` (bash 版本)

### Changed
- E2E 测试计划 P1 问题全部修复
  - 命令签名与 SKILL.md 对齐
  - §5 章节编号修复 (4.x → 5.x)
  - 添加 compact/export 测试场景

## [0.21.2] - 2026-10-11
### Added
- **PR #32: DIAG 日志追踪 wordBudget 传递** — 添加文件级诊断日志，确保字数控制可追踪
  - `dispatcher/index.ts`: 写入 `logs/diag-wordbudget.json`，记录 wordBudget 读取和传递
  - `task-executor.ts`: 写入 `logs/diag-task-executor.json`，验证 wordBudget 到达 Writer prompt
  - `task-executor.ts`: 新增 `projectDir` 参数，支持日志文件写入
  - `index.ts`: 传递 `projectDir` 给 TaskExecutor 构造函数
- 15 个单元测试覆盖字数验证和 verdict 一致性检查

### Fixed
- **Bug #41: minChapterChars 与 wordBudget 矛盾导致字数超标 6x** — 统一字数配置，消除 prompt 自相矛盾
  - `config/loader.ts`: `minChapterChars` 默认值从 8000 改为 5000，与 `wordBudget.min` 一致
  - `task-executor.ts`: Writer/Fixer prompt 使用 `wordBudget.min` 而非 `minChapterChars`
  - `dispatcher/index.ts`: Fixer 增加 `wordBudget` 参数，修复循环也有字数上限约束
  - `knowledge/chapter-types/*.md`: 章节类型 YAML wordBudget 统一为 5200-7800
- **Bug #42: OutputValidator 不验证 Reviewer 的字数** — 增加独立字数验证和 verdict 一致性检查
  - `output-validator.ts`: `validateReviewerOutput` 增加 `wordBudget` 参数，独立验证字数上下限
  - `output-validator.ts`: 增加 verdict 一致性检查（issues 提到字数问题但 verdict=accept 时标记失败）
  - `state/schema.ts`: `ChapterState` 增加 `wordBudget` 字段
  - `index.ts`: 从 state 读取 wordBudget 传给验证器
- **Bug #43: E2E 测试计划配置模板格式错误** — 修正配置模板为嵌套格式
  - `scripts/E2E-TEST-PLAN.md`: 将扁平配置格式改为嵌套格式（`scheduler.maxConcurrency` 而非顶层 `maxConcurrency`）
- **Pi 加载错误扩展路径** — 修复 Pi 通过 `settings.json` 加载旧版本 confwrite 的问题
  - 更新 `/home/water/confwrite/` 为最新版本
  - 清理 `settings.json` 中的旧 tgz 引用
  - 确保 DIAG 日志正确生成
- **字数控制效果验证** — v8 E2E 测试证明字数控制从 3.5x 超限改善到目标范围内
  - 平均字数从 17,500 降至 4,800 字符/章
  - 超限章节从 100% 降至 0%
  - 总字数从 175,000 降至 48,000（目标 50,000）

## [0.21.1] - 2026-10-10
### Fixed
- **Bug 36: wordBudget 范围设计导致 LLM 超额写作** — 配置化 wordBudget，prompt 强调 target
  - `config/loader.ts`: 新增 `defaultWordBudget: { target, tolerance }` 配置项
  - `outline/generator.ts`: 从配置读取 wordBudget，消除硬编码 `{ min: 5000, max: 8000 }`
  - `task-executor.ts`: prompt 强调目标字数，弱化范围（"目标字数 X，允许范围 Y-Z"）
- **Bug 36.1: 验证失败被 Bug 32 绕过** — 区分失败类型，验证失败不被绕过
  - `writing/orchestrator.ts`: `updateChapterStatus` 新增 `failureType` 参数
  - `dispatcher/index.ts`: `processTask` 传递 `failureType`
  - `index.ts`: 验证失败时传递 `'validation_failed'`，防止被降级接受

### Added
- 2 个 orchestrator 测试覆盖 failureType 逻辑

## [0.21.0] - 2026-10-10
### Fixed
- **wordBudget 在 chapter-syncer 中丢失** — OutlineParser 不解析字数预算，chapter-syncer 创建章节时丢失元数据
  - `outline-parser.ts`: 解析 `字数预算: 5000-8000字`、`重要度: 3/5`、`写作风格: technical`
  - `chapter-syncer.ts`: 保留完整 OutlineNode，创建/更新章节时同步 wordBudget、importance、type、description、style
  - 修复 E2E 测试字数超标 2.4x 问题（Writer prompt 现在包含字数预算）

### Added
- 7 个 OutlineParser 测试覆盖 wordBudget、importance、style 解析
- 3 个 chapter-syncer 测试验证 wordBudget 同步

## [0.20.0] - 2026-10-10
### Fixed
- **字数超标 3.13x 问题** — wordBudget 未传递给 Writer/Reviewer prompt，OutputValidator 缺少上限检查
  - `dispatcher/index.ts`: 从 state 读取 wordBudget 并传递给 Writer/Reviewer prompt
  - `output-validator.ts`: 添加字数上限检查（`charCount <= wordBudget.max`）
  - `index.ts`: 验证调用时传递 wordBudget
  - `task-executor.ts`: 修改 `generateWriterPrompt` 签名，让 `expected` 可选

### Added
- 5 个单元测试覆盖字数上限检查逻辑
- 3 个 dispatcher 测试验证 wordBudget 传递

## [0.19.0] - 2026-10-09
### Added
- **D2: 章节类型说明** — 素材包写作指南中新增章节类型说明，从知识库 readingGuidance 读取
- **D3: 图表知识库输入** — 图表管线从知识库 frontmatter 加载配色和布局约束
- **D4: 领域知识精准匹配** — 移除宽松匹配，extractContext 生成有意义的 metrics key，LLM 提取中文术语

### Changed
- OutlineParser 从 description 提取 type 字段
- BaselineExtractor.extract() 改为 async，支持 LLM 中文术语提取
- loadDiagramStyle() 增加知识库查询（优先级：JSON > 知识库 > 默认值）
- validateDiagram() 接受可选约束参数
- 10 个 chapter-types 知识库文件添加 writingGuidance 和 fallbackCategories
- 2 个 diagrams 知识库文件添加 diagramConfig

### Fixed
- 移除 kit-generator.ts 中的宽松匹配逻辑（2字符重叠匹配）
- extractContext 生成的 metrics key 从乱码变为有意义的标签（≤15字符）

## [0.18.4] - 2026-10-09
### Fixed
- 修复 pi TUI 中 extension 显示为 `dist` 而非包名的问题（#7）
  - `pi.extensions` 路径从 `"dist/index.js"` 改为 `"./dist/index.js"`

## [0.18.3] - 2026-10-09
### Added
- 演示 auto-merge 流程

## [0.18.2] - 2026-10-09
### Changed
- 项目结构清理：按 AGENTS.md v2.0 规范删除临时文件、远程项目产物
- 重写 AGENTS.md v2.0：新增文件组织/版本号/文档分类规范

## [0.18.0] - 2026-10-09
### Added
- LLM 驱动的大纲规划器（LLMPlanner）
- 回退链：LLMPlanner → AdaptiveOutlinePlanner → 模板
- 中文数字格式标题解析支持（一、二、三 → Level 1）

## [0.17.0] - 2026-10-09
### Added
- LLMPlanner 骨架实现
- eastE 项目验证

## [0.16.0] - 2026-10-09
### Added
- 素材包 fallback 改进：无关键词匹配时使用通用参考资料

## [0.15.0] - 2026-10-09
### Added
- 字数控制三层防御：预防（prompt 硬限制）+ 检测（写后检查）+ 兜底（Reviewer 检查）

## [0.14.0] - 2026-10-09
### Added
- 素材包改进：大纲作为信息枢纽，requirementSource 追溯
- 需求映射器（RequirementMapper）

## [0.13.0] - 2026-10-08

### Added
- **大纲生成工具**：完整的文档大纲自动生成系统
  - Phase 1: 需求提取（RequirementExtractor）
  - Phase 2: 大纲规划（OutlineGenerator）
  - /confwrite:outline 命令
- **知识库系统**：
  - 章节类型知识库（7种默认类型 + 3种自定义扩展）
  - 大纲模板知识库（技术方案、投标文档）
  - 需求分类知识库（6个分类）
- **篇幅控制**：
  - 字数预算系统（规划参考）
  - 软门控逻辑（可配置容差）
  - 篇幅统计与报告（WordCountAnalyzer）
- **需求追溯**：
  - 需求标记机制（RequirementMarker）
  - 需求追溯工具（RequirementTracer）
  - 需求覆盖检查
- **上下文注入**：
  - KitGenerator支持注入前后章节大纲
  - Writer prompt中增加字数预算参考
- **配置扩展**：
  - 新增 minChapterCharsTolerance 配置项
  - 支持软门控容差配置

### Changed
- ChapterState schema 扩展：新增 type/wordBudget/importance/description/style 字段
- OutputValidator 实现软门控逻辑
- TaskExecutor 支持字数预算参考

### Fixed
- 需求提取完整性检查
- 大纲生成时的需求分配逻辑
- 字数预算与门控的协调

### Technical Details
- 新增 15 个核心模块
- 新增 100+ 个测试用例
- 总测试数：1200+ passed（持续增长中）
- 严格遵循 TDD 开发流程

## [0.12.1] - 2026-09-27

### Changed
- Documentation cleanup: removed 10 outdated/redundant markdown files
- Updated README.md project stats and structure tree
- Updated SKILL.md to reflect structured diagram format (replaced mermaid references)
- Updated DESIGN.md to v0.12.1 with current module listing

## [0.12.0] - 2026-09-26

### Fixed
- **Bug 50**: Reviewer prompt now uses absolute path for review report output
  - Added `projectDir` parameter to `generateReviewerPrompt()`
  - Updated dispatcher to pass project directory
  - Prevents review reports being written to wrong location when subagents change working directory
- **Bug 51**: Fixer now increments `chapter.round` after successful fix
  - Ensures `maxRounds` guard can terminate revise loops
  - Prevents potential infinite review-fix cycles

### Added
- 6 new tests for Bug 50/51 fixes

## [0.11.0] - 2026-09-25

### Fixed
- Command path resolution for `/confwrite:organize`, `/confwrite:write`, `/confwrite:status`, `/confwrite:resume`
- All slash commands now correctly resolve project paths using `resolve(ctx.cwd, 'projects', args)`

## [0.10.0] - 2026-09-24

### Fixed
- Path resolution for pi packages relative paths
- `.pi/settings.json` paths now correctly resolved relative to `.pi/` directory

## [0.9.0] - 2026-09-20

### Added
- Complete diagram layout engine rewrite
- Container spacing (29px) for better visual separation
- Canvas auto-expansion to fit all containers
- Edge label collision detection with descender padding

### Fixed
- Container left-boundary overflow
- Back-edge direction handling
- Container label avoidance

## [0.8.0] - 2026-09-20

### Added
- Multi-level list styles in Word export
- Cross-platform font fallback with `<w:altName>`
- JSZip-based docx processing (replaces unzip/zip CLI)

### Fixed
- All bugs blocking accurate diagrams + complete Word export

## [0.7.3] - 2024-09-10

### Fixed
- Cross-platform shell tool selection
- Material kit missing file paths
- Writer not knowing material file location

## [0.7.0] - 2024-09-05

### Added
- Prompt responsibility separation
- Tool least-privilege + turn hard budget
- Sub-agent loop control

## [0.6.0] - 2024-08-28

### Added
- Structured diagram format (containers/nodes/edges)
- Mermaid deprecation

## [0.5.0] - 2024-08-20

### Added
- Writing orchestrator with review-fix loops
- Output validator
- Loop detector

## [0.4.0] - 2024-08-15

### Added
- Material kit generation
- Baseline extraction
- Chapter sync

## [0.3.0] - 2024-08-10

### Added
- PDF/DOCX/HTML to Markdown conversion
- Reference material scanning

## [0.2.0] - 2024-08-05

### Added
- Project initialization
- State machine
- Phase orchestration

## [0.1.0] - 2024-08-01

### Added
- Initial release
- Basic document generation pipeline
