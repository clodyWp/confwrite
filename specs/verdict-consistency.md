# Spec: Reviewer Verdict 一致性

> **版本**: 1.0  
> **日期**: 2026-10-16  
> **源码**: `src/writing/output-validator.ts`, `src/writing/task-executor.ts`  
> **关联 Issue**: #124  
> **状态**: 有效

---

## 1. 问题背景

E2E 测试中发现 Reviewer subagent 返回的 verdict 与审阅报告内容矛盾：
- verdict 为 `accept`
- 但报告中发现字数问题

独立验证器检测到矛盾，但当前实现只是记录警告，没有自动修正。

---

## 2. 行为规格（不变量）

### VC-1: Verdict 一致性自动修正

**前置条件**：Reviewer 输出已通过 JSON 解析，verdict 为 `accept`  
**不变量**：如果审阅报告中存在以下任一情况，verdict 必须被自动修正为 `revise`：
1. issues 中提到字数问题（关键词：字数、超标、超出、上限、过多）
2. 独立字数验证发现超标或不足

**后置条件**：`ValidationResult.verdictCorrected` 为 `true`，记录修正原因。  
**验证方式**：单元测试覆盖所有矛盾场景。

```typescript
// 伪代码
if (parsed.verdict === 'accept') {
  const hasWordCountIssue = checkWordCountIssues(parsed.issues);
  const hasActualOverage = checkActualWordCount(draftPath, wordBudget);
  
  if (hasWordCountIssue || hasActualOverage) {
    result.verdictCorrected = true;
    result.correctedVerdict = 'revise';
    result.correctionReason = 'verdict 与报告内容矛盾';
  }
}
```

---

### VC-2: 修正记录可追溯

**前置条件**：verdict 被自动修正  
**不变量**：修正记录必须通过 EventBus 发射诊断事件，包含：
- `chapterId`
- `originalVerdict`: 'accept'
- `correctedVerdict`: 'revise'
- `reason`: 修正原因
- `round`: 当前轮次

**后置条件**：日志中可追溯每次修正。

---

### VC-3: 修正不影响验证结果

**前置条件**：verdict 被自动修正为 `revise`  
**不变量**：修正后的 verdict 不影响 `ValidationResult.valid` 的值。  
验证结果仍然标记为 `valid: false`（因为原始输出有矛盾），但章节进入修复循环。

**后置条件**：章节状态正确转换（written → reviewed → fix）。

---

## 3. 测试设计

### TC-VC-1: VC-1 — issues 提到字数问题，verdict=accept → 修正为 revise

| 项目 | 内容 |
|------|------|
| **给定** | Reviewer 输出 verdict=accept，但 issues 中包含"字数超标" |
| **当** | 调用 `validateReviewerOutput()` |
| **期望** | `result.verdictCorrected === true`，`result.correctedVerdict === 'revise'` |

### TC-VC-2: VC-1 — 独立字数验证发现超标，verdict=accept → 修正为 revise

| 项目 | 内容 |
|------|------|
| **给定** | Reviewer 输出 verdict=accept，草稿实际字数 > wordBudget.max |
| **当** | 调用 `validateReviewerOutput()` |
| **期望** | `result.verdictCorrected === true`，`result.correctedVerdict === 'revise'` |

### TC-VC-3: VC-1 — 无矛盾，verdict=accept → 不修正

| 项目 | 内容 |
|------|------|
| **给定** | Reviewer 输出 verdict=accept，issues 无字数问题，字数在范围内 |
| **当** | 调用 `validateReviewerOutput()` |
| **期望** | `result.verdictCorrected === false` 或 undefined |

### TC-VC-4: VC-2 — 修正记录通过 EventBus 发射

| 项目 | 内容 |
|------|------|
| **给定** | verdict 被自动修正 |
| **当** | 调用 `validateReviewerOutput()` |
| **期望** | EventBus 收到 `verdict.corrected` 事件 |

### TC-VC-5: VC-3 — 修正后验证结果仍为 false

| 项目 | 内容 |
|------|------|
| **给定** | verdict 被自动修正为 revise |
| **当** | 调用 `validateReviewerOutput()` |
| **期望** | `result.valid === false`（原始输出有矛盾） |

---

## 4. 实现要点

### 4.1 修改 `OutputValidator.validateReviewerOutput()`

```typescript
// 新增字段到 ValidationResult
interface ValidationResult {
  // ... 现有字段
  verdictCorrected?: boolean;
  correctedVerdict?: 'accept' | 'revise' | 'reject';
  correctionReason?: string;
}

// 在 verdict 一致性检查后，自动修正
if (hasWordCountIssueInReport || hasWordCountOverLimit) {
  result.verdictCorrected = true;
  result.correctedVerdict = 'revise';
  result.correctionReason = reasons.join('; ');
  
  // 发射诊断事件
  this.eventBus?.emit({
    type: 'diag.verdict_corrected',
    chapterId,
    round,
    originalVerdict: 'accept',
    correctedVerdict: 'revise',
    reason: result.correctionReason,
    timestamp: new Date().toISOString(),
  });
}
```

### 4.2 修改 `WritingOrchestrator.updateChapterStatus()`

```typescript
// 使用修正后的 verdict（如果存在）
const effectiveVerdict = validationResult.correctedVerdict || parsed.verdict;
chapter.lastReviewVerdict = effectiveVerdict;
```

---

## 5. 验收标准

1. `npm test` 通过，包含 `verdict-consistency.test.ts` 的所有测试用例
2. verdict 矛盾时自动修正为 revise
3. 修正记录通过 EventBus 可追溯
4. 不影响现有验证逻辑
