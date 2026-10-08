# Changelog

All notable changes to this project will be documented in this file.

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
- 总测试数：1128 passed, 12 skipped
- 严格遵循 TDD 开发流程

## [0.12.1] - 2026-09-28

### Changed
- Documentation cleanup: removed 10 outdated/redundant markdown files
- Updated README.md project stats and structure tree
- Updated SKILL.md to reflect structured diagram format (replaced mermaid references)
- Updated DESIGN.md to v0.12.1 with current module listing

## [0.12.0] - 2024-09-26

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

## [0.11.0] - 2024-09-25

### Fixed
- Command path resolution for `/confwrite:organize`, `/confwrite:write`, `/confwrite:status`, `/confwrite:resume`
- All slash commands now correctly resolve project paths using `resolve(ctx.cwd, 'projects', args)`

## [0.10.0] - 2024-09-24

### Fixed
- Path resolution for pi packages relative paths
- `.pi/settings.json` paths now correctly resolved relative to `.pi/` directory

## [0.9.0] - 2024-09-20

### Added
- Complete diagram layout engine rewrite
- Container spacing (29px) for better visual separation
- Canvas auto-expansion to fit all containers
- Edge label collision detection with descender padding

### Fixed
- Container left-boundary overflow
- Back-edge direction handling
- Container label avoidance

## [0.8.0] - 2024-09-15

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
