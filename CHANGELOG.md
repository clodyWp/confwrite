# Changelog

All notable changes to this project will be documented in this file.

## [0.21.2] - 2026-10-10
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

### Added
- 15 个单元测试覆盖字数验证和 verdict 一致性检查

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
