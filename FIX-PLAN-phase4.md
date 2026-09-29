# Phase 4 Bug 修复方案

> 记录日期：2026-09-28
> 状态：方案已定，待实施

---

## Bug 6 — ≥300 字/段规则永不收敛

### 问题

task-executor.ts 中 11 处硬编码要求段落 ≥ 300 字，Reviewer 机械计数，Fixer 反复扩充，循环不收敛。maxRounds=5 兜底有效但浪费 tokens。

### 方案

保留 ch 级 ≥ 8000 字度量（正确），移除段落级 300 字硬规则，改为定性描述。

| 位置 | 当前 | 改为 |
|------|------|------|
| Writer 行 92 | `每个独立成段的段落不少于 300 字` | **删除此行** |
| Writer 行 186 | `用独立段落（≥300字）说明图表要表达的内容...` | `用独立段落说明图表要表达的内容、背景、关键要素（至少 2-3 句话）` |
| Writer 行 188 | `用独立段落（≥300字）总结图表的关键要点...` | `用独立段落总结图表的关键要点、启示（至少 2-3 句话）` |
| Writer 行 194, 260 | 示例中的 `≥300字` 注释 | **删除注释** |
| Writer 行 289 | `概述...（≥300字）` | `概述...（简要介绍）` |
| Writer 行 299 | `小结...（≥300字）` | `小结...（总结要点）` |
| Reviewer 行 399 | `每个独立成段的段落是否 ≥ 300 字` | **删除此行** |
| Reviewer 行 411 | `图表前是否有独立描述段落（≥300字，说明背景、要素）` | `图表前是否有独立段落说明（至少 2-3 句话，不能只有标题没有正文）` |
| Reviewer 行 412 | `图表后是否有独立总结段落（≥300字，提炼要点、启示）` | `图表后是否有独立段落总结（至少 2-3 句话）` |
| Fixer 行 544 | `每个独立段落 ≥ 300 字` | **删除此行** |
| Fixer 行 545 | `图表前后有独立段落说明（≥300字）` | `图表前后有独立段落说明` |

**额外**：清理 `content-validator.ts:28` 的 `MIN_PARAGRAPH_CHARS = 300`（如果是死代码则删除）。

---

## Bug 4 — accept 门槛「全部通过」

### 问题

Reviewer prompt 要求「内容深度、图表规范、数据一致性**全部通过**」才 accept，全称命题导致几乎达不到。实测 14 章 12 章判 revise（86%）。

### 方案

改为基于严重度的量化标准。

**当前（行 478-480）**：
```
- **accept**: 质量达标，内容深度、图表规范、数据一致性全部通过
- **revise**: 有小问题，需要修改后重新审阅
- **reject**: 质量问题严重，需要重写
```

**改为**：
```
- **accept**: 无 high 问题，且 medium ≤ 3 条。low 级问题不影响 accept。
- **revise**: 有 high 问题，或 medium > 3 条。
- **reject**: 大量 high 问题（≥3），或内容严重注水/错误、结构混乱。
```

---

## Bug 5 — 裁决与严重度不相关

### 问题

low 级问题也触发 revise，裁决与严重度无对应关系。与 Bug 4 同源。

### 方案

在 Bug 4 修改后的决定标准后面追加严重度定义：

```
**严重度与裁决的关系**：
- high = 内容错误、数据与基线矛盾、关键需求遗漏 → 必须 revise 或 reject
- medium = 内容不够深入、结构可优化、图表说明不足 → 累计 > 3 条时 revise
- low = 措辞可改进、格式小问题 → 不影响裁决，可忽略
```

---

## Bug 8 — 429 退避死代码

### 问题

`runAll()` 不检查 `pausedUntil`，指数退避在生产路径完全无效。5 次重试在几秒内耗尽 → 熔断。

### 方案：两阶段退避

```
阶段 1：快速重试 2 次，间隔 2 分钟（覆盖偶发抖动）
阶段 2：长间隔重试 5 次，间隔 12 分钟（覆盖 1 小时恢复）
总计：最多 7 次重试，64 分钟
熔断：全部耗尽后触发
```

### 实现

修改 `src/scheduler/runner.ts`：

1. `runAll()` 开头加入 `pausedUntil` 检查
2. 退避算法改为两阶段：
   ```typescript
   // 阶段 1: 前 2 次，间隔 2 分钟
   // 阶段 2: 第 3-7 次，间隔 12 分钟
   const phase1Retries = 2;
   const phase1Delay = 2 * 60 * 1000;    // 2 分钟
   const phase2Delay = 12 * 60 * 1000;   // 12 分钟
   
   let actualDelay: number;
   if (this.consecutiveRateLimits <= phase1Retries) {
     actualDelay = phase1Delay;
   } else {
     actualDelay = phase2Delay;
   }
   ```
3. `maxConsecutiveRateLimits` 从 5 改为 7

---

## Bug 32 — turn 预算耗尽判失败

### 问题

任务已正确产出文件，但在自检时耗尽 turn → 判失败 → 章节变 pending。

### 方案：A — 产物存在则判 completed_with_issues

修改 `src/writing/orchestrator.ts` 的 `updateChapterStatus`：

当 `outcome === 'failed'` 且任务类型有产出文件时，检查产物是否存在：
```typescript
if (outcome === 'failed') {
  // 检查目标产物是否已存在且有效
  const hasOutput = this.checkOutputExists(task.chapterId, chapter.round, projectDir);
  if (hasOutput) {
    chapter.status = 'completed';
    chapter.failureReason = 'completed_with_issues';
    chapter.consecutiveFailures = 0;
  } else {
    // 原有逻辑
  }
}
```

---

## Bug 11 — finalization.json 字段命名

### 问题

`finalizer.ts:94` 用 `## ` 标题数作为 `chapters` 字段值，实测输出 `"chapters": 67`，实际只有 15 章。

### 方案

改名为 `level2Headings`，或按章节切分逻辑正确统计章数。

---

## Bug 3 — 死代码清理

### 问题

`orchestrator.ts:135` 检查 `task.failureReason === 'rate_limited'`，但全代码库没有任何地方给 `task.failureReason` 赋值。这个分支永远不会执行，是死代码。

Bug 51 修复后，429 走通用失败路径 → fixer 拾取 → round 递增，实际不会死锁。

### 方案

直接删除 `task.failureReason === 'rate_limited'` 分支。

**当前代码**（orchestrator.ts:135-149）：
```typescript
if (task.failureReason === 'rate_limited') {
  chapter.status = 'pending';  // 死代码
} else if (chapter.consecutiveFailures >= 5) {
  ...
}
```

**改为**：
```typescript
if (chapter.consecutiveFailures >= 5) {
  ...
}
```

### 实施信息

| 项 | 值 |
|---|---|
| 改动文件 | `src/writing/orchestrator.ts` |
| 改动行数 | ~5 行删除 |
| 风险 | 低 |

---

## Bug 48 — outline.md 多 `#` 标题导致章节丢失

### 问题

`OutlineParser` 遇到第二个 `#` 标题时 stack 被清空，后续章节丢失。sylmerp2 项目丢失 34 章（ch197-ch230）。

### 方案

**方案 A**：改解析器，允许多个 `#` 标题平级存在。

**当前行为**：
```
遇到 # 一、项目概述 → 创建根节点
  遇到 ## ch001 → 挂在根节点下 ✓
遇到 # 二、技术方案 → level=1，与根节点同级 → stack 清空
  遇到 ## ch003 → 找不到父节点 → 丢弃 ✗
```

**改为**：
```
遇到 # 一、项目概述 → 创建根节点 1
  遇到 ## ch001 → 挂在根节点 1 下 ✓
遇到 # 二、技术方案 → 创建根节点 2（不覆盖根节点 1）
  遇到 ## ch003 → 挂在根节点 2 下 ✓
```

**实现思路**：
- 创建一个虚拟的「文档根节点」作为所有 `#` 标题的父节点
- 多个 `#` 标题作为虚拟根的子节点平级存在
- 或者：把多个 `#` 标题的内容合并到同一个根节点下

### 实施信息

| 项 | 值 |
|---|---|
| 改动文件 | `src/organize/outline-parser.ts` |
| 改动行数 | ~20 行 |
| 风险 | 中（需要测试多种大纲格式） |
| 验证方式 | 添加测试用例：多个 `#` 标题的大纲 |

---

## 实施信息汇总

| Bug | 改动文件 | 改动行数 | 风险 |
|-----|---------|---------|------|
| Bug 4/5/6 | `src/writing/task-executor.ts` | ~15 处 prompt 文本 | 低 |
| Bug 3 | `src/writing/orchestrator.ts` | ~5 行删除 | 低 |
| Bug 48 | `src/organize/outline-parser.ts` | ~20 行 | 中 |

**总改动**：3 个文件，约 40 行
