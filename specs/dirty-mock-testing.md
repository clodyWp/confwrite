# Spec: Dirty Mock Testing — 脏输出系统韧性测试

> **版本**: 1.0  
> **日期**: 2026-01-15  
> **源码**: `src/scheduler/mock-executor.ts`, `src/scheduler/configurable-mock-executor.ts`, `src/writing/output-validator.ts`, `src/writing/task-executor.ts`, `src/scheduler/runner.ts`  
> **关联 Issue**: #87  
> **状态**: 草案

---

## 1. 目的

真实 LLM 的输出不可靠：JSON 可能格式错误、输出可能为空、内容可能超长、偶尔出现乱码或超时。当前 `MockSubagentExecutor` 和 `ConfigurableMockExecutor` 只生成干净输出，无法测试系统在这些脏场景下的容错能力。

本 spec 定义：
1. **脏输出类型分类**（6 类）
2. **系统对每种脏输出的预期行为**（不变量）
3. **DirtyMockExecutor 接口设计**
4. **测试套件结构**

---

## 2. 脏输出类型定义

| ID | 类型 | 描述 | 触发方式 | 影响任务类型 |
|----|------|------|---------|-------------|
| DIRTY-1 | **JSON 格式错误** | Reviewer 输出的 JSON 有语法错误（未闭合括号、单引号、尾逗号、注释） | `dirtyMode: 'bad_json'` | reviewer |
| DIRTY-2 | **空输出** | 执行器返回空字符串或 null，不写文件 | `dirtyMode: 'empty'` | writer, reviewer, fixer |
| DIRTY-3 | **超长输出** | Writer 输出远超字数上限（如 3x max） | `dirtyMode: 'oversized'` | writer, fixer |
| DIRTY-4 | **乱码/编码损坏** | 输出包含 `\uFFFD`、控制字符、非 UTF-8 字节 | `dirtyMode: 'garbled'` | writer, fixer |
| DIRTY-5 | **超时** | 执行器在指定时间后抛出超时异常 | `dirtyMode: 'timeout'` | writer, reviewer, fixer |
| DIRTY-6 | **矛盾审阅** | Reviewer verdict=accept 但 issues 中提到字数超标 | `dirtyMode: 'contradictory_review'` | reviewer |

---

## 3. 行为不变量

### 3.1 通用不变量

| ID | 不变量 | 验证方式 |
|----|--------|---------|
| INV-DM-1 | **系统不得因脏输出而崩溃**（进程不得退出、未捕获异常不得传播到顶层） | 每种脏输出场景下 `runner.runUntilIdle()` 必须正常返回 `RunResult` |
| INV-DM-2 | **脏输出必须被检测并记录**（`OutputValidator.validate()` 必须返回 `valid: false`，且 `errors` 非空） | 断言 `result.valid === false && result.errors.length > 0` |
| INV-DM-3 | **连续脏输出必须触发章节失败**（连续 5 次 validation_failed 后 chapter.status === 'failed'） | 注入 5+ 次脏输出后断言 `chapter.status === 'failed'` |
| INV-DM-4 | **脏输出不得污染其他章节**（一个章节的脏输出不影响其他章节的正常流程） | 多章节场景中，仅被注入脏输出的章节受影响 |

### 3.2 各类型不变量

#### DIRTY-1: JSON 格式错误

| ID | 不变量 |
|----|--------|
| INV-DM-1a | `OutputValidator.tryFixJSON()` 必须尝试修复常见 JSON 错误（中文引号、注释） |
| INV-DM-1b | 无法修复的 JSON 错误 → `validate()` 返回 `valid: false`，errors 包含 "JSON 格式错误" |
| INV-DM-1c | `parseReviewDecision()` 在 JSON 解析失败后必须 fallback 到文本提取 |
| INV-DM-1d | 文本提取也失败时，默认返回 `{ decision: 'revise', confidence: 0 }`（安全侧） |
| INV-DM-1e | JSON 格式错误触发 validation_failed 路径，章节进入修复循环（不直接标记 failed） |

#### DIRTY-2: 空输出

| ID | 不变量 |
|----|--------|
| INV-DM-2a | Writer 空输出 → `validateWriterOutput()` 检测到文件不存在或 size=0，返回 `valid: false` |
| INV-DM-2b | Reviewer 空输出 → `validateReviewerOutput()` 检测到 JSON 文件不存在或为空，返回 `valid: false` |
| INV-DM-2c | Fixer 空输出 → `validateFixerOutput()` 检测新版本文件不存在，返回 `valid: false` |
| INV-DM-2d | 空输出导致 execution_failed（无产物），章节 status 变为 `pending`（重试 writer） |
| INV-DM-2e | 连续 5 次空输出后章节标记为 `failed`，failureReason 为 `no_output` |

#### DIRTY-3: 超长输出

| ID | 不变量 |
|----|--------|
| INV-DM-3a | Writer 超长输出（> max * 1.2）→ `OutputValidator` 尝试截断到上限 |
| INV-DM-3b | 截断后文件字数在 `[min, max]` 范围内，或至少接近 max（±5%） |
| INV-DM-3c | 截断必须在段落或句子边界处进行，不得在词中间截断 |
| INV-DM-3d | 截断后文件末尾包含 `<!-- 内容已截断以符合字数要求 -->` 标记 |
| INV-DM-3e | 超长但 ≤ max * 1.2 的输出不截断，但标记为验证失败 |

#### DIRTY-4: 乱码/编码损坏

| ID | 不变量 |
|----|--------|
| INV-DM-4a | 包含 `\uFFFD`（替换字符）的输出 → `validate()` 检测到编码损坏，返回 `valid: false` |
| INV-DM-4b | 包含控制字符（`\x00-\x08`, `\x0B-\x0C`, `\x0E-\x1F`）的输出 → 检测到不可读，返回 `valid: false` |
| INV-DM-4c | 编码损坏检测仅检查文件前 500 字符（不扫描全文，性能考量） |
| INV-DM-4d | 编码损坏触发 validation_failed 路径，章节进入修复循环 |

#### DIRTY-5: 超时

| ID | 不变量 |
|----|--------|
| INV-DM-5a | 执行器超时 → `executor.execute()` 抛出异常或返回 `{ success: false }` |
| INV-DM-5b | 超时被视为 execution_failed（不是 validation_failed） |
| INV-DM-5c | 超时无产物 → 章节 status 变为 `pending`（重试） |
| INV-DM-5d | 连续 5 次超时 → 章节标记为 `failed`，failureReason 为 `no_output` |
| INV-DM-5e | 超时不得触发 429 限流退避逻辑（超时 ≠ 限流） |

#### DIRTY-6: 矛盾审阅

| ID | 不变量 |
|----|--------|
| INV-DM-6a | verdict=accept 但 issues 提到字数问题 → `validateReviewerOutput()` 检测矛盾，返回 `valid: false` |
| INV-DM-6b | verdict=accept 但独立字数验证发现超标/不足 → 检测矛盾，返回 `valid: false` |
| INV-DM-6c | 矛盾检测的关键词匹配：`/字数|超标|超出|上限|过多|over.*limit|exceed|too (long|much)/i` |
| INV-DM-6d | 矛盾审阅报告被拒绝后，章节进入修复循环（不盲目接受 verdict=accept） |

---

## 4. DirtyMockExecutor 接口设计

### 4.1 配置接口

```typescript
/**
 * 脏输出配置
 * 
 * 支持按任务类型独立配置脏模式，也支持全局配置。
 * 可配置概率（0.0-1.0）控制脏输出出现的频率。
 */
export interface DirtyMockConfig {
  /**
   * 全局脏模式（所有任务类型共用）
   * 如果同时设置了 per-type 配置，per-type 优先
   */
  global?: DirtyModeConfig;

  /** 按任务类型配置 */
  writer?: DirtyModeConfig;
  reviewer?: DirtyModeConfig;
  fixer?: DirtyModeConfig;

  /**
   * 超时模拟的延迟毫秒数（仅 timeout 模式使用）
   * 默认 30000ms
   */
  timeoutMs?: number;

  /**
   * 超长输出的倍数（仅 oversized 模式使用）
   * 默认 3.0（3 倍字数上限）
   */
  oversizedMultiplier?: number;

  /**
   * 序列模式：按顺序对第 N 次调用注入脏输出
   * 例如 [1, 3] 表示第 1 次和第 3 次调用注入脏输出，其余正常
   * 与概率模式互斥，序列模式优先
   */
  sequence?: number[];
}

export interface DirtyModeConfig {
  /** 脏输出类型 */
  mode: DirtyMode;
  
  /**
   * 脏输出概率（0.0-1.0）
   * 0 = 永远不脏，1 = 永远脏
   * 默认 1.0（总是脏）
   */
  probability?: number;
}

export type DirtyMode =
  | 'normal'              // 正常输出（基线）
  | 'bad_json'            // JSON 格式错误
  | 'empty'               // 空输出
  | 'oversized'           // 超长输出
  | 'garbled'             // 乱码/编码损坏
  | 'timeout'             // 超时
  | 'contradictory_review' // 矛盾审阅
  | 'mixed';              // 混合模式（随机选择上述之一）
```

### 4.2 类接口

```typescript
/**
 * DirtyMockExecutor — 模拟真实 LLM 脏输出的测试执行器
 * 
 * 实现 SubagentExecutor 接口，可注入各种脏输出场景。
 * 继承 ConfigurableMockExecutor 的正常输出能力，叠加脏输出层。
 */
export class DirtyMockExecutor implements SubagentExecutor {
  constructor(projectDir: string, dirtyConfig?: DirtyMockConfig);

  /**
   * 执行任务
   * 
   * 根据 dirtyConfig 决定是否注入脏输出：
   * 1. 检查 sequence 模式（如果配置了）
   * 2. 检查概率模式
   * 3. 如果命中脏模式，生成对应的脏输出
   * 4. 否则委托给内部 ConfigurableMockExecutor 生成正常输出
   */
  async execute(task: Task): Promise<ExecutorResult>;

  /**
   * 获取统计信息（用于测试断言）
   */
  getStats(): {
    totalCalls: number;
    dirtyOutputs: number;
    normalOutputs: number;
    byType: Record<TaskType, { dirty: number; normal: number }>;
  };

  /**
   * 重置统计计数器
   */
  resetStats(): void;
}
```

### 4.3 脏输出生成器

每种脏模式对应一个生成器函数：

```typescript
/**
 * 脏输出生成器
 * 
 * 每个生成器返回 { output, writeFile? } 对：
 * - output: ExecutorResult.output 的值
 * - writeFile: 可选，如果需要写文件到磁盘（模拟 LLM 写了脏文件）
 */
interface DirtyOutputGenerators {
  /**
   * bad_json: 生成格式错误的 JSON
   * 变体：
   * - 未闭合括号: `{"verdict": "accept", "scores": {`
   * - 单引号: `{'verdict': 'accept'}`
   * - 尾逗号: `{"verdict": "accept",}`
   * - 注释: `{"verdict": "accept" // 这是注释 }`
   * - 中文引号: `{"verdict": "accept"，"summary": "内容很好"}`
   */
  badJson(task: Task, round: number): { output: string; writeFile?: () => void };

  /**
   * empty: 返回空字符串，不写文件
   */
  empty(task: Task): { output: string };

  /**
   * oversized: 生成超长内容
   * Writer: 3x wordBudget.max 的段落
   * Fixer: 3x wordBudget.max 的段落
   */
  oversized(task: Task, round: number, multiplier: number): { output: string; writeFile: () => void };

  /**
   * garbled: 生成包含乱码的内容
   * 前 500 字符中插入 \uFFFD 和控制字符
   */
  garbled(task: Task, round: number): { output: string; writeFile: () => void };

  /**
   * timeout: 等待指定时间后抛出异常
   */
  timeout(timeoutMs: number): Promise<never>;

  /**
   * contradictory_review: verdict=accept 但 issues 提到字数超标
   */
  contradictoryReview(task: Task, round: number): { output: string; writeFile: () => void };
}
```

### 4.4 MockSubagentExecutor wordCountMode

`MockSubagentExecutor` 构造函数接受可选的 `wordCountMode` 参数，控制 writer 草稿的字数规模：

```typescript
export type WordCountMode = 'under' | 'mild' | 'severe';

export class MockSubagentExecutor implements SubagentExecutor {
  constructor(projectDir: string, options?: { wordCountMode?: WordCountMode });
}
```

| 模式 | 行为 | 目标字数（中文字符） |
|------|------|--------------------|
| `'under'` | 默认模式，生成 ~4000 字草稿（在典型 wordBudget 范围内） | ~4000 |
| `'mild'` | 轻度超预算，生成 ~6000 字草稿 | ~6000 |
| `'severe'` | 严重超预算（超预算 50%），生成 ~12000 字草稿 | ~12000 |

#### 不变量

| ID | 不变量 |
|----|--------|
| INV-WCM-1 | `wordCountMode='severe'` 时，writer 生成的草稿中文字符数 ≥ 10000（目标 12000，允许 ±20% 容差） |
| INV-WCM-2 | `wordCountMode='under'` 或未指定时，行为与原始 MockSubagentExecutor 一致（~4000 字） |
| INV-WCM-3 | `wordCountMode` 仅影响 writer 任务的草稿字数，reviewer 和 fixer 行为不变 |
| INV-WCM-4 | 草稿文件写入磁盘后，文件字数与 `task.result` 内容一致 |

---

## 5. 重试策略

### 5.1 现有重试机制（不修改）

| 层级 | 机制 | 触发条件 | 行为 |
|------|------|---------|------|
| Runner | 429 限流重试 | 输出匹配 `/429\|rate.?limit/i` | 全局暂停 + 指数退避 |
| Orchestrator | 章节修复循环 | validation_failed / execution_failed | chapter.status → pending/written → 重新执行 |
| Orchestrator | 连续失败守护 | consecutiveFailures >= 5 | chapter.status → failed |
| Orchestrator | 轮次上限守护 | chapter.round >= maxRounds | chapter.status → completed/failed |

### 5.2 脏输出场景的预期重试路径

| 脏类型 | 首次失败路径 | 重试行为 | 最终结果（如果持续脏） |
|--------|------------|---------|-------------------|
| bad_json | validation_failed | 章节进入修复循环（written → reviewer → fix → reviewer） | 5 次后 failed |
| empty | execution_failed（无产物） | chapter.status → pending，重新执行 writer | 5 次后 failed (no_output) |
| oversized | validation_failed（字数超标） | 截断尝试 → 如果仍超标则修复循环 | maxRounds 后 completed/failed |
| garbled | validation_failed（编码损坏） | 章节进入修复循环 | 5 次后 failed |
| timeout | execution_failed（无产物） | chapter.status → pending，重新执行 | 5 次后 failed (no_output) |
| contradictory_review | validation_failed（verdict 矛盾） | 章节进入修复循环 | 5 次后 failed |

---

## 6. 测试套件设计

### 6.1 文件结构

```
tests/scheduler/
  dirty-mock-executor.test.ts      # DirtyMockExecutor 单元测试
tests/writing/
  dirty-output-resilience.test.ts  # 系统韧性集成测试
```

### 6.2 单元测试：DirtyMockExecutor

**文件**: `tests/scheduler/dirty-mock-executor.test.ts`

| 测试用例 | 验证内容 |
|---------|---------|
| `creates normal output by default` | 无 dirtyConfig 时行为与 ConfigurableMockExecutor 一致 |
| `generates bad_json for reviewer` | mode='bad_json' 时 reviewer 输出无法被 JSON.parse 直接解析 |
| `generates empty output` | mode='empty' 时返回空字符串，不写文件 |
| `generates oversized output` | mode='oversized' 时 Writer 输出字数 > wordBudget.max * 2 |
| `generates garbled output` | mode='garbled' 时输出包含 \uFFFD 字符 |
| `simulates timeout` | mode='timeout' 时在 timeoutMs 后抛出异常 |
| `generates contradictory review` | mode='contradictory_review' 时 verdict=accept 但 issues 包含字数问题 |
| `respects probability=0` | probability=0 时永远不产生脏输出 |
| `respects probability=1` | probability=1 时永远产生脏输出 |
| `respects sequence pattern` | sequence=[1,3] 时仅第 1、3 次调用产生脏输出 |
| `per-type config overrides global` | writer 配置优先于 global 配置 |
| `tracks stats correctly` | getStats() 正确统计脏/正常输出次数 |
| `mixed mode produces varied outputs` | mode='mixed' 时多次调用产生不同类型的脏输出 |

### 6.3 集成测试：系统韧性

**文件**: `tests/writing/dirty-output-resilience.test.ts`

每组测试使用临时目录，构造完整的项目结构（state JSON + 素材包），通过 `SchedulerRunner` + `DirtyMockExecutor` + `OutputValidator` 组成完整管线。

#### 6.3.1 DIRTY-1: JSON 格式错误

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `bad_json: unbalanced braces → validation fails` | INV-DM-1b | `validate()` 返回 `valid: false` |
| `bad_json: tryFixJSON repairs Chinese quotes` | INV-DM-1a | 中文引号被修复后 JSON 可解析 |
| `bad_json: parseReviewDecision falls back to text` | INV-DM-1c | JSON 失败后从文本提取 decision |
| `bad_json: total parse failure → default revise` | INV-DM-1d | 返回 `{ decision: 'revise', confidence: 0 }` |
| `bad_json: chapter enters fix cycle, not immediate fail` | INV-DM-1e | chapter.status === 'written'（等待审阅）或 'pending' |
| `bad_json: 5 consecutive failures → chapter failed` | INV-DM-3 | chapter.status === 'failed' |

#### 6.3.2 DIRTY-2: 空输出

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `empty writer: no draft file → validation fails` | INV-DM-2a | `validate()` 返回 `valid: false` |
| `empty reviewer: no JSON file → validation fails` | INV-DM-2b | `validate()` 返回 `valid: false` |
| `empty fixer: no new version → validation fails` | INV-DM-2c | `validate()` 返回 `valid: false` |
| `empty writer: chapter retries (pending)` | INV-DM-2d | chapter.status === 'pending' |
| `empty writer: 5 consecutive → failed (no_output)` | INV-DM-2e | chapter.status === 'failed', failureReason === 'no_output' |

#### 6.3.3 DIRTY-3: 超长输出

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `oversized writer: truncated to max` | INV-DM-3a, INV-DM-3b | 截断后字数 ≤ max * 1.05 |
| `oversized writer: truncation at paragraph boundary` | INV-DM-3c | 截断点在 `\n\n` 处 |
| `oversized writer: truncation marker present` | INV-DM-3d | 文件末尾包含截断标记 |
| `oversized writer: mild excess (≤1.2x) not truncated` | INV-DM-3e | 不截断但标记验证失败 |
| `oversized fixer: same truncation logic applies` | INV-DM-3a | Fixer 超长输出也被截断 |

#### 6.3.4 DIRTY-4: 乱码/编码损坏

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `garbled writer: U+FFFD detected → validation fails` | INV-DM-4a | `validate()` 返回 `valid: false` |
| `garbled writer: control chars detected` | INV-DM-4b | 控制字符被检测 |
| `garbled: only first 500 chars checked` | INV-DM-4c | 前 500 字符干净但后面有乱码 → 通过 |
| `garbled: chapter enters fix cycle` | INV-DM-4d | chapter.status !== 'failed'（首次） |

#### 6.3.5 DIRTY-5: 超时

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `timeout: executor throws → task fails` | INV-DM-5a | `result.success === false` |
| `timeout: treated as execution_failed` | INV-DM-5b | failureType === 'execution_failed' |
| `timeout: chapter retries (pending)` | INV-DM-5c | chapter.status === 'pending' |
| `timeout: 5 consecutive → failed` | INV-DM-5d | chapter.status === 'failed' |
| `timeout: does not trigger rate limit backoff` | INV-DM-5e | Runner 不进入 pausedUntil 状态 |

#### 6.3.6 DIRTY-6: 矛盾审阅

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `contradictory: verdict=accept + word count issue → fails` | INV-DM-6a | `validate()` 返回 `valid: false` |
| `contradictory: independent word count check catches it` | INV-DM-6b | 独立字数验证发现矛盾 |
| `contradictory: chapter enters fix cycle` | INV-DM-6d | 不盲目接受 verdict=accept |

#### 6.3.7 通用韧性测试

| 测试用例 | 不变量 | 预期行为 |
|---------|--------|---------|
| `system does not crash on any dirty mode` | INV-DM-1 | `runUntilIdle()` 正常返回 |
| `dirty output in one chapter does not affect others` | INV-DM-4 | 其他章节正常完成 |
| `recovery after dirty mode stops` | — | 脏模式关闭后，章节在后续轮次中正常完成 |
| `stats track dirty vs normal outputs` | — | `getStats()` 正确反映脏输出次数 |

---

## 7. 覆盖率目标

| 模块 | 目标覆盖率 | 关键路径 |
|------|-----------|---------|
| `DirtyMockExecutor` | ≥ 95% | 所有脏模式生成器 + 概率/序列逻辑 |
| `OutputValidator.tryFixJSON()` | ≥ 90% | 各种 JSON 错误变体 |
| `OutputValidator.validateReviewerOutput()` | ≥ 90% | verdict 一致性检查 |
| `WritingOrchestrator.updateChapterStatus()` | ≥ 85% | validation_failed + execution_failed 路径 |
| `TaskExecutor.parseReviewDecision()` | ≥ 90% | JSON → text → default 三级 fallback |
| `SchedulerRunner.runTask()` | ≥ 80% | 超时异常处理路径 |

---

## 8. 实现要点

### 8.1 不修改现有代码

本 spec 的所有不变量均基于**现有代码行为**。不需要修改：
- `OutputValidator` — 已有 JSON 修复、编码检测、verdict 一致性检查
- `TaskExecutor.parseReviewDecision()` — 已有三级 fallback
- `WritingOrchestrator.updateChapterStatus()` — 已有 validation_failed/execution_failed 区分
- `SchedulerRunner` — 已有 429 重试和熔断

只需新增 `DirtyMockExecutor` + 测试文件。

### 8.2 测试基础设施

- 使用 `vitest` 的 `describe/it/expect`
- 临时目录用 `fs.mkdtempSync()`，`afterEach` 清理
- 不 mock `fs` 模块
- 使用 `MockSubagentExecutor` 的模式但不继承（组合优于继承）

### 8.3 测试辅助函数

```typescript
/**
 * 创建最小可测试项目结构
 */
function createTestProject(tmpDir: string, chapters: string[]): void {
  // 创建 state JSON
  // 创建 assets/chapter-kits/
  // 创建空 drafts/chapters/ 和 review/ 目录
}

/**
 * 运行完整的写→审→修循环
 */
async function runWriteReviewCycle(
  tmpDir: string,
  executor: SubagentExecutor,
  chapters: string[]
): Promise<{ runResult: RunResult; state: ProjectState }> {
  // 创建 scheduler + runner + orchestrator
  // 执行写作任务
  // 执行审阅任务
  // 返回结果和最终状态
}
```

---

## 9. 边界条件与已知限制

1. **超时模拟精度**：`setTimeout` 精度约 ±10ms，测试中使用 `±500ms` 容差
2. **乱码检测范围**：仅检查前 500 字符，大文件中间的乱码不会被检测（设计决策，性能优先）
3. **截断质量**：截断可能在非理想位置断开（如表格中间），但不破坏 Markdown 解析
4. **mixed 模式随机性**：使用 `Math.random()`，测试中通过设置 seed 或多次运行验证
5. **并发脏输出**：当前设计不测试多个章节同时收到脏输出的场景（留给后续扩展）

---

## 10. 不变量索引

| ID | 类别 | 简述 |
|----|------|------|
| INV-DM-1 | 通用 | 系统不得因脏输出崩溃 |
| INV-DM-2 | 通用 | 脏输出必须被检测并记录 |
| INV-DM-3 | 通用 | 连续脏输出触发章节失败 |
| INV-DM-4 | 通用 | 脏输出不污染其他章节 |
| INV-DM-1a | DIRTY-1 | tryFixJSON 修复常见错误 |
| INV-DM-1b | DIRTY-1 | 不可修复 JSON → valid=false |
| INV-DM-1c | DIRTY-1 | parseReviewDecision 文本 fallback |
| INV-DM-1d | DIRTY-1 | 完全失败 → default revise |
| INV-DM-1e | DIRTY-1 | JSON 错误 → 修复循环 |
| INV-DM-2a | DIRTY-2 | Writer 空输出 → valid=false |
| INV-DM-2b | DIRTY-2 | Reviewer 空输出 → valid=false |
| INV-DM-2c | DIRTY-2 | Fixer 空输出 → valid=false |
| INV-DM-2d | DIRTY-2 | 空输出 → pending 重试 |
| INV-DM-2e | DIRTY-2 | 5 次空输出 → failed |
| INV-DM-3a | DIRTY-3 | 超长输出截断 |
| INV-DM-3b | DIRTY-3 | 截断后字数合规 |
| INV-DM-3c | DIRTY-3 | 段落边界截断 |
| INV-DM-3d | DIRTY-3 | 截断标记 |
| INV-DM-3e | DIRTY-3 | 轻微超标不截断 |
| INV-DM-4a | DIRTY-4 | U+FFFD 检测 |
| INV-DM-4b | DIRTY-4 | 控制字符检测 |
| INV-DM-4c | DIRTY-4 | 仅检查前 500 字符 |
| INV-DM-4d | DIRTY-4 | 编码损坏 → 修复循环 |
| INV-DM-5a | DIRTY-5 | 超时 → success=false |
| INV-DM-5b | DIRTY-5 | 超时 = execution_failed |
| INV-DM-5c | DIRTY-5 | 超时 → pending 重试 |
| INV-DM-5d | DIRTY-5 | 5 次超时 → failed |
| INV-DM-5e | DIRTY-5 | 超时 ≠ 限流 |
| INV-DM-6a | DIRTY-6 | verdict 矛盾检测 |
| INV-DM-6b | DIRTY-6 | 独立字数验证 |
| INV-DM-6c | DIRTY-6 | 关键词匹配规则 |
| INV-DM-6d | DIRTY-6 | 矛盾审阅 → 修复循环 |
