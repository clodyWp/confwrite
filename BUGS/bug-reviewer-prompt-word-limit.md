# Bug: Reviewer Prompt 审阅标准与大纲预算不一致

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Reviewer Prompt, Phase 4b (审阅)  
**严重程度**: P0 - 阻塞

## 问题描述

Reviewer 的审阅标准与大纲预算**完全矛盾**：

- **大纲预算**：5000-8000 字（8000 是**上限**）
- **Reviewer 检查**：≥ 8000 字（8000 是**下限**）

导致 Writer 为了满足 Reviewer 的"≥ 8000 字"要求，拼命写长内容，最终所有章节都远超预算。

## 复现步骤

1. 执行 E2E 测试（LMERP2V2-v6）
2. 大纲生成：每章预算 5000-8000 字
3. Reviewer prompt 中写："本节正文合计是否 ≥ 8000 字"
4. Writer 写了 15,270 字
5. Reviewer 说"远超8000字下限"，verdict: accept
6. 实际上 8000 字是**上限**，15,270 字超标 1.9 倍

## 实际数据

### 大纲预算

```markdown
ch001 项目目标
字数预算: 5000-8000字
```

### Reviewer Prompt

```markdown
### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ 8000 字**
- 如果整节合计不足，必须标记为 revise
```

### 矛盾对比

| 项目 | 大纲预算 | Reviewer 检查 |
|------|---------|--------------|
| 下限 | 5000 字 | 8000 字 ❌ |
| 上限 | 8000 字 | 未检查 ❌ |

### 实际结果

| 章节 | 实际字数 | 大纲预算 | Reviewer 判定 | 应该判定 |
|------|---------|---------|--------------|----------|
| ch001 | 15,270 | 5000-8000 | accept（"远超8000字下限"） | revise（超标 1.9x） |
| ch002 | 14,883 | 5000-8000 | accept | revise（超标 1.9x） |
| ... | ... | ... | ... | ... |
| **平均** | **17,574** | **5000-8000** | **全部 accept** | **全部 revise** |

## 根本原因

Reviewer prompt 生成逻辑错误：
1. 从大纲读取字数预算时，只提取了上限（8000）作为下限
2. 没有提取下限（5000）
3. 没有设置上限检查（≤ 8000 或 ≤ 9600）

## 影响

- **字数控制完全失效**：Writer 被误导，认为"写得越长越好"
- **文档过长**：总计 175,741 字，目标 50,000 字，超标 3.5 倍
- **资源浪费**：消耗更多 token 和时间
- **用户体验差**：生成的文档不符合预期

## 修复方案

### 修改 Reviewer Prompt 生成逻辑

在 `src/subagent/prompts/reviewer.ts` 或 task 文件生成逻辑中：

```typescript
// 从大纲读取字数预算
const wordBudget = chapter.wordBudget; // { min: 5000, max: 8000 }

// 生成正确的审阅标准
const reviewCriteria = `
### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否在 ${wordBudget.min}-${wordBudget.max} 字范围内**
- **下限检查**：如果整节合计 < ${wordBudget.min} 字，必须标记为 revise
- **上限检查**：如果整节合计 > ${wordBudget.max * 1.2} 字（允许 20% 浮动），必须标记为 revise
- 示例（下限）："本节当前约 3000 字，距下限还差约 2000 字，请扩充"
- 示例（上限）："本节当前约 15000 字，超出上限约 7000 字，请压缩到 ${wordBudget.max} 字以内"
`;
```

### 修改 verdict 判定逻辑

```markdown
## 决定标准

- **accept**: 无 high 问题，且 medium ≤ 3 条。**字数在预算范围内**（${min}-${max * 1.2}）。
- **revise**: 有 high 问题，或 medium > 3 条。**或字数超出预算范围**。
- **reject**: 大量 high 问题（≥3），或内容严重注水/错误、结构混乱。**或字数严重超标（> ${max * 1.5}）**。
```

## 验证方法

修复后执行 E2E 测试：
1. 大纲预算：5000-8000 字
2. Writer 生成内容
3. Reviewer 检查字数是否在 5000-9600 范围内
4. 如果超出，标记为 revise
5. 最终文档字数应接近目标（50,000 字）

## 相关文件

- `src/subagent/prompts/reviewer.ts` - Reviewer prompt 生成
- `src/dispatcher/task-generator.ts` - task 文件生成
- `src/outline/parser.ts` - 大纲解析（提取字数预算）

## 关联问题

- `bug-word-count-exceeded.md` - Writer 字数超标（现象）
- `bug-reviewer-word-count.md` - Reviewer 发现超标但仍然 accept（下游问题）
- **本 bug** - Reviewer prompt 审阅标准与大纲预算矛盾（根因）

## 复现步骤

1. 执行 E2E 测试（LMERP2V2-v6）
2. Writer 生成 ch001，实际字数 15,270（预算 5,000-8,000）
3. Reviewer 审阅 ch001
4. 检查 task 文件中的审阅标准：
   ```
   ### 3. 内容深度（重点检查）
   
   **篇幅检查**（Reviewer 核心职责）：
   - **本节（整个章节）正文合计是否 ≥ 8000 字**
   - 如果整节合计不足，必须标记为 revise
   ```
5. 没有提到上限检查

## 实际数据

### Reviewer Prompt 中的篇幅检查

```markdown
### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ 8000 字** —— 按整节合计衡量，**不按**内部小节（## 或 ###）分别计算
- 如果整节合计不足，必须标记为 revise，并给出**实际字数与差额**，明确指出**需要扩充多少字**
- 示例："本节当前约 5000 字，距下限还差约 3000 字，可补充采集流程、技术选型、性能优化等内容"
  （注意：**按整节合计判断**，不要把「某个小节没写够」当作不达标的理由）
```

### 缺失的内容

没有提到：
- 字数上限（如 ≤ 8000 字的 1.2 倍 = 9600 字）
- 超标时的处理方式（标记为 revise，要求压缩）

### Reviewer 的实际行为

ch001 审阅结果：
```json
{
  "verdict": "accept",
  "summary": "本章作为项目目标章节，整体质量较高。全文约15000字符（中文字符约9900字），远超8000字下限。..."
}
```

Reviewer 在 summary 中提到"远超8000字下限"，但没有将其视为问题，仍然 accept。

## 根本原因

Reviewer prompt 设计缺陷：
1. 只关注"内容不足"问题（下限检查）
2. 忽略了"内容过长"问题（上限检查）
3. 字数预算是双向的（min-max），但 prompt 只实现了单向检查

## 影响

- **字数控制完全失效**：Writer 可以无限制地写长内容，Reviewer 不会拦截
- **文档过长**：总计 175,741 字，目标 50,000 字，超标 3.5 倍
- **资源浪费**：消耗更多 token 和时间
- **与 bug-word-count-exceeded.md 和 bug-reviewer-word-count.md 的关系**：
  - bug-word-count-exceeded.md：Writer 字数超标（现象）
  - bug-reviewer-word-count.md：Reviewer 发现超标但仍然 accept（下游问题）
  - **本 bug**：Reviewer prompt 只检查下限，未检查上限（根因）

## 修复方案

### 修改 Reviewer Prompt

在 `src/subagent/prompts/reviewer.ts` 或 task 文件生成逻辑中，添加上限检查：

```markdown
### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否在 5000-8000 字范围内**
- **下限检查**：如果整节合计 < 5000 字，必须标记为 revise，并给出**实际字数与差额**
- **上限检查**：如果整节合计 > 9600 字（8000 字的 1.2 倍），必须标记为 revise，并给出**实际字数与超出量**，明确指出**需要压缩多少字**
- 示例（下限）："本节当前约 3000 字，距下限还差约 2000 字，可补充采集流程、技术选型、性能优化等内容"
- 示例（上限）："本节当前约 15000 字，超出上限约 5400 字，请压缩到 8000 字以内。建议删除冗余描述、合并重复内容、精简案例说明"
  （注意：**按整节合计判断**，不要把「某个小节写太长」当作不达标的理由）
```

### 修改 verdict 判定逻辑

在决定标准中添加：

```markdown
## 决定标准

- **accept**: 无 high 问题，且 medium ≤ 3 条。字数在预算范围内（5000-9600 字）。
- **revise**: 有 high 问题，或 medium > 3 条。**或字数超出预算范围（< 5000 或 > 9600）**。
- **reject**: 大量 high 问题（≥3），或内容严重注水/错误、结构混乱。**或字数严重超标（> 12000 字）**。
```

## 验证方法

修复后执行 E2E 测试：
1. Writer 生成超预算的章节（如 15,000 字）
2. Reviewer 检查字数，发现超出上限
3. Reviewer 标记为 revise，要求压缩
4. Fixer 压缩字数到预算范围内
5. 重新审阅，verdict 为 accept

## 相关文件

- `src/subagent/prompts/reviewer.ts` - Reviewer prompt 生成
- `src/dispatcher/task-generator.ts` - task 文件生成
- `knowledge/reviewer-knowledge.md` - Reviewer 知识库

## 关联问题

- `bug-word-count-exceeded.md` - Writer 字数超标（现象）
- `bug-reviewer-word-count.md` - Reviewer 发现超标但仍然 accept（下游问题）
- **本 bug** - Reviewer prompt 只检查下限，未检查上限（根因）
