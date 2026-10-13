# Bug: Phase 4a出现reviewed状态

**日期**: 2026-10-13  
**发现时间**: E2E测试v9进行中  
**严重程度**: 高  
**状态**: 待分析

## 问题描述

在E2E测试v9中，发现状态机行为异常：在Phase 4a（写作阶段）出现了"reviewed"状态的章节。

## 现象

### 当前状态
```json
{
  "phase": "4a",
  "status": "writing",
  "chapters": {
    "ch001": "reviewed",
    "ch002": "reviewed",
    "ch003": "reviewed",
    "ch004": "reviewed",
    "ch005": "reviewed",
    "ch006": "reviewed",
    "ch007": "reviewed",
    "ch008": "reviewed",
    "ch009": "pending",
    "ch010": "pending"
  }
}
```

### 预期行为

根据状态机设计（specs/state-machine.md）：
- **Phase 4a（写作）**: 章节状态应该是 `pending` → `written`
- **Phase 4b（审阅）**: 章节状态才会从 `written` → `reviewed`
- **Phase 4c（决策）**: 处理 `reviewed` 状态的章节
- **Phase 4d（修复）**: 根据决策结果修复章节

所以在Phase 4a出现reviewed状态违反了状态机的不变量。

## 根本原因分析

### 问题链路

1. **Writer 任务完成但字数超标**
   - 所有 10 章的 writer 任务都完成（task.complete）
   - 但字数都超过上限 7800 字（实际 8000-11000 字）
   
2. **OutputValidator 验证失败**
   - 在 `index.ts` 中，任务完成后进行输出验证
   - 验证失败：`❌ 草稿字数超标: XXXX 字 > 上限 7800 字`
   - 调用 `dispatcher.processTask(taskResult.id, 'failed', ..., 'validation_failed')`

3. **WritingOrchestrator 处理 validation_failed**
   ```typescript
   // src/writing/orchestrator.ts 第160-166行
   if (chapter.consecutiveFailures >= 5) {
     chapter.status = 'failed';
   } else {
     chapter.status = 'reviewed';  // ← 问题！
     chapter.lastReviewVerdict = 'revise';
   }
   ```

4. **审阅阶段被跳过**
   - 所有章节状态都是 `reviewed`
   - Phase 4b 的 validate 失败（没有 `written` 状态的章节）
   - Phase 4b 的出口条件满足（所有章节都是 `reviewed`）
   - 结果：审阅阶段被完全跳过，没有生成审阅报告

5. **直接进入修复阶段**
   - Phase 4c 决策：所有章节都是 `reviewed` + `lastReviewVerdict = 'revise'`
   - 进入 Phase 4d 修复阶段
   - Fixer 任务启动，但没有审阅报告作为输入

### 设计缺陷

1. **validation_failed 的处理逻辑错误**
   - 当 writer 任务因字数超标失败时，应该让 writer 重试
   - 而不是设置 `status = 'reviewed'` 进入修复循环
   
2. **状态语义混乱**
   - `reviewed` 状态被用来表示"需要修复"
   - 但实际上 `reviewed` 应该是"已审阅"的意思
   - 这导致审阅阶段被错误地跳过

3. **缺少 writer 重试机制**
   - 当 writer 因字数超标失败时，应该有重试机制
   - 而不是直接进入修复循环

### 正确的状态流转应该是

```
Writer 任务完成但字数超标
  → validation_failed
  → 章节状态应该保持 pending 或设为 failed
  → 重新调度 writer 任务（带更强的字数约束）
  → 或者：如果多次失败，才进入修复循环
```

### 实际观察到的状态流转

```
Writer 任务完成但字数超标
  → validation_failed
  → 章节状态: pending → reviewed (错误！)
  → Phase 4a 出口条件满足 (允许 reviewed)
  → 进入 Phase 4b
  → Phase 4b validate 失败 (没有 written)
  → Phase 4b 出口条件满足 (所有章节都是 reviewed)
  → 跳过审阅，进入 Phase 4c
  → Phase 4c 决策
  → 进入 Phase 4d (修复)
```

**结果**: review 目录为空，没有审阅报告，但所有章节都是 `reviewed` 状态。

## 影响

1. **状态机不变量被违反**: SM-1到SM-16中可能有多条被违反
2. **流程混乱**: 无法确定当前应该执行什么操作
3. **可能导致死锁**: 如果phase和章节状态不匹配，可能导致状态机无法推进
4. **审阅被跳过**: 由于章节状态错误，Phase 4b（审阅）被完全跳过，没有生成审阅报告

## 完整的 Bug 链路

### 问题 1: Writer 失败时设置错误的状态

**位置**: `src/writing/orchestrator.ts` 第164行和第190行

当 writer 任务失败时，章节状态被设置为 `reviewed`：

```typescript
// validation_failed 路径（第160-166行）
if (chapter.consecutiveFailures >= 5) {
  chapter.status = 'failed';
} else {
  chapter.status = 'reviewed';  // ← 问题！
  chapter.lastReviewVerdict = 'revise';
}
```

### 问题 2: Phase 4a 出口条件允许 reviewed 状态

**位置**: `src/orchestrator/phases.ts` 第356-362行

```typescript
exits: [
  {
    target: '4b',
    condition: (ctx) => {
      const chapters = Object.values(ctx.state.chapters);
      return chapters.length > 0 && chapters.every(
        ch => ['written', 'reviewed', 'completed', 'failed', 'skipped'].includes(ch.status),
        //              ↑ 不应该包括 reviewed！
      );
    },
  },
],
```

### 问题 3: Phase 4b 被跳过

**位置**: `src/orchestrator/phases.ts` 第369-393行

当所有章节都是 `reviewed` 状态时：
- Phase 4b validate 失败（没有 `written` 状态的章节）
- 但 Phase 4b 出口条件满足（所有章节都是 `reviewed`）
- 结果：审阅阶段被完全跳过，没有生成审阅报告

### 实际观察到的状态流转

```
Writer 任务失败
  → 章节状态: pending → reviewed (错误！)
  → Phase 4a 出口条件满足 (允许 reviewed)
  → 进入 Phase 4b
  → Phase 4b validate 失败 (没有 written)
  → Phase 4b 出口条件满足 (所有章节都是 reviewed)
  → 跳过审阅，进入 Phase 4c
  → Phase 4c 决策
  → 进入 Phase 4d (修复)
```

**结果**: review 目录为空，没有审阅报告，但所有章节都是 `reviewed` 状态。

## 需要检查的代码

1. `src/orchestrator/state-machine.ts`: tick() 方法，检查phase推进逻辑
2. `src/orchestrator/phases.ts`: phase4a的出口条件
3. `src/writing/orchestrator.ts`: updateChapterStatus() 方法
4. `src/dispatcher/index.ts`: 任务分发逻辑
5. `src/scheduler/runner.ts`: 任务执行和状态更新

## 调试信息

需要收集：
1. 完整的状态变化日志（confwrite-log.jsonl）
2. 任务执行顺序
3. phase推进的时间点
4. 章节状态变化的时间点

## 相关文件

- `/home/water/proj/c4/projects/LMERP2V2-v9/project-state.json`
- `/home/water/proj/c4/projects/LMERP2V2-v9/logs/confwrite-log.jsonl`
- `specs/state-machine.md`: 状态机规格说明

## 备注

这个bug可能和之前修复的Phase 4状态机问题（Issue #47）有关。需要检查是否引入了新的问题。
