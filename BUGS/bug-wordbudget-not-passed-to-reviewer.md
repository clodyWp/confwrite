# Bug: Reviewer Task 文件中缺少字数预算检查部分

**状态**: ✅ 已修复（v0.20.0）  
**发现时间**: 2026-01-09  
**修复时间**: 2026-10-10  
**影响范围**: Reviewer Task 文件生成  
**严重程度**: P0 - 阻塞

## 问题描述

Reviewer task 文件中**完全没有**"字数预算检查"部分（第 7 节），导致 Reviewer 只看到第 3 节的"≥ 8000 字"要求，没有上限检查。

## 验证结果

### 1. Task 文件内容

```bash
$ grep -c "字数预算检查" /home/water/proj/c4/projects/LMERP2V2-v6/.confwrite-tasks/review-ch001-r1.md
0
```

**结果**：0 次出现，说明第 7 节完全没有生成。

### 2. Task 文件结尾

```bash
$ tail -50 review-ch001-r1.md
```

结尾是知识库内容（knowledgeContent），而不是 wordBudgetSection：

```markdown
### 常见质量问题

---
type: Technical Lesson
title: Writer Subagent 图表描述质量问题
...
```

### 3. 代码逻辑

**文件**: `dist/writing/task-executor.js` (第 485-490 行)

```javascript
${knowledgeContent ? `
## 图表质量对抗性检查（必须执行）

${knowledgeContent}
` : ''}${wordBudgetSection}`;
```

**分析**：
- knowledgeContent 存在（非空），所以"图表质量对抗性检查"部分被生成
- wordBudgetSection 为空字符串，所以"字数预算检查"部分没有被生成

### 4. wordBudgetSection 为空的原因

根据代码（第 30-48 行）：

```javascript
const wordBudgetSection = wordBudget ? `

### 7. 字数预算检查（硬性要求）
...
` : '';
```

**结论**：wordBudget 参数在运行时是 undefined 或 null。

### 5. Dispatcher 代码

**文件**: `dist/dispatcher/index.js`

```javascript
// 从 state 读取 wordBudget 并传递给 prompt
const wordBudget = state?.chapters?.[chapterId]?.wordBudget;
task.prompt = this.taskExecutor.generateReviewerPrompt(task, draftContent, baseline, round, knowledgeContent, this.projectDir, wordBudget);
```

**分析**：Dispatcher 代码正确，从 state 读取 wordBudget。

### 6. State 中的 wordBudget

```bash
$ cat project-state.json | jq ".chapters.ch001.wordBudget"
{
  "min": 5000,
  "max": 8000
}
```

**分析**：State 中确实有 wordBudget。

## 矛盾

- Dispatcher 从 state 读取 wordBudget ✅
- State 中有 wordBudget ✅
- 但 task 文件中没有 wordBudgetSection ❌

## 可能原因

### 原因 1：时序问题

Task 文件生成时，state 还没有 wordBudget。wordBudget 是后来才添加到 state 中的。

**验证**：检查 task 文件的生成时间和 state 的最后更新时间。

```bash
$ ls -l .confwrite-tasks/review-ch001-r1.md
$ cat project-state.json | jq ".lastUpdated"
```

### 原因 2：Dispatcher 版本不一致

远程机器上运行的 dispatcher 版本与检查的版本不一致。

**验证**：检查 dispatcher 的修改时间。

```bash
$ ls -l /home/water/proj/c4/node_modules/confwrite/dist/dispatcher/index.js
```

### 原因 3：wordBudget 读取失败

可选链操作符 `?.` 在某处返回 undefined。

**验证**：添加日志检查 wordBudget 的值。

## 影响

- Reviewer 只看到"≥ 8000 字"要求，没有上限检查
- Writer 被误导，写了超长内容
- 所有章节都超标 2.2 倍

## 修复方案

### 方案 1：确保 wordBudget 总是传递（推荐）

在 dispatcher 中添加验证：

```javascript
const wordBudget = state?.chapters?.[chapterId]?.wordBudget;
if (!wordBudget) {
  console.warn(`Warning: wordBudget not found for ${chapterId}, using default`);
  wordBudget = { min: 5000, max: 8000 };
}
```

### 方案 2：在 generateReviewerPrompt 中设置默认值

```javascript
generateReviewerPrompt(..., wordBudget) {
  // 如果 wordBudget 未提供，使用默认值
  const effectiveBudget = wordBudget ?? { min: 5000, max: 8000 };
  const wordBudgetSection = `

### 7. 字数预算检查（硬性要求）

本章的字数预算为 **${effectiveBudget.min}-${effectiveBudget.max} 字**。
...
`;
```

### 方案 3：删除第 3 节的字数检查

只保留第 7 节的字数预算检查，避免矛盾。

## 验证方法

修复后执行 E2E 测试：
1. 检查 task 文件中是否有"字数预算检查"部分
2. 检查字数预算是否与大纲一致（5000-8000）
3. 检查 Reviewer 是否正确检查上限

## 关联问题

- `bug-reviewer-prompt-duplicate-word-check.md` - prompt 中字数标准重复且矛盾
- `bug-min-chapter-chars-mismatch.md` - 配置值不一致
- 本 bug - wordBudgetSection 未生成（根因）
