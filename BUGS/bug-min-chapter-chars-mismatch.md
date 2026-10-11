# Bug: Reviewer Prompt 中 minChapterChars 配置值与 wordBudget 不一致

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Reviewer Prompt 生成, 配置系统  
**严重程度**: P0 - 阻塞

## 问题描述

Reviewer prompt 中使用了 `this.config.writing.minChapterChars` 作为篇幅检查标准，但这个值与大纲中的 `wordBudget.min` 不一致。

## 代码追踪

### 1. Reviewer Prompt 生成逻辑

**文件**: `src/writing/task-executor.ts` (第 430-460 行)

```typescript
## 反馈限制

- **最多 5 个问题**：只关注最重要的问题，不要列举所有小问题
- **优先级**：
  1. 字数是否达标（≥ ${this.config.writing.minChapterChars} 字符）  // ← 使用 minChapterChars
  ...

### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ ${this.config.writing.minChapterChars} 字**  // ← 使用 minChapterChars
```

### 2. 默认配置

**文件**: `src/config/loader.ts` (第 75-90 行)

```typescript
export const DEFAULT_CONFIG: ConfWriteConfig = {
  writing: {
    minChapterChars: 5000,  // ← 默认值 5000
    maxRounds: 5,
    defaultWordBudget: {
      target: 6500,
      tolerance: 0.2,  // 20% 容差，即 5200-7800
    },
  },
  ...
};
```

### 3. 实际 Task 文件

**文件**: `/home/water/proj/c4/projects/LMERP2V2-v6/.confwrite-tasks/review-ch001-r1.md` (第 1872 行)

```markdown
**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ 8000 字**  // ← 实际值是 8000，不是 5000
```

### 4. 大纲预算

**文件**: `/home/water/proj/c4/projects/LMERP2V2-v6/outline.md`

```markdown
ch001 项目目标
字数预算: 5000-8000字  // ← 预算是 5000-8000
```

## 矛盾对比

| 位置 | 值 | 来源 |
|------|-----|------|
| 大纲预算 | 5000-8000 | outline.md |
| state.wordBudget | {min: 5000, max: 8000} | project-state.json |
| config.minChapterChars | 5000 | DEFAULT_CONFIG |
| **实际 task 文件** | **≥ 8000** | review-ch001-r1.md ❌ |

## 可能原因

1. **配置被覆盖**：远程机器上可能有自定义配置文件覆盖了默认值
2. **代码逻辑错误**：某处代码把 `wordBudget.max` 赋值给了 `minChapterChars`
3. **版本不一致**：远程 confwrite 版本与本地代码不一致

## 需要验证

```bash
# 1. 检查远程配置文件
ssh water@8.160.160.85 'cat /home/water/proj/c4/node_modules/confwrite/dist/config/loader.js | grep -A 5 "minChapterChars"'

# 2. 检查远程 dist 版本
ssh water@8.160.160.85 'cat /home/water/proj/c4/node_modules/confwrite/package.json | grep version'

# 3. 检查是否有全局配置
ssh water@8.160.160.85 'find /home/water -name "confwrite.config.json" 2>/dev/null'
```

## 影响

- Reviewer 使用错误的字数标准（8000 而不是 5000）
- 与大纲预算（5000-8000）矛盾
- 导致 Writer 被误导，写了超长内容

## 修复方向

1. **统一配置**：确保 `minChapterChars` 与 `wordBudget.min` 一致
2. **修改 Reviewer prompt**：使用 `wordBudget` 而不是 `minChapterChars`
3. **添加验证**：在 prompt 生成时检查配置一致性

## 关联问题

- `bug-reviewer-prompt-word-limit.md` - Reviewer 审阅标准与大纲预算矛盾（本 bug 的表现）
- 本 bug - 配置值不一致（本 bug 的根因）
