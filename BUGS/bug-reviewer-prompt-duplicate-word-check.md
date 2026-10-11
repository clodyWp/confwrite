# Bug: Reviewer Prompt 中字数标准重复且矛盾

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Reviewer Prompt 生成  
**严重程度**: P0 - 阻塞

## 问题描述

Reviewer prompt 中有**两处**字数检查标准，且互相矛盾：

1. **第 3 节"内容深度"**：使用 `this.config.writing.minChapterChars`（实际值 8000）
2. **第 7 节"字数预算检查"**：使用 `wordBudget.min` 和 `wordBudget.max`（5000-8000）

LLM 收到矛盾指令后，优先遵循了第 3 节的"≥ 8000 字"要求。

## 代码位置

**文件**: `src/writing/task-executor.ts`

### 第 3 节（第 449 行）

```typescript
**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ ${this.config.writing.minChapterChars} 字**
```

### 第 7 节（第 381-392 行）

```typescript
const wordBudgetSection = wordBudget ? `

### 7. 字数预算检查（硬性要求）

本章的字数预算为 **${wordBudget.min}-${wordBudget.max} 字**。

**硬性上限**：本章字数**不得超过 ${wordBudget.max} 字**。超过将被拒绝并要求精简。

**容差规则**：
- 实际字数在 ${wordBudget.min}-${wordBudget.max} 字范围内 → 通过
- 实际字数 > ${wordBudget.max} 字 → **revise**（要求精简，超过上限将被拒绝）
- 实际字数 < ${wordBudget.min} 字 → revise（要求补充）
```

### 最终拼接（第 536 行）

```typescript
${knowledgeContent ? `...` : ''}${wordBudgetSection}`;
```

## 实际 Task 文件

**文件**: `/home/water/proj/c4/projects/LMERP2V2-v6/.confwrite-tasks/review-ch001-r1.md`

### 第 3 节（第 1871-1872 行）

```markdown
**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ 8000 字**
```

### 第 7 节（未找到）

```bash
$ grep -A 10 "字数预算检查" review-ch001-r1.md
(no output)
```

**问题**：第 7 节根本没有出现在 task 文件中！

## 可能原因

1. **wordBudget 参数为 undefined**：dispatcher 没有正确传递 wordBudget
2. **wordBudgetSection 为空字符串**：条件判断失败
3. **代码版本不一致**：远程 dist 版本与本地 src 不一致

## 需要验证

```bash
# 1. 检查远程 dist 版本
ssh water@8.160.160.85 'grep -A 5 "字数预算检查" /home/water/proj/c4/node_modules/confwrite/dist/writing/task-executor.js'

# 2. 检查 dispatcher 是否传递 wordBudget
ssh water@8.160.160.85 'grep -B 2 -A 2 "generateReviewerPrompt" /home/water/proj/c4/node_modules/confwrite/dist/dispatcher/index.js'

# 3. 检查 state 中是否有 wordBudget
ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/LMERP2V2-v6/project-state.json | jq ".chapters.ch001.wordBudget"'
```

## 影响

- Reviewer 收到矛盾指令：第 3 节说"≥ 8000"，第 7 节说"5000-8000"
- LLM 优先遵循第 3 节（因为它在前面，且标记为"核心职责"）
- 第 7 节可能根本没有生成（wordBudget 为 undefined）
- 最终所有章节都写了 15000+ 字，远超预算

## 修复方案

### 方案 1：删除第 3 节的字数检查（推荐）

```typescript
// 删除第 449 行的字数检查
// 只保留第 7 节的 wordBudgetSection

**篇幅检查**（Reviewer 核心职责）：
- 见第 7 节"字数预算检查"
```

### 方案 2：统一使用 wordBudget

```typescript
// 第 3 节也使用 wordBudget
const minChars = wordBudget?.min ?? this.config.writing.minChapterChars;

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ ${minChars} 字**
```

### 方案 3：确保 wordBudgetSection 总是生成

```typescript
// 即使 wordBudget 为 undefined，也生成默认值
const wordBudgetSection = `

### 7. 字数预算检查（硬性要求）

本章的字数预算为 **${wordBudget?.min ?? 5000}-${wordBudget?.max ?? 8000} 字**。
...
`;
```

## 验证方法

修复后执行 E2E 测试：
1. 检查 task 文件中是否只有一处字数标准
2. 检查字数标准是否与大纲预算一致（5000-8000）
3. 检查 Reviewer 是否正确检查上限

## 关联问题

- `bug-reviewer-prompt-word-limit.md` - Reviewer 审阅标准与大纲预算矛盾（表现）
- `bug-min-chapter-chars-mismatch.md` - 配置值不一致（根因之一）
- 本 bug - prompt 中字数标准重复且矛盾（根因之二）
