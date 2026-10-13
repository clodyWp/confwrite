# Bug: Review Round Filename Mismatch

**Bug ID**: REVIEW-ROUND-001
**Category**: state-machine
**Severity**: high
**Discovered**: E2E test v0.25.0 on 2026-10-13

## Symptom

所有章节在 round 1 审阅后都被标记为 "accept"，但系统继续循环直到 round 5 (maxRounds)，最终所有章节 failed。

## Reproduction

1. Run E2E test with dataset: standard (7 chapters)
2. Wait for phase: 4b (review)
3. Observe: 所有章节 round 1 审阅 verdict = "accept"
4. Observe: 系统继续循环到 round 5
5. Observe: 所有章节 failed (exceeded_max_rounds_validation)

## Evidence

**Project State**:
```json
{
  "currentPhase": "4b",
  "chapters": {
    "ch001": { "status": "failed", "round": 5, "consecutiveFailures": 4 },
    "ch002": { "status": "failed", "round": 5, "consecutiveFailures": 4 },
    ...
  }
}
```

**Review Files**:
- 只存在 round 1 的审阅文件: `ch001-r1.json` 到 `ch007-r1.json`
- 所有 round 1 审阅 verdict = "accept"
- 不存在 round 2-5 的审阅文件

**Log Events**:
```
[Reviewer] 开始写作 ch001 (并发 0/1)
Warning: ⚠️ 验证失败 (reviewer ch001):
  ❌ 章节字数超标: 12329 字 > 上限 8000 字
  ❌ verdict 矛盾: verdict 为 accept，但审阅报告中发现字数问题
```

## Root Cause

**文件名不匹配**:
1. Task 创建时使用 `state.round` (全局 round = 1)
   - Task ID: `review-ch001-r1`
2. 审阅文件保存为 `ch001-r1.json`
3. `parseReviewResult()` 使用 `chapter.round` 查找文件
4. `chapter.round` 在每次循环后递增 (1 → 2 → 3 → 4 → 5)
5. Round 2 时查找 `ch001-r2.json`，文件不存在
6. 找不到文件时默认返回 'revise'
7. 循环继续直到 maxRounds (5)

**代码位置**:
```javascript
// orchestrator.js line 167
const decision = this.parseReviewResult(task.result, task.chapterId, chapter.round, projectDir);
```

**问题**:
- Task 创建: `review-ch001-r${state.round}` (state.round = 1)
- 文件保存: `ch001-r1.json` (使用 task.round)
- 文件查找: `ch001-r${chapter.round}.json` (chapter.round = 2, 3, 4, 5)

## Suggested Fix

统一使用 `task.round` 或 `chapter.round`，不要混用。

**Option 1**: 统一使用 `task.round`
```javascript
// 创建 task 时
const taskId = `review-${chapterId}-r${chapter.round}`;

// 查找文件时
const reviewFile = `review/${chapterId}-r${task.round}.json`;
```

**Option 2**: 统一使用 `chapter.round`
```javascript
// 创建 task 时
const taskId = `review-${chapterId}-r${chapter.round}`;

// 查找文件时
const reviewFile = `review/${chapterId}-r${chapter.round}.json`;
```

## Impact

- 所有章节无法通过审阅流程
- 即使内容质量良好（verdict = "accept"），也会被标记为 failed
- 浪费大量 API 调用（5 轮 × 7 章节 = 35 次审阅）

## Related Issues

- WORD-COUNT-001: 字数控制问题（已修复于 PR #69）
- WORD-COUNT-002: Writer prompt 改进不足（待修复）
- REVIEW-VERDICT-001: 审阅者检测到字数超标但 verdict 为 accept（待修复）
