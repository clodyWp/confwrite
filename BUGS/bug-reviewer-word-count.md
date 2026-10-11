# Bug: Reviewer 发现字数超标但仍然 accept

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Phase 4b (审阅), Phase 4c (决策)  
**严重程度**: P1 - 严重

## 问题描述

Reviewer 在审阅 summary 中明确提到字数超标（"全文约15000字符，远超8000字下限"），但 verdict 仍然是 "accept"，没有触发修复循环。

## 复现步骤

1. 执行 E2E 测试（LMERP2V2-v6）
2. Writer 生成 ch001，实际字数 15,270（预算 5,000-8,000）
3. Reviewer 审阅 ch001
4. 检查 review/ch001-r1.json：
   - summary 提到字数超标
   - verdict: "accept"
5. 没有触发 fixer 任务

## 实际数据

### ch001 审阅结果

```json
{
  "verdict": "accept",
  "summary": "本章作为项目目标章节，整体质量较高。全文约15000字符（中文字符约9900字），远超8000字下限。..."
}
```

### 所有章节审阅结果

| 章节 | 实际字数 | 预算范围 | Reviewer 是否提到字数 | verdict |
|------|---------|---------|---------------------|---------|
| ch001 | 15,270 | 5,000-8,000 | ✅ 是 | accept |
| ch002-ch010 | 14,000-21,000 | 5,000-8,000 | 待检查 | 全部 accept |

## 根本原因分析

### 可能原因 1：Reviewer prompt 字数检查不是硬性标准

Reviewer 的 prompt 可能只是"建议"遵守字数预算，而不是"必须"。导致 Reviewer 发现超标但仍然 accept。

### 可能原因 2：verdict 判定逻辑问题

Reviewer 可能综合评估多个维度（准确性、一致性、清晰度、深度、质量），字数只是其中之一。如果其他维度得分高，可能仍然 accept。

### 可能原因 3：字数计算方式不一致

- 大纲预算：5,000-8,000 字
- Reviewer 检查：15,000 字符 ≈ 9,900 中文字
- 实际文件：15,270 字符

可能存在字符数 vs 字数的混淆。

## 影响

- **字数控制完全失效**：Writer 不遵守预算，Reviewer 不强制修复
- **文档过长**：总计 175,741 字，目标 50,000 字，超标 3.5 倍
- **资源浪费**：消耗更多 token 和时间
- **用户体验差**：生成的文档不符合预期

## 修复方案

### 方案 1：Reviewer prompt 增加硬性字数检查（推荐）

```typescript
// src/subagent/reviewer-prompt.ts
const reviewCriteria = `
## 硬性标准（必须满足）

1. **字数预算**：本章预算 ${minWords}-${maxWords} 字
   - 实际字数：${actualWords} 字
   - 如果超出预算的 1.2 倍，verdict 必须为 "revise"
   - 反馈中明确指出："字数超标，请压缩到 ${maxWords} 字以内"

2. 数据基线一致性
3. 章节结构完整性

## 软性标准（建议满足）

4. 准确性、清晰度、深度等
`;
```

### 方案 2：Dispatcher 增加字数验证 gate

```typescript
// src/dispatcher/review-dispatcher.ts
const validateWordCount = (chapter: Chapter, review: ReviewResult) => {
  const actual = countWords(chapter.content);
  const [min, max] = chapter.wordBudget;
  
  if (actual > max * 1.2 && review.verdict === 'accept') {
    // 强制改为 revise
    return {
      ...review,
      verdict: 'revise',
      issues: [
        ...review.issues,
        {
          severity: 'high',
          description: `字数超标：${actual} > ${max}`,
          suggestion: `请压缩到 ${max} 字以内`,
        }
      ]
    };
  }
  
  return review;
};
```

### 方案 3：Phase 4c 决策时检查字数

```typescript
// src/orchestrator/phases.ts - phase4c
const wordCountCheck = (chapter: Chapter) => {
  const actual = countWords(chapter.content);
  const [min, max] = chapter.wordBudget;
  
  if (actual > max * 1.5) {
    // 即使 verdict 是 accept，也强制回到 4a 重写
    chapter.status = 'pending';
    chapter.round += 1;
    return { pass: false, reason: '字数严重超标' };
  }
  
  return { pass: true };
};
```

## 验证方法

修复后执行 E2E 测试：
1. Writer 生成超预算的章节
2. Reviewer 检查字数，verdict 应为 "revise"
3. Fixer 压缩字数
4. 重新审阅，直到字数在预算范围内

## 相关文件

- `src/subagent/reviewer-prompt.ts` - Reviewer prompt 生成
- `src/dispatcher/review-dispatcher.ts` - 审阅任务分发
- `src/orchestrator/phases.ts` - Phase 4b/4c 定义

## 关联问题

- `bug-word-count-exceeded.md` - Writer 字数超标
- 本 bug 是字数超标问题的下游：Writer 超标 → Reviewer 不拦截 → 最终文档超标
