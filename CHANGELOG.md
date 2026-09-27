# Changelog

All notable changes to this project will be documented in this file.

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
