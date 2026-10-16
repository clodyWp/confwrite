# Spec: 状态机 (State Machine)

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **源码**: `src/orchestrator/state-machine.ts`, `src/orchestrator/phases.ts`  
> **状态**: 有效（基于 v0.22.0 代码审计）

---

## 1. 职责

状态机是 ConfWrite 的**唯一流程控制者**。它决定"下一步做什么"，LLM 只负责"写这一章的内容"。

- 确定性：相同状态 + 相同文件系统 = 相同动作
- 可恢复：状态持久化到 JSON，中断后可从断点继续
- 单向流转：Phase 只能前进，不能回退（4a↔4b↔4c↔4d 循环除外）

---

## 2. Phase 流转图

```
0a (初始化)
 │
 ▼
0b (素材整理)
 │
 ▼
1 (需求分析)
 │
 ▼
2 (大纲规划) ◄── waitPoint(entry): 用户确认大纲
 │
 ├──→ 3 (素材准备) ──→ 4a (写作)
 │                        │
 └──→ 4a (写作) ◄─────────┘
       │
       ▼
      4b (审阅)
       │
       ▼
      4c (决策)
       │
       ├──→ 4d (修复) ──→ 4b (循环)
       │
       └──→ 5 (图表生成)
              │
              ▼
             6 (组装) ◄── waitPoint(after-execute): 用户审阅初稿
              │
              ▼
             7 (定稿)
              │
              ▼
             8 (导出)
              │
              ▼
            done (终态)
```

### 2.1 合法转换表

| 当前 Phase | 目标 Phase | 触发条件 |
|-----------|-----------|---------|
| 0a | 0b | `status === 'init'` |
| 0b | 1 | `status === 'organizing'` 且素材整理完成 |
| 1 | 2 | `assets/requirements.json` 存在且非空 |
| 2 | 3 | `outline.md` 存在，但素材未整理或素材包不匹配大纲 |
| 2 | 4a | `outline.md` 存在，素材已整理，且素材包与大纲逐章对应 |
| 3 | 4a | 素材已整理，且素材包与大纲逐章对应 |
| 4a | 4b | 所有章节状态 ∈ {written, completed, failed, skipped}（不包含 reviewed，SM-19） |
| 4b | 4c | 无章节处于 written/reviewing，且（有章节已审阅 或 所有章节都处于终态） |
| 4c | 4d | 有章节 verdict=revise |
| 4c | 4a | 有章节被 reject 需重写（存在 `pending` 章节即触发，不检查 `round`） |
| 4c | 5 | 所有章节 ∈ {completed, skipped, failed}，且至少一个 completed |
| 4d | 4b | 无章节仍需修复（所有 reviewed+revise 已处理） |
| 5 | 6 | `figures/manifest.json` 存在，且图表健康检查通过（P5-5：生成失败的图自动重试一次后再判失败） |
| 6 | 7 | `assembly/merged-v1.md` 存在 |
| 7 | 8 | `output/finalization.json` 存在 |
| 8 | done | `output/final.docx` 存在 |

---

## 3. 不变量 (Invariants)

以下规则**永远不得违反**。违反任何一条 = bug。

### 3.1 状态转换

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-1 | **`execute()` 不得修改 `state.currentPhase`** | Phase 1/2 直接赋值 `currentPhase='2'/'3'`，绕过状态机，导致状态不一致 (Bug #33) |
| SM-2 | **Phase 转换只能由 exit condition 驱动** | 任何直接赋值都是绕过状态机 |
| SM-3 | **终态 `done` 必须在 phases 表中注册** | 未注册时收尾报"未知 Phase"，成功运行看起来像失败 (Bug #30) |
| SM-4 | **index.ts 在 tick 之前判定终态** | 放在 tick 之后会走到 blocked 分支 (Bug #30) |

### 3.2 产物与缓存

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-5 | **`onEnter` 必须清理本阶段的工作产物残留** | 残留文件让出口条件直接成立，阶段跳过自己的工作 (Bug #28) |
| SM-6 | **`onEnter` 不得清理缓存** | `figures/manifest.json` 是缓存，命中时跳过重算是正确行为 |
| SM-7 | **出口条件必须验证"本阶段做了工作"** | 只检查文件存在会导致空阶段跳过 (Bug 28 附注) |

### 3.3 状态持久化

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-8 | **所有 `ProjectState` 修改必须通过 `store.save()` 写回** | 进程中断时未持久化的状态丢失 |
| SM-9 | **`execute()` 中对 state 的修改必须同步回 `ctx.state`** | organizeMaterials 写入磁盘后，状态机用内存 state 覆盖保存，同步被回滚 (Bug #31) |
| SM-10 | **`advance()` 必须在 save 之前调用 `onEnter`** | 顺序颠倒时残件清理不生效 |

### 3.4 事件数据

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-14 | **task.start 事件的 round 字段必须从 chapter.round 读取，不能硬编码** | 日志中所有任务的 round 始终为 1，无法区分重试轮次 |

当 task 有 chapterId 时，从 state.chapters[chapterId].round 获取。
当 task 无 chapterId 时，round 为 0。

### 3.5 waitPoint

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-11 | **waitPoint 检查优先于出口判定** | 放在出口之后，阶段干完活直接跳走，永不暂停 (Bug #10) |
| SM-12 | **`timing='entry'` 的 waitPoint 在跳转时立即暂停** | 不暂停则用户看不到确认提示 |
| SM-13 | **`timing='after-execute'` 的 waitPoint 在 execute 后设置** | 设置太早则用户审阅不存在的文件 (Bug #10) |

### 3.6 Phase 4c → 4a 退出条件

> **版本**: 1.1 (2026-10-13) — 补充 4c → 4a 不依赖 `round` 的不变量

| ID | 不变量 | 说明 |
|----|--------|------|
| SM-14b | **4c → 4a 的退出条件只检查 `ch.status === 'pending'`，不检查 `round > 1`** | 所有设置 `pending` 的路径都会同时递增 `round`，因此 `pending` 必然 `round > 1`。原始 Bug 3 实测得 5 章卡在 `pending(round=1)` 是因为任务执行失败掉回 `pending` 时未递增 `round`——该路径已通过 Bug 51 修复（fixer 成功后 `round += 1`）与 orchestrator.ts reject 路径（`round += 1`）统一。当前代码 `pending` 必满足 `round > 1`，故 `&& ch.round > 1` 是死代码，移除后语义不变。 |

**原始症状（Bug 3）**：5 章卡在 `pending` 且 `round=1`，永远不再被处理，最终导致 4c 死锁。
修复后：4c → 4a 只要存在 `pending` 章节即触发，无论 `round` 值；并辅以单章轮次上限（`maxRounds` 守护，见 §6.3）防止无限循环。

**测试要求**：必须覆盖「`pending` 章节 `round=1` 仍应触发 4c → 4a」的场景（回归原始 Bug 3 症状）。

### 3.7 Round 递增

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-15 | **Reject 时 round 只递增一次** | 一次 reject 事件导致 round 从 1 跳到 3（应只到 2），章节更快触达 maxRounds，减少实际修复机会 (Issue #47-2) |

当 reviewer 判 reject 时，round 只递增一次。
递增发生在 `orchestrator.ts` 的 `updateChapterStatus()` 中（reviewer case 的 reject 分支）。
`phases.ts` 的 4c execute 不再递增 round（避免双重递增）。

数据流：
```
reviewer reject
  → orchestrator.ts updateChapterStatus() → round += 1, status = pending
  → 下一 tick → 4c execute → 仅设置 status = pending（不再递增 round）
```

### 3.8 Phase 4d 死锁防护

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-16 | **Phase 4d 检测到 allExceeded 时必须将章节标记为终态** | 章节卡在 reviewed+revise，validate 返回 blocked 但 exit 条件不满足，死锁 (Issue #47-3) |

当 phase 4d 的 validate 检测到所有待修复章节都已超过 maxRounds 时：

1. **不得返回 blocked**（否则 exit 条件永远不满足，死锁）
2. **必须将这些章节标记为终态**：
   - 有产物（`drafts/chapters/{id}-v{round}.md` 存在）→ `completed`
   - 无产物 → `failed`
3. 设置 `failureReason = 'exceeded_max_rounds_in_4d'`
4. 返回 `{ ok: true }`，让 execute 发现无待修复章节，下一 tick exit 条件满足

**注意**：这是对 validate 纯函数规则的例外（§5.1）。此修改是必要的，因为：
- exit 条件检查在 validate 之前（§4 tick 协议），无法在此处拦截
- 如果 validate 返回 blocked，状态机无法推进
- execute 无法处理此场景，因为 validate 已经阻止了 execute 的执行

### 3.9 事件发射

| ID | 不变量 | 违反后果 |
|----|--------|-------------------|
| SM-17 | **关键状态变化必须通过 EventBus emit 事件** | 日志系统无法记录关键状态变化，E2E 测试无法验证状态转换 |

以下状态变化必须通过 EventBus emit 事件：

- **phase.transition**: 阶段转换时（`state-machine.ts` `advance()`）
  - 字段：`from`, `to`, `phaseName`, `reason`, `stats`
- **chapter.status**: 章节状态变化时（`writing/orchestrator.ts` `updateChapterStatus()`）
  - 字段：`chapterId`, `from`, `to`, `version`
- **chapter.failed**: 章节失败时（`writing/orchestrator.ts` `updateChapterStatus()`）
  - 字段：`chapterId`, `round`, `failureReason`, `hasOutput`, `finalAction`
- **round.exceeded**: 轮次超限时（`writing/orchestrator.ts` `updateChapterStatus()`）
  - 字段：`chapterId`, `currentRound`, `maxRounds`, `hasOutput`, `finalAction`

这些事件用于日志记录和 E2E 测试验证。EventBus 实例通过构造函数注入到需要 emit 事件的模块。

### 3.10 状态快照

| ID | 不变量 | 违反后果 |
|----|--------|-------------------|
| SM-18 | **Phase transition 时必须保存状态快照** | 断网恢复时无法知道"之前发生了什么"，无法回溯执行历史 |

每次 phase transition 时，必须在 `logs/checkpoints/` 目录下保存状态快照。

快照文件名格式：`checkpoint-{timestamp}.json`（timestamp 为 Unix 毫秒时间戳）

快照内容：
```json
{
  "timestamp": "2026-10-12T10:00:00.000Z",
  "from": "4a",
  "to": "4b",
  "chapters": { ... },
  "tasks": [ ... ]
}
```

原因：
- 支持断网恢复
- 支持执行历史回溯
- 便于调试问题

约束：
- 快照保存失败不应影响主流程（try-catch 包裹）
- 快照保存是轻量级的，只包含关键字段

### 3.11 reviewed 状态语义

| ID | 不变量 | 违反后果 |
|----|--------|-------------------|
| SM-19 | **`reviewed` 状态只应该在 Phase 4b（审阅）之后出现** | Writer validation_failed 时错误设置 reviewed，导致审阅阶段被跳过，Fixer 无审阅报告可参考 (E2E v9) |

**状态语义定义**：

| 状态 | 语义 | 出现时机 |
|------|------|----------|
| `pending` | 待写作 | 初始状态，或 reviewer reject 后需重写 |
| `written` | 已写作，待审阅 | Writer 任务完成（无论验证是否通过） |
| `reviewed` | 已审阅，待决策 | Reviewer 任务完成后 |
| `completed` | 已完成 | 审阅通过，或修复后验证通过 |
| `failed` | 失败 | 超过 maxRounds 或连续失败 |

**Phase 4a 出口条件**：

```typescript
// ❌ 错误（包含 reviewed）
ch => ['written', 'reviewed', 'completed', 'failed', 'skipped'].includes(ch.status)

// ✅ 正确（不包含 reviewed）
ch => ['written', 'completed', 'failed', 'skipped'].includes(ch.status)
```

**Writer 失败时的状态设置**：

```typescript
// validation_failed（有输出但验证失败）
chapter.status = 'written';  // ✅ 让 reviewer 评估

// execution_failed + 有输出
chapter.status = 'completed';  // ✅ 降级接受

// execution_failed + 无输出
chapter.status = 'pending';  // ✅ 重试 writer

// 连续失败 5 次
chapter.status = 'failed';  // ✅ 彻底失败
```

**测试要求**：必须覆盖「Writer validation_failed 时状态为 written，不是 reviewed」的场景。

### 3.12 Phase 4b 退出条件

| ID | 不变量 | 违反后果 |
|----|--------|----------|
| SM-20 | **Phase 4b 必须在所有章节都不需要审阅时退出** | 当所有章节都 failed 时，Phase 4b 卡住无法退出 (E2E v26) |

**Phase 4b 退出条件**：

```typescript
// 退出到 4c 的条件
const needsReview = chapters.some(ch => ['written', 'reviewing'].includes(ch.status));
const allTerminal = chapters.every(ch => ['completed', 'failed', 'skipped'].includes(ch.status));
const hasReviewed = chapters.some(ch => ch.status === 'reviewed');

// 满足以下任一条件即可退出：
// 1. 没有章节需要审阅，且有章节已审阅（正常流程）
// 2. 所有章节都处于终态（completed/failed/skipped）
return !needsReview && (hasReviewed || allTerminal);
```

**原因**：
- 当所有章节都 failed 时，没有 reviewed 状态的章节
- 原条件要求 `hasProgress`（至少一个 completed 或 reviewed），导致无法退出
- 新条件允许所有章节都 failed 时也能退出

**测试要求**：必须覆盖「所有章节都 failed 时 Phase 4b 能正常退出」的场景。

### 3.13 validation_failed 不得递增 round

| ID | 不变量 | 违反后果（历史事故） |
|----|--------|-------------------|
| SM-21 | **validation_failed 路径不得递增 chapter.round** | round 和文件版本脱节，下游 reviewer/fixer 查找文件失败，级联验证失败直到 maxRounds (Issue #134) |

validation_failed 表示 Writer 输出存在但验证失败（如字数超标）。
此时 chapter.round 不应递增，因为：
1. 文件版本与 round 必须同步（round=N 对应 vN 文件）
2. Spec CS-2 规定 "round 在 fixer 完成后递增"
3. validation_failed 不是 fixer 完成

正确行为：
- chapter.status = 'written'（让 reviewer 评估）
- chapter.consecutiveFailures 已在方法入口递增（line ~141），用于 maxRounds 守护
- 不递增 chapter.round

maxRounds 守护：当 consecutiveFailures >= maxRounds 时，标记为终态。

---

## 4. Tick 循环协议

`StateMachine.tick()` 的每一步**必须按以下顺序执行**，不得重排：

```
tick(state):
  1. 加载 state（store.load）
  2. 查找 phase definition（phases.get）
  3. 检查 waitPoint → 如果命中，返回 wait_point，不执行后续步骤
  4. 检查 exit conditions → 如果满足，调用 advance() 并返回
  5. 调用 validate() → 如果失败，返回 blocked
  6. 调用 execute()
  7. 如果本 phase 有 waitPoint，设置 waitPoint（after-execute 时机）
  8. 保存 state（store.save）
  9. 返回结果
```

### 4.1 顺序约束

| 约束 | 原因 |
|------|------|
| waitPoint(3) 在 exit(4) 之前 | 否则"先干活再暂停"的阶段永远不暂停 (SM-11) |
| exit(4) 在 validate(5) 之前 | 满足出口条件时跳过本阶段，无需验证 |
| validate(5) 在 execute(6) 之前 | 前置条件不满足时不执行 |
| save(8) 在 execute(6) 之后 | 确保 execute 的修改被持久化 (SM-8) |

---

## 5. Phase 定义契约

每个 `PhaseDefinition` 必须满足：

### 5.1 `validate(ctx) → ValidationResult`

- **纯函数**：只读 ctx，不修改任何状态
- **完整检查**：验证本阶段所有前置条件
- **明确错误**：失败时返回用户可理解的错误信息

### 5.2 `execute(ctx) → PhaseResult`

- **不得修改 `state.currentPhase`** (SM-1)
- **可以修改** state 的其他字段（如 chapters、lastUpdated）
- **必须把修改同步回 `ctx.state`** (SM-9)
- **如果内部调用了其他写入 state 的函数**，必须从磁盘重新加载并同步

### 5.3 `exits[].condition(ctx) → boolean`

- **纯函数**：只读 ctx，不修改任何状态
- **幂等**：相同输入返回相同结果
- **必须验证工作已完成**：不能只检查文件存在 (SM-7)

### 5.4 `onEnter(ctx) → void`（可选）

- **只清理本阶段自己的工作产物** (SM-5)
- **不清理缓存** (SM-6)
- **在 advance() 中、save() 之前调用** (SM-10)

---

## 6. 数据流契约

### 6.1 状态机 → Dispatcher

状态机 `tick()` 返回的 `action` 字段决定 dispatcher 的行为：

| action | 含义 | dispatcher 行为 |
|--------|------|----------------|
| `spawn_writers` | 启动写作任务 | 为每个 pending 章节创建 writer task |
| `spawn_reviewers` | 启动审阅任务 | 为每个 written 章节创建 reviewer task |
| `spawn_fixers` | 启动修复任务 | 为每个 reviewed+revise 章节创建 fixer task |
| `generate_diagrams` | 生成图表 | phase 5 在 execute 内直接完成，dispatcher 不处理 |
| `assemble` | 组装文档 | phase 6 在 execute 内直接完成，dispatcher 不处理 |
| `export_docx` | 导出文档 | phase 8 在 execute 内直接完成，dispatcher 不处理 |

### 6.2 wordBudget 传递链

```
outline.md (字数预算)
  → OutlineParser 解析
    → chapter-syncer 同步到 ChapterState.wordBudget
      → dispatcher 读取并传给 TaskExecutor
        → Writer/Fixer prompt 中包含字数限制
          → OutputValidator 独立验证字数
```

**不变量**：链中任何一环丢失 wordBudget = 字数控制失效。

### 6.3 Phase 4c 决策结果语义

Phase 4c `execute()` 返回的 `params` 字段定义如下：

| 字段 | 类型 | 语义 | 计数条件 |
|------|------|------|----------|
| `pass` | number | 审阅通过的章节数 | `status='reviewed'` 且 `verdict='accept'` 或无 verdict |
| `revise` | number | 需要修复的章节数 | `status='reviewed'` 且 `verdict='revise'` 且 `round < maxRounds` |
| `reject` | number | 需要重写的章节数 | `status='reviewed'` 且 `verdict='reject'` |
| `exceeded` | number | 超过 maxRounds 强制完成的章节数 | `status='reviewed'` 且 `round >= maxRounds` |

**不变量**：
- `pass` 只计入审阅通过的章节，**不计入**强制完成的章节
- `exceeded` 独立计数，不与 `pass/revise/reject` 重叠
- 每个章节只计入一个类别

**设计原则**：
- `pass/revise/reject` 反映审阅结果
- `exceeded` 反映兜底机制触发，与审阅结果无关

---

## 7. 错误处理

| 场景 | 预期行为 |
|------|---------|
| state 文件不存在 | tick 返回 blocked，提示运行 /confwrite:init |
| 未知 phase | tick 返回 blocked，error 包含 phase 名 |
| validate 失败 | tick 返回 blocked，error 包含失败原因 |
| execute 抛异常 | 异常冒泡到 index.ts，stoppedReason='error' |
| 出口条件永不满足 | 状态机停在当前 phase，index.ts 达到 max_ticks 后停止 |

---

## 8. 测试覆盖要求

| 场景 | 必须覆盖 |
|------|---------|
| 每个 exit condition | 至少一个正向测试（满足→跳转） |
| 每个 validate | 至少一个失败测试（不满足→blocked） |
| SM-1 | execute() 调用后 currentPhase 不变 |
| SM-5 | onEnter 清理残件后，出口条件不成立 |
| SM-9 | execute 内部写入 state 后，ctx.state 同步更新 |
| SM-11 | waitPoint 存在时，tick 返回 wait_point 而非 advance |
| 完整流转 | 0a → done 的端到端测试（mock executor） |

---

## 9. 变更历史

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-10-12 | 初始版本 | 基于 v0.22.0 代码审计，记录所有已发现的行为规范 |
| 2026-10-12 | Phase 5 出口条件补充 P5-5 重试说明 | 图表生成失败时自动重试一次，重试仍失败才计入 failed |
<<<<<<< HEAD
| 2026-10-12 | 新增 SM-16: Phase 4d allExceeded 死锁防护 | Issue #47-3: validate 返回 blocked 但 exit 不满足导致死锁 |
| 2026-10-13 | 新增 SM-14b：4c → 4a 退出条件不依赖 `round` | 移除 `&& ch.round > 1` 死代码，补充原始 Bug 3 症状与回归测试要求 |
| 2026-10-13 | 新增 SM-15：Reject 时 round 只递增一次 | 修复 Issue #47-2 双重递增 bug |
| 2026-10-14 | 新增 SM-17：关键状态变化必须 emit 事件 | Issue #53：11 个事件类型从未 emit |
| 2026-10-14 | 新增 SM-18：Phase transition 时必须保存状态快照 | Issue #57：无执行历史，断网恢复困难 |
| 2026-10-14 | 新增 SM-19：`reviewed` 状态只应该在 Phase 4b 之后出现 | E2E v9: writer validation_failed 错误设置 reviewed 导致审阅被跳过 |
