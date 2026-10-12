# Bug: Phase 1 状态转换绕过状态机

**状态**: ✅ 已修复（v0.22.0）  
**发现时间**: 2026-01-09  
**修复时间**: 2026-10-12  
**影响范围**: Phase 1 → Phase 2 状态转换  
**严重程度**: P1 - 严重  
**GitHub Issue**: [#33](https://github.com/clodyWp/confwrite/issues/33)

## 问题描述

Phase 1（需求分析）的 execute() 内部直接修改 `state.currentPhase = '2'`，绕过了状态机的正常转换逻辑。导致：

1. 即使 requirements.json 未生成，状态也可能推进到 Phase 2
2. 状态机的 exit condition 检查被绕过
3. 流程可能在缺少必要产物的情况下继续执行

## 复现步骤

1. 执行 `/confwrite:init test-project`
2. 拷贝测试素材到 reference_material/ 和 inputs/
3. 执行 `/confwrite:organize`
4. 执行 `/confwrite:write`
5. 观察状态转换：0b → 1 → 2
6. 检查 `assets/requirements.json` → 可能不存在

## 根本原因

### 代码位置

`src/orchestrator/phase1.ts` 第 67-69 行：

```typescript
// 7. 更新项目状态
const state = this.store.load();
if (state) {
  state.currentPhase = '2';  // ❌ 直接修改 phase，绕过状态机
  state.lastUpdated = new Date().toISOString();
  this.store.save(state);
}
```

### 状态机 tick 顺序

```
tick() →
  1. 检查 waitPoint → 跳过
  2. 检查 exit conditions → 如果满足就 advance
  3. validate → 如果失败就 blocked
  4. execute → 执行阶段逻辑
```

**问题**：
- Phase 1 的 execute() 被调用
- execute() 内部直接设置 `currentPhase = '2'`
- 即使 execute() 抛异常，状态已经被改掉了
- 状态机的 exit condition 检查被绕过

### Phase 1 的 exit condition

```typescript
exits: [
  { target: '2', condition: (ctx) => {
    const phase1 = new Phase1RequirementAnalysis(ctx.projectDir, store);
    return phase1.validate();  // 检查 requirements.json 是否存在
  }},
],
```

这个检查本来是正确的，但 Phase 1 的 execute() 已经提前改了 phase，导致状态机混乱。

## 影响

- **状态不一致**：phase 已经推进到 2，但 requirements.json 可能不存在
- **后续阶段失败**：Phase 2（大纲规划）需要 requirements.json，但文件不存在
- **错误信息混乱**：outline 命令报错"未找到需求文件"，但状态已经是 Phase 2

## 修复方案

### 方案 1：移除 Phase 1 内部的 phase 修改（推荐）

```typescript
// src/orchestrator/phase1.ts
async execute(): Promise<void> {
  // ... 提取需求、生成报告 ...
  
  // ❌ 删除这段代码
  // const state = this.store.load();
  // if (state) {
  //   state.currentPhase = '2';
  //   this.store.save(state);
  // }
  
  // ✅ 让状态机的 exit condition 来处理转换
}
```

**原理**：
- Phase 1 的 execute() 只负责生成 requirements.json
- 状态机的 exit condition 检查 requirements.json 是否存在
- 如果存在，状态机自动推进到 Phase 2
- 如果不存在，状态机 blocked，不会推进

### 方案 2：修改 Phase 1 的 exit condition

如果保留 Phase 1 内部的 phase 修改，需要修改 exit condition：

```typescript
exits: [
  { target: '2', condition: (ctx) => {
    // 检查 phase 是否已经被 Phase 1 内部修改
    return ctx.state.currentPhase === '2';
  }},
],
```

**缺点**：
- 仍然绕过状态机
- 不符合状态机的设计原则

## 验证方法

修复后执行 E2E 测试：
1. 检查 Phase 1 执行后 requirements.json 是否存在
2. 检查状态转换：0b → 1 → 2
3. 如果 requirements.json 不存在，状态应该 blocked 在 Phase 1

## 相关文件

- `src/orchestrator/phase1.ts` - Phase 1 实现
- `src/orchestrator/state-machine.ts` - 状态机逻辑
- `src/orchestrator/phases.ts` - Phase 定义

## 备注

这个问题与 `bug-phase1-requirements-json.md` 相关。Phase 1 没有生成 requirements.json，但状态仍然推进了，根本原因就是 Phase 1 内部直接修改了 phase。
