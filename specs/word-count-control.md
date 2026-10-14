# Spec: 字数控制 (Word Count Control)

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **源码**: `src/writing/output-validator.ts`, `src/writing/task-executor.ts`, `src/writing/orchestrator.ts`  
> **关联 Issue**: #96 — 字数截断方案导致恶性循环  
> **状态**: 草案（待实现）

---

## 1. 问题背景

### 1.1 当前实现的恶性循环

```
Writer 产出 12000 字（上限 8000）
  → OutputValidator 硬性截断至 ~7600 字（丢失 Section 1.5 等内容）
  → Reviewer 发现内容缺失/不完整，verdict = revise
  → Fixer 尝试补全缺失内容 + 保留原有内容 → 产出 14500 字（+82% 超标）
  → OutputValidator 再次截断 → 再次丢失内容
  → 循环重复，直到 maxRounds 耗尽
```

### 1.2 根因分析

| 根因 | 位置 | 描述 |
|------|------|------|
| R1: 硬性截断破坏内容结构 | `output-validator.ts:truncateContent()` | 按字符位置截断，可能截掉整个 section，导致内容不完整 |
| R2: 截断后无标记传递给下游 | `output-validator.ts` → `orchestrator.ts` | Reviewer 不知道内容被截断，按"内容不完整"处理 |
| R3: Fixer 无历史字数约束 | `task-executor.ts:generateFixPrompt()` | Fixer 只看到"补全缺失"，不知道之前因截断导致的问题 |
| R4: 超标容忍度阶梯缺失 | `output-validator.ts` | 只有 >20% 截断和 ≤20% 报错两种处理，没有渐进策略 |
| R5: Writer prompt 字数控制策略无效 | `task-executor.ts:generateWriterPrompt()` | 仅靠 prompt 指令控制字数，LLM 经常超标 30-50% |

---

## 2. 设计原则

1. **不截断**：永远不硬性截断 Writer/Fixer 产出。截断会破坏内容结构，导致下游恶性循环。
2. **渐进响应**：根据超标程度采取不同措施（警告 → 要求精简 → 降级接受）。
3. **信息透明**：将字数检查结果完整传递给 Reviewer 和 Fixer，避免信息不对称。
4. **循环收敛**：每轮修复必须使字数更接近目标范围，而非振荡发散。
5. **兜底接受**：超过最大轮次后，只要内容基本完整（无空 section），即使字数超标也应接受。

---

## 3. 行为规格（不变量）

### SM-WC-1: 禁止硬性截断

**前置条件**：Writer 或 Fixer 产出了章节草稿文件  
**不变量**：`OutputValidator` 不得修改草稿文件内容。无论字数超标多少，都不得截断、删除或修改文件内容。  
**后置条件**：草稿文件内容与 Writer/Fixer 写入时完全一致。  
**验证方式**：验证前后文件 checksum 一致。

```typescript
// 伪代码
const beforeHash = hash(readFileSync(filePath));
validator.validate(task, round, wordBudget);
const afterHash = hash(readFileSync(filePath));
assert(beforeHash === afterHash); // SM-WC-1: 验证器不得修改文件
```

---

### SM-WC-2: 渐进式超标响应

**前置条件**：字数检查结果已知（actual, min, max）  
**不变量**：超标响应必须按以下阶梯执行，不得跳级：

| 超标比例 | 响应级别 | 动作 |
|----------|---------|------|
| 0% ~ 15% | `mild` | 记录警告，**不**影响验证结果。verdict 可以为 accept。 |
| 15% ~ 30% | `moderate` | 验证结果标记 `wordCountWarning`，Reviewer 必须返回 revise。 |
| 30% ~ 50% | `severe` | 验证结果标记 `wordCountError`，Reviewer 必须返回 revise，Fixer prompt 附带压缩指令。 |
| > 50% | `critical` | 验证结果标记 `wordCountCritical`，Reviewer 必须返回 revise，Fixer prompt 附带**强制压缩指令 + 目标字数**。 |

**后置条件**：响应级别与超标比例严格对应。  
**边界情况**：
- 超标恰好 15% → `mild`（含下界）
- 超标恰好 30% → `moderate`
- 超标恰好 50% → `severe`

```typescript
function classifyOverage(actual: number, max: number): OverageLevel {
  const ratio = (actual - max) / max;
  if (ratio <= 0.15) return 'mild';
  if (ratio <= 0.30) return 'moderate';
  if (ratio <= 0.50) return 'severe';
  return 'critical';
}
```

---

### SM-WC-3: 字数检查信息传递给 Reviewer

**前置条件**：Writer 产出已通过 `OutputValidator` 验证  
**不变量**：传递给 Reviewer prompt 的信息必须包含：
1. 实际字数（`actual`）
2. 字数范围（`min`-`max`）
3. 超标/不足量（`delta`）
4. 超标级别（`overageLevel`，来自 SM-WC-2）

Reviewer 必须根据这些**程序化测量结果**做出判断，而非自行估算字数。  
**后置条件**：Reviewer prompt 中包含 `## 字数检查结果（程序测量，不可忽略）` 段落。

---

### SM-WC-4: Fixer 字数收敛约束

**前置条件**：Fixer 收到修复任务，上一版本字数已知  
**不变量**：Fixer prompt 必须包含以下信息：
1. 上一版本的实际字数
2. 目标字数范围（`min`-`max`）
3. **需要减少/增加的字数量**（`delta`）
4. **历史字数轨迹**（如果有多轮修复，列出每轮的字数变化）

Fixer 的修复方向必须使字数**更接近**目标范围，而非远离。  
**后置条件**：Fixer prompt 包含 `## 字数修复目标` 段落，明确告知需要压缩/扩充多少字。

```typescript
// 历史轨迹示例
字数历史：
- v1: 12000 字（超标 50%）
- v2: 14500 字（超标 81%，修复后反而更多）
目标：v3 必须 ≤ 9200 字（max 8000 + 15% 容忍）
```

---

### SM-WC-5: 循环收敛守护

**前置条件**：章节进入第 N 轮审阅循环（N ≥ 2）  
**不变量**：如果连续 2 轮修复后字数都**没有更接近**目标范围，系统必须触发**收敛干预**：
1. 在 Fixer prompt 中附加**强制压缩指令**，明确目标字数上限
2. 如果第 3 轮仍未收敛，标记章节为 `completed_with_issues`（降级接受）

**收敛判定**：
```typescript
function isConverging(history: number[], min: number, max: number): boolean {
  if (history.length < 2) return true;
  const prev = Math.abs(history[history.length - 2] - midpoint(min, max));
  const curr = Math.abs(history[history.length - 1] - midpoint(min, max));
  return curr < prev; // 当前轮更接近目标
}
```

**后置条件**：章节不会无限循环在 writer→reviewer→fixer 之间。

---

### SM-WC-6: 内容完整性保护

**前置条件**：章节草稿文件已生成  
**不变量**：验证器必须检查内容结构完整性，而不仅检查字数：
1. 不得存在**空 section**（标题下无内容，或内容 < 50 字）
2. 不得存在**被截断标记**（`<!-- 内容已截断 -->`）
3. Markdown 标题层级必须完整（不得跳级）

如果内容不完整，即使字数在范围内，也应标记为 `structuralError`。  
**后置条件**：`ValidationResult.checks` 包含 `结构完整性` 检查项。

---

### SM-WC-7: 字数不足响应（对称设计）

**前置条件**：字数检查结果已知  
**不变量**：字数不足的响应也按阶梯处理：

| 不足比例 | 响应级别 | 动作 |
|----------|---------|------|
| 0% ~ 10% | `mild` | 记录警告，不影响验证结果 |
| 10% ~ 25% | `moderate` | Reviewer 必须返回 revise |
| > 25% | `severe` | Reviewer 必须返回 revise，Fixer prompt 附带扩充指令 |

**注意**：字数不足的容忍度比超标更宽松（因为不足不会破坏已有内容）。

---

### SM-WC-8: 降级接受条件

**前置条件**：章节已达到 `maxRounds` 限制  
**不变量**：降级接受的条件为：
1. 内容结构完整（SM-WC-6 通过）
2. 字数超标 ≤ 50%（即 actual ≤ max * 1.5）
3. 不存在空 section

如果满足以上条件，章节标记为 `completed`，`failureReason` 设为 `completed_with_word_count_overage`。  
如果不满足，章节标记为 `failed`。

**后置条件**：不会因字数问题无限循环。

---

### SM-WC-9: 字数统计一致性

**前置条件**：多处需要统计同一文件的字数  
**不变量**：所有字数统计必须使用**同一方法**（`content.length`，即 UTF-16 code unit count）。  
**禁止**：不同模块使用不同的统计方法（如有的用 `content.length`，有的用正则匹配中文字符）。  
**后置条件**：Writer prompt、Reviewer prompt、Fixer prompt、OutputValidator 中的字数一致。

---

### SM-WC-10: 超标日志可追溯

**前置条件**：字数检查完成  
**不变量**：每次字数检查必须通过 EventBus 发射诊断事件，包含：
- `chapterId`
- `actual`（实际字数）
- `min` / `max`（预算范围）
- `overageLevel`（超标级别）
- `round`（当前轮次）
- `taskType`（writer/reviewer/fixer）

**后置条件**：日志中可追溯每个章节每轮的字数变化轨迹。

---

## 4. 接口设计

### 4.1 新增类型

```typescript
/** 超标级别 */
export type OverWordCountLevel = 'mild' | 'moderate' | 'severe' | 'critical';

/** 字数检查结果 */
export interface WordCountCheckResult {
  actual: number;
  min: number;
  max: number;
  expected: number;          // (min + max) / 2
  overageRatio: number;      // (actual - max) / max，负数表示不足
  underageRatio: number;     // (min - actual) / min，负数表示超标
  level: OverWordCountLevel; // 超标级别
  status: 'within' | 'mild_over' | 'moderate_over' | 'severe_over' | 'critical_over'
              | 'mild_under' | 'moderate_under' | 'severe_under';
  converging: boolean;       // 是否在收敛（需要历史数据）
}

/** 字数历史轨迹 */
export interface WordCountHistory {
  chapterId: string;
  entries: Array<{
    round: number;
    taskType: 'writer' | 'fixer';
    actual: number;
    level: OverWordCountLevel;
  }>;
}
```

### 4.2 修改 `OutputValidator`

```typescript
// 移除 truncateContent() 方法
// 修改 validateWriterOutput()：
//   - 不再截断文件
//   - 使用 classifyOverage() 返回超标级别
//   - 新增结构完整性检查
//   - 通过 EventBus 发射字数诊断事件

// 新增方法：
classifyOverage(actual: number, max: number): OverWordCountLevel
checkStructuralIntegrity(content: string): { valid: boolean; errors: string[] }
```

### 4.3 修改 `TaskExecutor`

```typescript
// generateReviewerPrompt() 新增参数：
//   wordCountResult: WordCountCheckResult  // 程序测量的字数结果

// generateFixPrompt() 新增参数：
//   wordCountHistory: WordCountHistory     // 字数历史轨迹
//   convergenceInfo: {                     // 收敛信息
//     isConverging: boolean;
//     roundsSinceConverging: number;
//     forcedMax?: number;                  // 强制上限（收敛干预时）
//   }
```

### 4.4 修改 `ChapterState`（schema）

```typescript
// 新增字段：
wordCountHistory: Type.Optional(Type.Array(
  Type.Object({
    round: Type.Number(),
    actual: Type.Number(),
    level: Type.String(),
  })
)),
```

### 4.5 修改 `WritingOrchestrator`

```typescript
// updateChapterStatus() 中：
//   - reviewer 成功后，将字数结果写入 wordCountHistory
//   - 检查收敛性（SM-WC-5）
//   - 如果连续 2 轮不收敛，触发收敛干预
//   - 如果达到 maxRounds，按 SM-WC-8 降级接受
```

---

## 5. 测试设计

### 5.1 测试文件

`tests/writing/word-count-control.test.ts`

### 5.2 测试用例列表

#### TC-WC-1: SM-WC-1 — 验证器不修改文件内容

| 项目 | 内容 |
|------|------|
| **给定** | Writer 产出 12000 字的草稿文件，wordBudget = { min: 5000, max: 8000 } |
| **当** | 调用 `validator.validate(task, round, wordBudget)` |
| **期望** | 文件内容与验证前完全一致（字节级比较），验证结果中不包含 `字数截断` 检查项 |

#### TC-WC-2: SM-WC-2 — mild 超标（≤15%）

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 9000 字，wordBudget = { min: 5000, max: 8000 }（超标 12.5%） |
| **当** | 调用字数分类函数 |
| **期望** | level = 'mild'，验证通过（无 errors） |

#### TC-WC-3: SM-WC-2 — moderate 超标（15%~30%）

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 10000 字，wordBudget = { min: 5000, max: 8000 }（超标 25%） |
| **当** | 调用字数分类函数 |
| **期望** | level = 'moderate'，验证结果包含 wordCountWarning |

#### TC-WC-4: SM-WC-2 — severe 超标（30%~50%）

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 12000 字，wordBudget = { min: 5000, max: 8000 }（超标 50%） |
| **当** | 调用字数分类函数 |
| **期望** | level = 'severe'，验证结果包含 wordCountError |

#### TC-WC-5: SM-WC-2 — critical 超标（>50%）

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 15000 字，wordBudget = { min: 5000, max: 8000 }（超标 87.5%） |
| **当** | 调用字数分类函数 |
| **期望** | level = 'critical'，验证结果包含 wordCountCritical |

#### TC-WC-6: SM-WC-2 — 边界值：恰好 15%

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 9200 字，max = 8000（超标恰好 15%） |
| **当** | 调用字数分类函数 |
| **期望** | level = 'mild'（含下界） |

#### TC-WC-7: SM-WC-6 — 空 section 检测

| 项目 | 内容 |
|------|------|
| **给定** | 草稿包含 `## Section 1.5\n\n## Section 1.6`（1.5 下无内容） |
| **当** | 调用 `checkStructuralIntegrity(content)` |
| **期望** | valid = false，errors 包含 "空 section: Section 1.5" |

#### TC-WC-8: SM-WC-6 — 截断标记检测

| 项目 | 内容 |
|------|------|
| **给定** | 草稿包含 `<!-- 内容已截断以符合字数要求 -->` |
| **当** | 调用 `checkStructuralIntegrity(content)` |
| **期望** | valid = false，errors 包含 "检测到截断标记" |

#### TC-WC-9: SM-WC-5 — 收敛守护：连续 2 轮不收敛

| 项目 | 内容 |
|------|------|
| **给定** | 字数历史 = [12000, 14500]，目标范围 5000-8000 |
| **当** | 调用 `isConverging(history, min, max)` |
| **期望** | converging = false，触发收敛干预 |

#### TC-WC-10: SM-WC-5 — 收敛守护：正常收敛

| 项目 | 内容 |
|------|------|
| **给定** | 字数历史 = [12000, 9500]，目标范围 5000-8000 |
| **当** | 调用 `isConverging(history, min, max)` |
| **期望** | converging = true |

#### TC-WC-11: SM-WC-8 — 降级接受：超标但结构完整

| 项目 | 内容 |
|------|------|
| **给定** | 章节达到 maxRounds，实际字数 10000（超标 25%），结构完整 |
| **当** | 调用 `updateChapterStatus()` |
| **期望** | 章节状态 = 'completed'，failureReason = 'completed_with_word_count_overage' |

#### TC-WC-12: SM-WC-8 — 降级失败：超标过多

| 项目 | 内容 |
|------|------|
| **给定** | 章节达到 maxRounds，实际字数 15000（超标 87.5%），结构完整 |
| **当** | 调用 `updateChapterStatus()` |
| **期望** | 章节状态 = 'failed' |

#### TC-WC-13: SM-WC-8 — 降级失败：存在空 section

| 项目 | 内容 |
|------|------|
| **给定** | 章节达到 maxRounds，实际字数 9000（超标 12.5%），但存在空 section |
| **当** | 调用 `updateChapterStatus()` |
| **期望** | 章节状态 = 'failed' |

#### TC-WC-14: SM-WC-7 — 字数不足 mild

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 4600 字，wordBudget = { min: 5000, max: 8000 }（不足 8%） |
| **当** | 调用字数分类函数 |
| **期望** | status = 'mild_under'，验证通过（无 errors） |

#### TC-WC-15: SM-WC-7 — 字数不足 moderate

| 项目 | 内容 |
|------|------|
| **给定** | 草稿 4000 字，wordBudget = { min: 5000, max: 8000 }（不足 20%） |
| **当** | 调用字数分类函数 |
| **期望** | status = 'moderate_under'，验证结果包含字数不足警告 |

#### TC-WC-16: SM-WC-9 — 字数统计一致性

| 项目 | 内容 |
|------|------|
| **给定** | 一段包含中英文混合的文本 |
| **当** | 在不同模块中统计字数 |
| **期望** | 所有模块返回相同的字数（`content.length`） |

#### TC-WC-17: SM-WC-10 — 字数诊断事件发射

| 项目 | 内容 |
|------|------|
| **给定** | 配置了 EventBus，Writer 产出草稿 |
| **当** | 调用 `validator.validate(task, round, wordBudget)` |
| **期望** | EventBus 收到 `word.count.check` 事件，包含 chapterId/actual/min/max/level/round |

#### TC-WC-18: SM-WC-4 — Fixer prompt 包含字数历史

| 项目 | 内容 |
|------|------|
| **给定** | 字数历史 = [{ round: 1, actual: 12000 }, { round: 2, actual: 14500 }] |
| **当** | 调用 `generateFixPrompt(task, content, review, round, wordBudget, wordCountHistory)` |
| **期望** | prompt 中包含 "字数历史" 段落，列出每轮字数变化 |

#### TC-WC-19: 回归 — 旧截断测试应被移除/替换

| 项目 | 内容 |
|------|------|
| **给定** | `tests/writing/word-count-truncation.test.ts` 存在 |
| **当** | 实现新方案后 |
| **期望** | 旧测试文件被删除或重写为新的 `word-count-control.test.ts`，不再测试截断行为 |

#### TC-WC-20: SM-WC-3 — Reviewer prompt 包含程序测量结果

| 项目 | 内容 |
|------|------|
| **给定** | Writer 产出 10000 字，wordBudget = { min: 5000, max: 8000 } |
| **当** | 调用 `generateReviewerPrompt(task, content, baseline, round, knowledge, projectDir, wordBudget, wordCountResult)` |
| **期望** | prompt 中包含 "## 字数检查结果（程序测量，不可忽略）" 段落，含 actual=10000, level=moderate |

---

## 6. 实现要点

### 6.1 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/writing/output-validator.ts` | ① 删除 `truncateContent()` 方法 ② 新增 `classifyOverage()` ③ 新增 `checkStructuralIntegrity()` ④ 修改 `validateWriterOutput()` 移除截断逻辑 ⑤ 通过 EventBus 发射字数事件 |
| `src/writing/task-executor.ts` | ① `generateReviewerPrompt()` 增加 `wordCountResult` 参数 ② `generateFixPrompt()` 增加 `wordCountHistory` 和 `convergenceInfo` 参数 ③ 更新 prompt 模板 |
| `src/writing/orchestrator.ts` | ① `updateChapterStatus()` 中记录字数历史 ② 实现收敛检测 ③ 实现降级接受逻辑（SM-WC-8） |
| `src/state/schema.ts` | `ChapterState` 新增 `wordCountHistory` 字段 |
| `src/dispatcher/index.ts` | 传递 `wordCountResult` 和 `wordCountHistory` 给 prompt 生成函数 |
| `src/config/loader.ts` | 新增超标阈值配置（替代硬编码的 20%） |

### 6.2 需要新增的文件

| 文件 | 内容 |
|------|------|
| `specs/word-count-control.md` | 本 spec 文件 |
| `tests/writing/word-count-control.test.ts` | 新测试文件，覆盖 SM-WC-1 到 SM-WC-10 |

### 6.3 需要删除的文件

| 文件 | 原因 |
|------|------|
| `tests/writing/word-count-truncation.test.ts` | 截断功能已移除，旧测试不再适用 |

### 6.4 配置新增

```typescript
// config/loader.ts — WritingConfigSchema 新增
wordCountThresholds: Type.Optional(Type.Object({
  mildOver: Type.Number({ default: 0.15 }),      // 15%
  moderateOver: Type.Number({ default: 0.30 }),   // 30%
  severeOver: Type.Number({ default: 0.50 }),     // 50%
  mildUnder: Type.Number({ default: 0.10 }),      // 10%
  moderateUnder: Type.Number({ default: 0.25 }),  // 25%
})),
```

---

## 7. 迁移策略

### 7.1 向后兼容

- `wordCountHistory` 字段为 Optional，旧状态文件无需迁移
- `wordCountThresholds` 配置为 Optional，缺失时使用默认值
- 旧测试文件 `word-count-truncation.test.ts` 在实现完成后删除

### 7.2 实现顺序

1. **Phase 1**：删除截断逻辑 + 新增 `classifyOverage()` + 基础测试（SM-WC-1, SM-WC-2）
2. **Phase 2**：新增结构完整性检查（SM-WC-6）+ 字数不足响应（SM-WC-7）
3. **Phase 3**：信息传递（SM-WC-3, SM-WC-4）+ Reviewer/Fixer prompt 更新
4. **Phase 4**：收敛守护（SM-WC-5）+ 降级接受（SM-WC-8）
5. **Phase 5**：日志可追溯（SM-WC-10）+ 配置化

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 不截断导致最终文档字数过大 | DOCX 文件过大，排版不佳 | 组装阶段（Phase 6）可做最终精简，但不影响写作循环 |
| LLM 持续无法控制字数 | 循环达到 maxRounds | 降级接受（SM-WC-8）+ 组装阶段精简 |
| 结构完整性检查误判 | 正常内容被标记为不完整 | 阈值设为 50 字（一个短段落），避免误判 |
| 字数历史增加状态文件大小 | 存储开销 | 每个条目仅 ~30 字节，5 轮 = 150 字节，可忽略 |

---

## 9. 验收标准

1. `npm test` 通过，包含 `word-count-control.test.ts` 的所有测试用例
2. 不再存在 `truncateContent()` 方法或其调用
3. 超标 50% 的草稿不会被截断，而是通过渐进响应处理
4. Fixer prompt 中包含字数历史轨迹
5. 连续 2 轮不收敛时触发干预，3 轮时降级接受
6. EventBus 日志中可追溯每轮字数变化
