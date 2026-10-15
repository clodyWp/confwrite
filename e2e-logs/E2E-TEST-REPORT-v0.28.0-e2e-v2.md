# E2E Test Report - v0.28.0 (e2e-v2)

**Test Date**: 2026-10-14
**Test Project**: e2e-v2 (航空发动机离散制造ERP系统技术方案)
**ConfWrite Version**: 0.28.0
**Dataset**: LMERP2V2-v10 (167 Markdown files, 20 topic folders)
**Remote Machine**: water-ali (8.160.160.85)

## Summary

| Metric | Value |
|--------|-------|
| **Status** | ❌ Fail (Core workflow broken) |
| **Duration** | ~25 minutes |
| **Chapters** | 12 |
| **Final Word Count** | 57,284 chars / 31,193 words |
| **Tables** | 185 |
| **Final Phase** | done |
| **Output File** | output/final.docx |

## Critical Issue Found

### ISSUE-001: `/confwrite:write` Command Fails to Start Writing Pipeline

**Severity**: 🔴 Critical  
**Category**: State Machine / Command Execution  
**Description**: The `/confwrite:write` command consistently fails with error "未找到项目状态文件，请先运行 /confwrite:init" even though `project-state.json` exists and `/confwrite:status` works correctly.

**Symptoms**:
1. `/confwrite:status` successfully reads project state (shows Phase 2, 12 chapters)
2. `/confwrite:write` fails with "未找到项目状态文件"
3. Remote pi falls back to manual chapter writing instead of using ConfWrite state machine

**Evidence**:
```
# Remote pi output showing the error:
$ /confwrite:write
Error: 未找到项目状态文件，请先运行 /confwrite:init

# But project-state.json exists:
$ ls -la project-state.json
-rw-rw-r-- 1 water water 5324 Oct 14 23:13 project-state.json

# And /confwrite:status works:
$ /confwrite:status
📊 项目状态：e2e-v2
阶段: Phase 2 (outlined)
章节数: 12章（全部 pending）
```

**Impact**: 
- Write-Review-Fix cycle completely bypassed
- No task scheduling, no reviewer/fixer subagents
- No execution logs generated
- Core value proposition of ConfWrite (automated writing pipeline) not delivered

**Root Cause Analysis**:
The `/confwrite:write` command uses this path resolution logic:
```javascript
const workspaceDir = ctx.cwd || process.cwd();
const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
```

When remote pi runs `/confwrite:write` without args:
1. `ctx.cwd` = `/home/water/proj/c4` (remote pi's working directory)
2. `projectDir` = `/home/water/proj/c4` (no args provided)
3. But `project-state.json` is at `/home/water/proj/c4/projects/e2e-v2/project-state.json`
4. Result: State file not found

**This is NOT a code bug** — it's a usage issue. The correct usage is:
- `/confwrite:write e2e-v2` (provide project slug), OR
- `cd /home/water/proj/c4/projects/e2e-v2 && /confwrite:write` (cd to project dir first)

The remote pi (qwen3.7-plus) did not follow this pattern and fell back to manual writing.

**Workaround Used**: Remote pi manually wrote all 12 chapters and called ConfWrite APIs directly for assembly/finalization/export.

## Verification Scope

### Pending PRs (Since Last E2E v0.28.0)

| PR | Title | Change | Verification Method | Status |
|----|-------|--------|--------------------|--------|
| #118 | fix: 实现 SM-WC-3 解决字数统计不一致问题 | Writer/Reviewer word count unification | ⚠️ Cannot verify - write pipeline not triggered | Blocked by ISSUE-001 |

### Known Issues Regression Check

| Issue ID | Description | Status in Last E2E | Current Status | Notes |
|----------|-------------|-------------------|----------------|-------|
| TRUNCATION-001 (#116) | 自动截断仍在工作 | Fixed in #118 | ⚠️ Cannot verify | Write pipeline not triggered |
| WORDCOUNT-001 | 字数统计方法不一致 | Fixed in #118 | ⚠️ Cannot verify | Write pipeline not triggered |
| OUTLINE-001 (#114) | 大纲生成质量差 | Open | ✅ Improved | 12 chapters with proper types (overview/requirements/architecture/functional/implementation/support/appendix) |
| DOCX-001 (#115) | DOCX 转换时 HTML 实体未解码 | Open | ⚠️ Not tested | Export completed but content quality not verified |

## Phase Transitions

| Phase | Started | Completed | Duration | Notes |
|-------|---------|-----------|----------|-------|
| 0a (Init) | 23:08 | 23:09 | ~1 min | Manual init by remote pi (directory already existed) |
| 0b (Organize) | 23:09 | 23:10 | ~1 min | ✅ 167 files indexed |
| 1-2 (Outline) | 23:10 | 23:13 | ~3 min | ✅ 12 chapters generated |
| 4a (Write) | 23:13 | 23:27 | ~14 min | ❌ Manual writing, not via ConfWrite pipeline |
| 5 (Diagrams) | - | - | - | ⚠️ Skipped (no structured diagrams extracted) |
| 6 (Assemble) | 23:27 | 23:28 | ~1 min | ✅ Used ConfWrite API directly |
| 7 (Finalize) | 23:28 | 23:29 | ~1 min | ✅ Used ConfWrite API directly |
| 8 (Export) | 23:29 | 23:29 | <1 min | ✅ DOCX exported successfully |

## Document Quality

### Finalization Report

```json
{
  "characters": 57284,
  "words": 31193,
  "headings": 205,
  "tables": 185,
  "codeBlocks": 14,
  "images": 0,
  "links": 12
}
```

### Baseline Consistency

- **Matches**: 227 data points found in document
- **Missing**: ~280 data points (parsing issues with formatted data)
- **Term Consistency**: warning

### Chapter Structure

| # | Title | Type | Status |
|---|-------|------|--------|
| 1 | 项目概述与需求分析 | overview | ✅ completed |
| 2 | 系统需求规格说明 | requirements | ✅ completed |
| 3 | 系统架构设计 | architecture | ✅ completed |
| 4 | 生产制造与MBOM管理 | functional | ✅ completed |
| 5 | 供应链与物流管理 | functional | ✅ completed |
| 6 | 财经与资产管理 | functional | ✅ completed |
| 7 | 数据治理与流程引擎 | functional | ✅ completed |
| 8 | AI应用与智能化管理 | functional | ✅ completed |
| 9 | 安全保密与电子档案 | functional | ✅ completed |
| 10 | 项目实施与运维保障 | implementation | ✅ completed |
| 11 | 行业特性与最佳实践 | support | ✅ completed |
| 12 | 附录 | appendix | ✅ completed |

## Issues Summary

| ID | Severity | Category | Description | GitHub Issue |
|----|----------|----------|-------------|--------------|
| ISSUE-001 | 🔴 Critical | State Machine | `/confwrite:write` fails to find project state | To be created |
| ISSUE-002 | 🟡 Medium | Diagrams | No diagrams generated (Phase 5 skipped) | Related to ISSUE-001 |
| ISSUE-003 | 🟢 Low | Baseline | Baseline consistency parsing issues | Existing |

## Recommendations

1. **Immediate**: Investigate and fix ISSUE-001 - the `/confwrite:write` command path resolution
2. **Short-term**: Add integration tests that verify command execution in different working directories
3. **Medium-term**: Consider adding fallback mechanisms when state machine commands fail
4. **Testing**: Re-run E2E test after ISSUE-001 is fixed to verify PR #118 fixes

## Environment Details

### Remote Machine
- **Host**: water-ali (8.160.160.85)
- **OS**: Linux
- **Node.js**: v22.22.1
- **npm**: 9.2.0
- **ConfWrite**: 0.28.0 (local tarball install)
- **Model**: qwen3.7-plus

### Project Structure
```
/home/water/proj/c4/projects/e2e-v2/
├── assets/
│   ├── chapter-kits/ (12 files)
│   ├── data-baseline.json
│   ├── indexes/
│   └── requirements.json
├── drafts/chapters/ (12 files)
├── knowledge/
├── output/
│   ├── final.md
│   ├── final.docx
│   └── finalization.json
├── reference_material/ (20 folders, 167 files)
├── outline.md
└── project-state.json
```

---

**Report Generated**: 2026-10-14T23:35:00Z  
**Generated By**: Local pi (Windows) analyzing remote pi (water-ali) logs
