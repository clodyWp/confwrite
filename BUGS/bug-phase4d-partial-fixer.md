# Bug: Phase 4d 只启动了部分 fixer 任务

**日期**: 2026-10-13  
**发现时间**: E2E测试v9进行中  
**严重程度**: 高  
**状态**: 待分析

## 问题描述

在 E2E 测试 v9 中，Phase 4d（修复阶段）只启动了 ch001-ch005 的 fixer 任务，没有启动 ch006-ch010 的 fixer 任务。

## 现象

### 当前状态
```json
{
  "phase": "4d",
  "status": "writing",
  "chapters": {
    "ch001-ch003": {"status": "written", "round": 3},
    "ch004": {"status": "completed", "round": 2},
    "ch005": {"status": "reviewed", "round": 2},
    "ch006-ch010": {"status": "reviewed", "round": 2, "lastReviewVerdict": "revise"}
  }
}
```

### 已启动的 fixer 任务
```
16:47:41 - task.start: fix-ch001-r1
16:47:41 - task.start: fix-ch002-r1
16:52:01 - task.start: fix-ch003-r1
16:52:01 - task.start: fix-ch004-r1
17:01:11 - task.start: fix-ch004-r1 (重试)
17:01:11 - task.start: fix-ch005-r1
```

### 未启动的 fixer 任务
- fix-ch006-r1
- fix-ch007-r1
- fix-ch008-r1
- fix-ch009-r1
- fix-ch010-r1

### 预期行为

Phase 4d 应该为所有 `reviewed + revise` 的章节启动 fixer 任务。当前有 6 个章节（ch005-ch010）需要修复，但只启动了 ch005 的 fixer 任务。

## 根本原因分析

### 可能的原因

1. **maxConcurrency 限制**
   - 配置 `maxConcurrency=2`
   - 但应该分批启动，而不是只启动前 5 个

2. **Phase 4d execute 逻辑问题**
   - 可能只选择了部分章节
   - 或者在某个条件下停止了任务创建

3. **任务调度问题**
   - 任务被创建但没有被调度
   - 或者任务创建失败

### 需要检查的代码

1. `src/orchestrator/phases.ts`: phase4d.execute() 方法
2. `src/dispatcher/index.ts`: spawnFixers() 方法
3. `src/scheduler/runner.ts`: 任务调度逻辑

## 影响

1. **修复流程不完整**: ch006-ch010 无法被修复
2. **可能导致死锁**: 如果 Phase 4d 的出口条件不满足，状态机无法推进
3. **E2E 测试无法完成**: 无法完成完整的写作-审阅-修复循环

## 相关文件

- `/home/water/proj/c4/projects/LMERP2V2-v9/project-state.json`
- `/home/water/proj/c4/projects/LMERP2V2-v9/logs/confwrite-log.jsonl`
- `src/orchestrator/phases.ts`
- `src/dispatcher/index.ts`

## 备注

这个 bug 可能与 maxConcurrency 配置有关，需要检查任务调度逻辑是否正确处理并发限制。
