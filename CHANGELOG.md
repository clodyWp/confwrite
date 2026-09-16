# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Implement Dispatcher layer (connects state machine → subagent scheduler → pi subagent API)
- Integrate real PDF/DOCX conversion (mammoth, pdf-parse)
- Implement Phase 4c (decision) complete logic
- Implement Phase 5 (diagram generation)
- Implement Phase 7 (finalization) complete logic
- Auto-sync outline.md chapters → project-state.json

## [0.1.0] - 2025-01-15

### Added

#### Phase A: State Management & Infrastructure (48 tests)
- **TypeBox schema** (`src/state/schema.ts`)
  - ProjectState, ChapterState, SubagentTask type definitions
  - Phase enum (0a/0b/1/2/3/4a/4b/4c/4d/5/6/7/8/done)
  - ChapterStatus enum (pending→writing→written→reviewing→reviewed→fixing→fixed→completed/failed/skipped)
  - TaskStatus enum (queued→running→completed/failed/retrying/interrupted/blocked)
  - TaskType enum (writer/reviewer/fixer/researcher/planner/diagram)
- **Atomic JSON persistence** (`src/state/store.ts`)
  - Write-to-temp → rename pattern for crash safety
  - Type-safe load/save with schema validation
- **Path safety utilities** (`src/utils/paths.ts`)
  - Slug validation (alphanumeric + hyphens only)
  - Chapter ID validation (ch001-ch999)
  - Path traversal protection (safePath, isWithinPath)
- **Phase definitions** (`src/orchestrator/phases.ts`)
  - 14 declarative phase definitions
  - Each phase: validate() + execute() + exits[]
  - Helper functions: hasFile(), hasOrganizedMaterials(), needsFix(), needsRewrite()
- **Deterministic state machine** (`src/orchestrator/state-machine.ts`)
  - tick() method: load → validate → check exits → execute → return action
  - Phase advancement with execution log
  - Status mapping (phase → project status)
- **Init command** (`src/commands/init.ts`)
  - Creates project directory structure
  - Initializes project-state.json
  - Generates agent-instructions.md template
  - Optional: copy materials from source directory

#### Phase B: Scheduler System (50 tests)
- **Token bucket** (`src/scheduler/token-bucket.ts`)
  - Rate limiting for subagent API calls
  - Configurable capacity (default: 10) and refill rate (default: 0.5/s)
  - waitForToken() with timeout
  - Serializable state for persistence
- **Priority queue** (`src/scheduler/priority-queue.ts`)
  - Min-heap implementation
  - Sort by priority ASC, then sequence ASC (FIFO guarantee)
  - Serializable state for persistence
- **Retry engine** (`src/scheduler/retry.ts`)
  - Exponential backoff with jitter
  - Configurable: baseDelay (5s), multiplier (2x), maxDelay (60s), maxRetries (3)
  - Delay formula: min(baseDelay * multiplier^attempt, maxDelay) + random(0, delay * 0.5)
- **Subagent scheduler** (`src/scheduler/index.ts`)
  - Task submission and queue management
  - Dependency checking (getReadyTasks)
  - Pause/resume functionality
  - Statistics tracking
  - Serializable state for persistence

#### Phase C: Material Organization System (78 tests)
- **Outline parser** (`src/organize/outline-parser.ts`)
  - Parses Markdown outline with heading levels
  - Identifies `chXXX` markers (ch001-ch999)
  - Builds hierarchical OutlineNode tree
  - findChapter() and getAllChapters() methods
- **Material scanner** (`src/organize/scanner.ts`)
  - Recursive directory scanning
  - Auto-classification by directory name and filename
  - Metadata extraction (title, keywords, summary)
  - Supports MD/PDF/DOCX/HTML formats
- **Format converter** (`src/organize/converter.ts`)
  - HTML → Markdown conversion
  - PDF/DOCX → Markdown (stub implementation, needs real integration)
- **Index generator** (`src/organize/indexer.ts`)
  - JSON index generation from scanned materials
  - Per-category index files
  - Keyword extraction and search functionality
- **Baseline extractor** (`src/organize/baseline-extractor.ts`)
  - Extracts metrics (percentages, numbers with units)
  - Extracts timeline (dates)
  - Extracts technical terms (English capitalized words)
  - Extracts requirements (Chinese keywords: 必须/需要/支持)
  - Validation of baseline structure
- **Chapter mapper** (`src/organize/chapter-mapper.ts`)
  - Maps chapters to related files
  - Strategy 1: keyword matching
  - Strategy 2: category matching
  - Strategy 3: fallback (assign first 3 files)
  - Human-readable summary generation
- **Kit generator** (`src/organize/kit-generator.ts`)
  - Generates chapter kit Markdown files
  - Includes: chapter info, related files, key data, technical terms, requirements, writing tips
  - Batch generation with statistics
- **Organize command** (`src/commands/organize.ts`)
  - Full pipeline: scan → convert → index → extract baseline → parse outline → map chapters → generate kits
  - Generates references-index.md (human-readable)
- **E2E test** (`tests/e2e/organize-pipeline.test.ts`)
  - Full init → add materials → organize pipeline
  - Verifies all generated files and content

#### Phase D: Writing Pipeline (33 tests)
- **Task executor** (`src/writing/task-executor.ts`)
  - generateWriterPrompt(): builds Writer subagent prompt from chapter kit
  - generateReviewerPrompt(): builds Reviewer subagent prompt from chapter draft + baseline
  - generateFixPrompt(): builds Fixer subagent prompt from chapter draft + review feedback
  - parseReviewDecision(): extracts accept/reject/revise from review output
- **Writing orchestrator** (`src/writing/orchestrator.ts`)
  - generateWritingTasks(): creates writer tasks for pending chapters
  - generateReviewTasks(): creates reviewer tasks for written chapters
  - generateFixTasks(): creates fixer tasks for reviewed chapters
  - updateChapterStatus(): updates chapter state after task completion
  - isWritingPhaseComplete(): checks if all chapters are completed
  - getNextAction(): returns next action (write/review/fix/complete)

#### Phase E: Assembly & Export (34 tests)
- **Chapter assembler** (`src/assemble/assembler.ts`)
  - Assembles chapters in specified order
  - Optional: document title, table of contents, page breaks
  - Statistics: total chapters, characters, words
  - Handles missing chapters gracefully (warnings)
  - listChapters(): lists available chapter files
- **Format converter** (`src/assemble/converter.ts`)
  - Built-in Markdown → HTML conversion (regex-based)
  - HTML document wrapping with optional CSS styles
  - Pandoc command generation for DOCX/PDF export
  - Dependency checking (pandoc version)
- **Export command** (`src/commands/export.ts`)
  - Exports assembled document to MD/HTML/DOCX/PDF
  - Reads chapter order from outline.md
  - Optional: title, TOC, dry-run mode
  - Statistics in result

#### Extension Entry Point
- **Pi extension** (`src/index.ts`)
  - Registers 6 commands:
    - `/confwrite:init` — Initialize project
    - `/confwrite:organize` — Organize materials
    - `/confwrite:write` — Advance writing workflow (state machine tick)
    - `/confwrite:status` — Show project progress
    - `/confwrite:resume` — Resume interrupted project
    - `/confwrite:export` — Export document

#### Documentation
- README.md — Project overview and quick start
- ARCHITECTURE.md — Architecture design document
- USAGE.md — Detailed usage guide (1004 lines)
- DESIGN.md — Detailed design document (1170 lines)
- SKILL.md — Pi skill definition

### Known Issues
- **Dispatcher layer not implemented**: `/confwrite:write` only displays action JSON, does not actually spawn subagents
- **PDF/DOCX conversion is stub**: Only HTML conversion works, PDF/DOCX need real integration
- **Chapter sync not automatic**: outline.md changes are not auto-synced to project-state.json
- **HTML converter is basic**: Built-in MD→HTML uses simple regex, does not support all Markdown syntax

### Statistics
- Source files: 25 files, 4663 lines
- Test files: 22 files, 3943 lines, 247 tests
- All tests passing
- TypeScript compilation: zero errors
- Total development time: ~1 day (with pi coding agent assistance)

[Unreleased]: https://github.com/your-org/confwrite/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/confwrite/releases/tag/v0.1.0
