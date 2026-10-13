# Bug: 章节状态异常 - 写作阶段出现reviewed状态

**日期**: 2026-10-13  
**发现时间**: E2E测试v9进行中  
**严重程度**: 高  
**状态**: 待修复

## 问题描述

在E2E测试v9中，发现章节状态流转异常：

### 现象

1. **当前阶段**: `phase: "4a"` (写作阶段)
2. **章节状态**: 
   - ch001-ch006: `status: "reviewed"`, `round: 2`
   - ch007-ch010: `status: "pending"`, `round: 1`

### 预期行为

根据状态机设计：
- `4a` (写作阶段): 章节状态应该是 `pending` → `written`
- `4b` (审阅阶段): 章节状态才会变成 `reviewed`
- `reviewed` 状态应该在 phase 4b 之后出现

### 实际情况

- 在 phase `4a` 就出现了 `reviewed` 状态
- 章节 round 已经是 2，说明经历了多轮
- 但 phase 没有推进到 4b 或更高阶段

## 可能的原因

1. **状态机转换逻辑错误**: phase 和 chapter status 的同步出现问题
2. **状态持久化问题**: 状态保存/恢复时数据不一致
3. **并发问题**: 多个任务同时修改状态导致竞态条件
4. **状态回滚**: 某些操作导致 phase 回退但 chapter status 没有回退

## 影响

- **流程混乱**: 无法正确判断当前应该执行什么操作
- **状态不一致**: phase 和 chapter status 不匹配
- **可能导致死锁**: 状态机无法正确推进

## 复现步骤

1. 启动E2E测试v9
2. 执行 `/confwrite:init LMERP2V2-v9`
3. 执行 `/confwrite:organize LMERP2V2-v9`
4. 执行 `/confwrite:write LMERP2V2-v9`
5. 等待写作和审阅流程进行
6. 检查状态发现异常

## 相关代码

- `src/orchestrator/state-machine.ts`: 状态机核心逻辑
- `src/orchestrator/phases.ts`: Phase定义和转换条件
- `src/writing/orchestrator.ts`: 写作编排器
- `src/dispatcher/index.ts`: 任务分发

## 调试信息

```json
{
  "phase": "4a",
  "status": "writing",
  "chapters": {
    "ch001-ch006": {"status": "reviewed", "round": 2},
    "ch007-ch010": {"status": "pending", "round": 1}
  }
}
```

## 建议修复方向

1. **检查状态转换逻辑**: 确认phase转换时是否正确处理chapter status
2. **添加状态一致性校验**: 在每次状态转换时验证phase和chapter status的一致性
3. **增加状态日志**: 记录每次状态变更的详细信息，便于追踪问题
4. **检查并发控制**: 确认状态修改是否有正确的锁机制

## 相关文件

- `/home/water/proj/c4/projects/LMERP2V2-v9/project-state.json`
- `/home/water/proj/c4/projects/LMERP2V2-v9/logs/confwrite-log.jsonl`
