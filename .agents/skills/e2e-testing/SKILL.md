---
name: e2e-testing
description: End-to-end testing for ConfWrite projects. Use when the user wants to run a full E2E test, verify the complete workflow, or test a specific project on a remote machine.
---

# E2E Testing for ConfWrite

A discipline for running end-to-end tests on ConfWrite projects. This skill covers the complete workflow from initialization to final export.

## When to Use

- Testing a new version after major changes
- Verifying bug fixes don't break the workflow
- Testing with real-world project data
- Regression testing before release

## Prerequisites

- Remote machine with pi installed
- Herdr configured for remote access
- Test project materials ready
- ConfWrite package installed on remote machine

---

## Phase -1: Determine Verification Scope

**Purpose**: Identify which PRs need to be verified in this E2E test.

### -1.1 Read Last E2E State

```bash
# Read tracking file
cat e2e-regression/last-e2e-state.json
```

**Expected content**:
```json
{
  "version": "v0.24.0",
  "commit": "962f09c",
  "timestamp": "2026-10-13T05:00:00Z",
  "verifiedPRs": ["#63", "#65", "#66"],
  "projectDir": "/home/water/proj/c4/projects/e2e-v24"
}
```

### -1.2 Get Pending PRs

```bash
# Get PRs merged since last E2E test
bash e2e-regression/scripts/get-pending-prs.sh
```

**Output example**:
```
上次 E2E 测试: v0.24.0 (962f09c) @ 2026-10-13T05:00:00Z

待验证 PR 数量: 2
[
  {"number": 68, "title": "字数控制策略改进", "mergedAt": "2026-10-13T07:47:36Z"},
  {"number": 69, "title": "E2E skill 增加验证范围追踪", "mergedAt": "2026-10-13T08:00:00Z"}
]
```

### -1.3 Define Verification Goals

Based on the pending PRs and previous issues, define what needs to be verified:

```markdown
## 本次 E2E 验证目标

### 待验证的 PR（自上次 E2E 以来）

| PR | Title | Change | Verification Method |
|----|-------|--------|--------------------|
| #68 | 字数控制策略改进 | Reviewer/Fixer prompt | 检查字数是否在上限范围内 |
| #69 | E2E skill 增加验证范围追踪 | Tracking mechanism | 追踪文件是否正确更新 |

### 已知问题回归检查

| Issue ID | Description | Status in Last E2E | Check Method |
|----------|-------------|-------------------|--------------|
| WORD-COUNT-001 | 所有章节超出字数上限 39%-84% | Fixed in #68 | 检查最终字数是否在预算范围内 |

### 验证成功标准
- [ ] 所有待验证 PR 的改动被测试覆盖
- [ ] 已知问题没有复现
- [ ] 完整流程正常完成
```

### -1.4 Verification Scope Checklist

- [ ] Last E2E state file exists and is readable
- [ ] Pending PRs list generated
- [ ] Verification goals defined for each PR
- [ ] Test dataset selected (covers PR changes)

---

## Phase 0: Test Integrity Verification

**CRITICAL**: Before starting any E2E test, verify that the remote pi is NOT analyzing ConfWrite source code. If it does, the test is invalid because pi may "work around" bugs instead of triggering them.

### 0.1 Detect Source Code Analysis

**Detection Methods**:

1. **Monitor subagent tool calls** for suspicious patterns:
   ```bash
   # Check if subagent reads ConfWrite source files
   ssh <remote-host> "grep -r 'node_modules/confwrite' <project-dir>/logs/subagent-*.log"
   ssh <remote-host> "grep -r 'src/writing' <project-dir>/logs/subagent-*.log"
   ssh <remote-host> "grep -r 'src/orchestrator' <project-dir>/logs/subagent-*.log"
   ```

2. **Check for code reading patterns**:
   ```bash
   # Look for read commands targeting ConfWrite internals
   ssh <remote-host> "grep -E 'read.*confwrite|read.*src/|read.*orchestrator' <project-dir>/logs/subagent-*.log"
   ```

3. **Monitor bash commands** for code exploration:
   ```bash
   # Check if subagent explores ConfWrite structure
   ssh <remote-host> "grep -E 'ls.*confwrite|find.*confwrite|cat.*confwrite' <project-dir>/logs/subagent-*.log"
   ```

### 0.2 Integrity Check Checklist

- [ ] No subagent reads `node_modules/confwrite/src/*`
- [ ] No subagent reads `node_modules/confwrite/dist/*`
- [ ] No subagent reads `node_modules/confwrite/package.json`
- [ ] No bash commands explore ConfWrite directory structure
- [ ] Subagent only reads project files (assets/, drafts/, review/)

### 0.3 If Integrity Violated

**STOP THE TEST IMMEDIATELY**. The test is invalid because:
- Pi may have learned how to bypass bugs
- Pi may have modified its behavior based on code analysis
- Results cannot be trusted

**Recovery Steps**:
1. Stop the remote pi session
2. Clean the project directory
3. Restart with fresh state
4. Ensure subagent prompts don't reference ConfWrite internals

---

## Phase 1: Prepare Test Environment

### 1.1 Select Test Project

Choose a test project based on the testing goal:

- **Simple project**: 3-5 chapters, basic structure (quick smoke test)
- **Medium project**: 5-10 chapters, mixed content types (standard E2E)
- **Complex project**: 10+ chapters, diagrams, tables (stress test)

### 1.2 Setup Remote Environment

```bash
# Connect to remote machine via herdr
herdr --machine <machine-label>

# Verify remote environment
ssh <remote-host> "node --version && npm --version"

# Check ConfWrite version
ssh <remote-host> "cd <project-dir> && npm list confwrite"
```

### 1.3 Initialize Project Directory

```bash
# Create project directory
ssh <remote-host> "mkdir -p <project-dir>"

# Copy test materials
ssh <remote-host> "cp -r <materials-source>/* <project-dir>/assets/"

# Initialize ConfWrite project
# (via remote pi or direct command)
```

### 1.4 Verify Setup

Checklist:
- [ ] Remote machine accessible via herdr
- [ ] ConfWrite version matches expected
- [ ] Test materials copied to assets/
- [ ] Project directory structure correct

---

## Phase 2: Real-Time Monitoring & Log Analysis

### 2.1 Multi-Layer Log Monitoring

**Three log sources must be monitored simultaneously**:

1. **Main agent TUI** (via herdr):
   ```bash
   herdr --machine <machine-label> pane read <pane-id> --source recent-unwrapped --lines 50
   ```

2. **Project event log** (JSONL):
   ```bash
   # Real-time event stream
   ssh <remote-host> "tail -f <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type | test(\"task\\.|chapter\\.|phase\\.\")) | \"\(.timestamp) | \(.event.type) | \(.event.taskId // \"\") | \(.event.chapterId // \"\") | \(.event.from // \"\") → \(.event.to // \"\")\"'"
   ```

3. **Subagent logs** (per-task):
   ```bash
   # List active subagent logs
   ssh <remote-host> "ls -lt <project-dir>/logs/subagent-*.log | head -10"
   
   # Monitor specific subagent
   ssh <remote-host> "tail -f <project-dir>/logs/subagent-<task-id>.log"
   ```

### 2.2 Correlation Analysis

**Link events across log sources**:

```bash
# Extract task lifecycle from JSONL
ssh <remote-host> "cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.taskId != null) | \"\(.timestamp) | \(.event.type) | \(.event.taskId) | \(.event.chapterId // \"\")\"' | sort"

# Cross-reference with subagent logs
ssh <remote-host> "for log in <project-dir>/logs/subagent-*.log; do echo \"=== \$(basename \$log) ===\"; head -5 \$log; tail -5 \$log; done"
```

### 2.3 Anomaly Detection

**Watch for these anomalies**:

| Anomaly | Detection Command | Severity |
|---------|------------------|----------|
| Phase stuck | `tail -100 confwrite-log.jsonl \| jq 'select(.event.type == "phase.transition")' \| tail -1` | High |
| Task timeout | `grep "Turn #" subagent-*.log \| tail -20` | Medium |
| Validation failures | `grep "validation_failed" confwrite-log.jsonl` | Medium |
| State inconsistency | `cat project-state.json \| jq '.chapters \| to_entries \| map(select(.value.status == "reviewed"))'` | High |
| Subagent code reading | `grep -r "node_modules/confwrite" subagent-*.log` | Critical |

### 2.4 Real-Time Dashboard

**Create a monitoring loop**:

```bash
# Every 30 seconds, check:
while true; do
  clear
  echo "=== Project State ==="
  ssh <remote-host> "cat <project-dir>/project-state.json | jq '{phase: .currentPhase, status: .status, chapters: (.chapters | to_entries | group_by(.value.status) | map({status: .[0].value.status, count: length, ids: [.[].key]}))}'"
  
  echo -e "\n=== Recent Events (last 10) ==="
  ssh <remote-host> "tail -20 <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type | test(\"task\\.|chapter\\.|phase\\.\")) | \"\(.timestamp[11:19]) | \(.event.type) | \(.event.taskId // .event.chapterId // \"\") | \(.event.from // \"\")\(.event.to // \"\")\"' | tail -10"
  
  echo -e "\n=== Active Subagents ==="
  ssh <remote-host> "ls -lt <project-dir>/logs/subagent-*.log 2>/dev/null | head -5"
  
  sleep 30
done
```

---

## Phase 3: Run Workflow

### 3.1 Phase 0: Initialization

```bash
# Run /confwrite:init
# Verify: project-state.json created, status = 'init'
```

**Verification**:
- [ ] `project-state.json` exists
- [ ] `currentPhase` = '0a'
- [ ] `status` = 'init'

### 3.2 Phase 0b: Material Organization

```bash
# Run /confwrite:organize
# Verify: assets/index.json created, categories populated
```

**Verification**:
- [ ] `assets/index.json` exists
- [ ] Categories populated (not empty)
- [ ] `currentPhase` transitions to '1'

### 3.3 Phase 1: Requirements Analysis

```bash
# Automatic after organize
# Verify: assets/requirements.json created
```

**Verification**:
- [ ] `assets/requirements.json` exists
- [ ] Requirements populated
- [ ] `currentPhase` transitions to '2'

### 3.4 Phase 2: Outline Generation

```bash
# Run /confwrite:outline
# Verify: outline.md created, chapters defined
```

**Verification**:
- [ ] `outline.md` exists
- [ ] Chapters defined in `project-state.json`
- [ ] `currentPhase` = '2' (waitPoint: user confirmation)
- [ ] Word budget calculated for each chapter

### 3.5 Phase 3: Material Preparation (Optional)

```bash
# Automatic if materials don't match outline
# Verify: chapter-kits created
```

**Verification**:
- [ ] `assets/chapter-kits/` directory exists
- [ ] One kit per chapter
- [ ] `currentPhase` transitions to '4a'

### 3.6 Phase 4: Writing Cycle

This is the core phase. Monitor progress closely.

```bash
# Run /confwrite:write
# Monitor: check status every 30-60 seconds
```

**Monitoring Checklist** (every 30-60s):
- [ ] Check `project-state.json` for current phase
- [ ] Check `logs/confwrite-log.jsonl` for recent events
- [ ] Check subagent logs for errors
- [ ] Verify chapter statuses are progressing

**Phase 4a: Writing**
- [ ] Writer tasks created
- [ ] Chapters transition: `pending` → `written`
- [ ] Draft files created in `drafts/chapters/`

**Phase 4b: Review**
- [ ] Reviewer tasks created
- [ ] Chapters transition: `written` → `reviewed`
- [ ] Review reports created in `review/`

**Phase 4c: Decision**
- [ ] Decision made for each chapter
- [ ] Chapters marked as `completed`, `pending` (rewrite), or `reviewed` (fix)

**Phase 4d: Fixing** (if needed)
- [ ] Fixer tasks created
- [ ] Chapters transition: `reviewed` → `written` (for re-review)
- [ ] Updated drafts created

**Cycle Completion**:
- [ ] All chapters reach `completed` status
- [ ] `currentPhase` transitions to '5'

### 3.7 Phase 5: Diagram Generation

```bash
# Automatic after diagrams
# Verify: figures created
```

**Verification**:
- [ ] `figures/manifest.json` exists
- [ ] Diagram files created (if any)
- [ ] `currentPhase` transitions to '6'

### 3.8 Phase 6: Assembly

```bash
# Automatic after diagrams
# Verify: merged document created
```

**Verification**:
- [ ] `assembly/merged-v1.md` exists
- [ ] Document size reasonable (not empty)
- [ ] `currentPhase` = '6' (waitPoint: user review)

### 3.9 Phase 7-8: Finalization & Export (Optional)

```bash
# Run /confwrite:write to continue
# Verify: final document exported
```

**Verification**:
- [ ] `output/final.docx` exists (if export requested)
- [ ] `currentPhase` = 'done'

---

## Phase 4: Regression Data Source

### 4.1 LMERP-Based Regression Suite

**Purpose**: Provide a standardized test dataset that covers all paragraph types and ensures consistent regression testing.

**Data Structure**:

```
e2e-regression/
├── datasets/
│   ├── minimal/          # 3 chapters, basic types
│   │   ├── assets/
│   │   ├── config.json
│   │   └── expected/
│   ├── standard/         # 5-7 chapters, mixed types
│   │   ├── assets/
│   │   ├── config.json
│   │   └── expected/
│   └── full/             # 10+ chapters, all types
│       ├── assets/
│       ├── config.json
│       └── expected/
├── validators/
│   ├── chapter-types.sh  # Verify all chapter types covered
│   ├── word-count.sh     # Verify word budgets
│   └── phase-flow.sh     # Verify phase transitions
└── baselines/
    ├── lmerp-v9/         # Extracted from LMERP2V2-v9
    └── synthetic/        # Generated test cases
```

### 4.2 Chapter Type Coverage

**Required chapter types** (from LMERP analysis):

| Type | Description | Test Dataset |
|------|-------------|--------------|
| `functional` | System functions, features | minimal, standard, full |
| `technical` | Technical specifications | standard, full |
| `requirements` | Requirements analysis | full |
| `implementation` | Implementation details | full |
| `testing` | Testing procedures | full |
| `deployment` | Deployment plans | full |

**Coverage Validation**:

```bash
# Check chapter type coverage
cat <project-dir>/project-state.json | jq -r '.chapters | to_entries | map(.value.type) | group_by(.) | map({type: .[0], count: length})'

# Verify all required types present
required_types=("functional" "technical" "requirements")
for type in "${required_types[@]}"; do
  if ! grep -q "\"type\": \"$type\"" <project-dir>/project-state.json; then
    echo "MISSING: $type"
  fi
done
```

### 4.3 Quick Validation Scripts

**Phase Flow Validator** (`validators/phase-flow.sh`):

```bash
# 本地运行
bash validators/phase-flow.sh <project-dir>

# 远程运行
bash validators/phase-flow.sh --host <user@host> --dir <project-dir>
```

**Word Count Validator** (`validators/word-count.sh`):

```bash
# 本地运行
bash validators/word-count.sh <project-dir>

# 远程运行
bash validators/word-count.sh --host <user@host> --dir <project-dir>
```

**Chapter Types Validator** (`validators/chapter-types.sh`):

```bash
# 本地运行
bash validators/chapter-types.sh <project-dir>

# 远程运行
bash validators/chapter-types.sh --host <user@host> --dir <project-dir>
```

**Integrity Check** (`validators/integrity-check.sh`):

```bash
# 本地运行
bash validators/integrity-check.sh <project-dir>

# 远程运行
bash validators/integrity-check.sh --host <user@host> --dir <project-dir>
```

**Run All Validators** (`validators/run-all.sh`):

```bash
# 本地运行
bash validators/run-all.sh <project-dir>

# 远程运行（推荐）
bash validators/run-all.sh --host <user@host> --dir <project-dir>
```

**参数说明**:
- `--host <user@host>`: 远程主机地址（如 `water@8.160.160.85`）
- `--dir <project-dir>`: 远端项目目录路径（如 `/home/water/proj/c4/projects/LMERP2V2-v9`）

**示例**:
```bash
# 对远端 LMERP2V2-v9 项目运行所有验证
bash e2e-regression/validators/run-all.sh --host water@8.160.160.85 --dir /home/water/proj/c4/projects/LMERP2V2-v9
```

---

## Phase 5: Bug Classification & Issue Generation

### 5.1 Bug Categories

**Automatic classification based on symptoms**:

| Category | Symptoms | Example Issues |
|----------|----------|----------------|
| **State Machine** | Phase stuck, invalid transitions, deadlocks | Bug #63 (reviewed state), Bug #47 (4d deadlock) |
| **Task Scheduling** | Tasks not spawned, wrong order, missing tasks | Bug #65 (partial fixer), Bug #3 (round increment) |
| **Validation** | Word count failures, format errors | Bug #41 (word budget), Bug #36 (validation bypass) |
| **Logging** | Missing events, wrong format, TUI flooding | Bug #53 (missing emits), Bug #65 (DIAG flooding) |
| **Subagent** | Code reading, prompt errors, timeouts | E2E integrity violations |
| **Data Loss** | State not persisted, checkpoint failures | Bug #57 (missing snapshots) |

### 5.2 Bug Detection Patterns

**State Machine Bugs**:

```bash
# Detect phase stuck
ssh <remote-host> "tail -100 <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == \"phase.transition\") | .event.to' | tail -1"
# If same phase for > 5 minutes, likely stuck

# Detect invalid state transitions
ssh <remote-host> "cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == \"chapter.status\") | \"\(.event.chapterId) | \(.event.from) → \(.event.to)\"' | grep -E 'pending → completed|written → pending'"
```

**Task Scheduling Bugs**:

```bash
# Detect missing tasks
ssh <remote-host> "cat <project-dir>/project-state.json | jq -r '.chapters | to_entries | map(select(.value.status == \"reviewed\" and .value.lastReviewVerdict == \"revise\")) | map(.key)'"
# Compare with spawned fixer tasks

# Detect task timeout
ssh <remote-host> "for log in <project-dir>/logs/subagent-*.log; do last_turn=\$(grep 'Turn #' \$log | tail -1 | grep -oP 'Turn #\K[0-9]+'); if [ \$last_turn -gt 50 ]; then echo \"TIMEOUT: \$log\"; fi; done"
```

**Validation Bugs**:

```bash
# Detect word count failures
ssh <remote-host> "cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == \"task.fail\" and .event.failureType == \"validation_failed\") | \"\(.event.taskId) | \(.event.chapterId)\"'"

# Detect validation bypass
ssh <remote-host> "cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == \"chapter.status\" and .event.to == \"completed\") | .event.chapterId' | while read ch; do if ! grep -q \"review.*\$ch\" <project-dir>/logs/confwrite-log.jsonl; then echo \"BYPASS: \$ch\"; fi; done"
```

### 5.3 Automatic Issue Generation

**Bug Report Template**:

```markdown
## Bug: <category> - <symptom>

**Discovered**: E2E test v<version> on <date>
**Severity**: <critical|high|medium|low>
**Category**: <state-machine|task-scheduling|validation|logging|subagent|data-loss>

### Symptom

<What went wrong>

### Reproduction

1. Run E2E test with dataset: <dataset-name>
2. Wait for phase: <phase-id>
3. Observe: <observation>

### Evidence

**Project State**:
```json
<project-state.json excerpt>
```

**Log Events**:
```
<relevant log events>
```

**Subagent Logs**:
```
<subagent log excerpts>
```

### Root Cause (if known)

<Analysis of why this happened>

### Suggested Fix

<Proposed solution>
```

**Issue Generation Script**:

```bash
#!/bin/bash
# Generate GitHub issue from bug report

BUG_FILE="$1"
CATEGORY=$(grep "^**Category**:" "$BUG_FILE" | cut -d: -f2 | tr -d ' ')
SEVERITY=$(grep "^**Severity**:" "$BUG_FILE" | cut -d: -f2 | tr -d ' ')

# Create issue
gh issue create \
  --title "Bug: $CATEGORY - $(head -1 "$BUG_FILE" | sed 's/## Bug: //')" \
  --body-file "$BUG_FILE" \
  --label "bug,$SEVERITY"
```

### 5.4 Bug Pattern Database

**Track recurring patterns**:

```json
{
  "patterns": [
    {
      "id": "SM-001",
      "category": "state-machine",
      "symptom": "Phase 4a exits with reviewed status",
      "root_cause": "validation_failed sets status=reviewed",
      "fix": "Set status=written instead",
      "tests": ["tests/writing/validation-failed-status.test.ts"]
    },
    {
      "id": "TS-001",
      "category": "task-scheduling",
      "symptom": "Fixer tasks not spawned for all chapters",
      "root_cause": "generateFixTasks() only selects first N chapters",
      "fix": "Iterate all chapters with status=reviewed",
      "tests": ["tests/writing/fixer-spawning.test.ts"]
    }
  ]
}
```

---

## Phase 6: Validation & Reporting

### 6.1 Final Validation

**Product Validation**:
- [ ] All chapters completed
- [ ] Merged document exists and is readable
- [ ] Word count within expected range
- [ ] No critical errors in logs

**Process Validation**:
- [ ] All phases completed in order
- [ ] No unexpected phase transitions
- [ ] State machine invariants maintained (SM-*)
- [ ] No data loss or corruption

**Integrity Validation**:
- [ ] No subagent read ConfWrite source code
- [ ] No bash commands explored ConfWrite internals
- [ ] Test results are trustworthy

### 6.2 Verify PR Coverage

**Check if all pending PRs have been verified**:

```bash
# Get verification goals from Phase -1
# Compare with actual test results

# Example: Check if PR #68 changes were exercised
cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == "task.review") | .event.chapterId' | wc -l
# If > 0, reviewer was invoked (PR #68 changes exercised)

# Check if word count validation was triggered
cat <project-dir>/logs/confwrite-log.jsonl | jq -r 'select(.event.type == "validation.wordbudget") | .event.chapterId' | wc -l
```

**PR Verification Matrix**:

| PR | Change | Verification Method | Status |
|----|--------|--------------------|--------|
| #68 | 字数控制策略 | Reviewer invoked, word budget checked | ✅ Verified |
| #69 | 验证范围追踪 | Tracking file updated | ✅ Verified |

### 6.3 Update Tracking File

```bash
# Update last-e2e-state.json with current test results
# Format: <version> <commit> <project-dir> [issues-json]

# Example: No new issues found
bash e2e-regression/scripts/update-e2e-state.sh \
  v0.25.0 \
  $(git rev-parse HEAD) \
  <project-dir> \
  '[]'

# Example: New issues found
bash e2e-regression/scripts/update-e2e-state.sh \
  v0.25.0 \
  $(git rev-parse HEAD) \
  <project-dir> \
  '[{"id":"NEW-001","category":"validation","description":"新问题描述","severity":"medium","status":"open"}]'
```

**Output**:
```
已更新追踪文件: e2e-regression/last-e2e-state.json
  版本: v0.25.0
  Commit: abc123def456
  发现问题: 0
```

### 6.4 Generate Test Report

Create `E2E-TEST-REPORT-<version>.md` with:

```markdown
# E2E Test Report - <version>

**Test Date**: <date>
**Test Project**: <project-name>
**ConfWrite Version**: <version>
**Dataset**: <dataset-name>

## Summary

- **Status**: ✅ Pass / ❌ Fail
- **Duration**: <duration>
- **Chapters**: <count>
- **Final Word Count**: <count>
- **Integrity**: ✅ Verified / ❌ Compromised

## Verification Scope

### Last E2E State
- **Version**: <last-version>
- **Commit**: <last-commit>
- **Timestamp**: <last-timestamp>
- **Days Since Last E2E**: <days>

### Pending PRs (Since Last E2E)

| PR | Title | Change | Verification Method | Status |
|----|-------|--------|--------------------|--------|
| #68 | 字数控制策略改进 | Reviewer/Fixer prompt | Word count checked | ✅ Verified |
| #69 | 验证范围追踪 | Tracking mechanism | State file updated | ✅ Verified |

**Total Pending PRs**: <count>
**Verified**: <count> | **Unverified**: <count>

### Known Issues Regression Check

| Issue ID | Description | Status in Last E2E | Current Status | Notes |
|----------|-------------|-------------------|----------------|-------|
| WORD-COUNT-001 | 所有章节超出字数上限 39%-84% | Fixed in #68 | ✅ Not Regressed | 字数在预算范围内 |

**Regression Summary**:
- **Issues Checked**: <count>
- **Regressed**: <count> | **Not Regressed**: <count>

## Phase Transitions

| Phase | Started | Completed | Duration |
|-------|---------|-----------|----------|
| 0a    | <time>  | <time>    | <dur>    |
| ...   | ...     | ...       | ...      |

## Issues Found

### Issue 1: <title>
- **Severity**: High/Medium/Low
- **Category**: <category>
- **Description**: <description>
- **Impact**: <impact>
- **Workaround**: <workaround>
- **GitHub Issue**: #<number>

## Recommendations

- <recommendation-1>
- <recommendation-2>
```

### 6.3 Archive Test Results

```bash
# Copy logs and reports to local machine
scp <remote-host>:<project-dir>/logs/*.jsonl ./test-results/
scp <remote-host>:<project-dir>/E2E-TEST-REPORT*.md ./test-results/

# Commit test report
git add E2E-TEST-REPORT-<version>.md
git commit -m "test: E2E report for v<version>"
```

---

## Phase 7: Cleanup

### 7.1 Remote Cleanup (Optional)

```bash
# Remove test project (if temporary)
ssh <remote-host> "rm -rf <project-dir>"

# Or archive for future reference
ssh <remote-host> "tar -czf <project-dir>-<date>.tar.gz <project-dir>"
```

### 7.2 Local Cleanup

- [ ] Test results archived
- [ ] Test report committed
- [ ] Issues created for bugs found
- [ ] Success metrics recorded

---

## Checklist: E2E Test Complete

- [ ] Test integrity verified (no source code analysis)
- [ ] Test environment prepared
- [ ] All phases completed successfully
- [ ] Final product validated
- [ ] Test report generated
- [ ] Issues documented and categorized
- [ ] Results archived
- [ ] Cleanup completed

---

## Anti-Patterns

**Don't**:
- Skip integrity verification (Phase 0)
- Ignore subagent code reading (invalidates test)
- Skip monitoring during Phase 4 (writing cycle can take hours)
- Ignore word count validation failures (they indicate prompt issues)
- Assume success without checking final product
- Forget to archive logs (they're essential for debugging)
- File bugs without categorization (makes tracking harder)

**Do**:
- Verify test integrity before starting
- Monitor progress every 30-60 seconds during Phase 4
- Correlate events across all three log sources
- Record all issues with proper categorization
- Validate product quality, not just process completion
- Use structured logging for easier analysis
- Generate GitHub issues automatically when possible
