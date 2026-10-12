# Bug: maxRounds 守护失效导致写作循环无法终止

**状态**: ✅ 已修复  
**优先级**: P0  
**发现版本**: v0.22.0  
**发现日期**: 2026-10-12  
**修复版本**: v0.22.1  
**GitHub Issue**: #41  
**PR**: #44

---

## 问题描述

E2E 测试 v22 中发现，章节的 round 已超过 maxRounds=5（达到 round=6），但写作循环仍在继续，没有停止。

---

## 根因分析

### 致命 Bug

**Bug 1: Phase 状态机无 maxRounds 守护**
- 位置: `src/orchestrator/phases.ts` phase 4c/4d
- 问题: Phase 状态机的退出条件只看状态，从不检查 `chapter.round >= chapter.maxRounds`

**Bug 2: validation_failed 路径绕过 maxRounds**
- 位置: `src/writing/orchestrator.ts` L133-143
- 问题: validation_failed 直接 return，不检查 maxRounds，不递增 round

### 高危 Bug

**Bug 3: Reviewer 失败路径绕过 maxRounds**
- 位置: `src/writing/orchestrator.ts` L130-175
- 问题: 失败路径跳过 reviewer case 的 maxRounds 检查

**Bug 4: Phase 4c reject 处理是死代码**
- 位置: `src/orchestrator/phases.ts` phase 4c
- 问题: 潜在双重递增，但当前不可达

---

## 核心问题

maxRounds 守护**只在一个地方存在**：

```typescript
// WritingOrchestrator.ts L185 — 仅在 reviewer 成功时检查
if (chapter.round >= chapter.maxRounds) {
    chapter.status = 'completed';
}
```

但流程有多条旁路完全绕过这个检查：
1. 任务失败 → 走失败处理路径 → 不检查 maxRounds
2. 验证失败 → 直接 return → 不检查 maxRounds  
3. Phase 状态机转换 → 只看状态 → 不检查 maxRounds

---

## 复现步骤

1. 运行 E2E 测试，配置 maxRounds=5
2. Writer 产出字数超标（如 10000 字 > 上限 7800 字）
3. 进入修复循环（fixer → reviewer → fixer → ...）
4. 观察 round 超过 5 后循环仍在继续

---

## 修复方案

在 **Phase 状态机层面** 添加独立的 maxRounds 守护：

```typescript
// phase4c execute 中新增
if ((ch.round || 1) >= (ch.maxRounds || 5)) {
    ch.status = 'completed';
    ch.failureReason = 'exceeded_max_rounds';
    continue;
}
```

---

## 验收标准

- [ ] Phase 4c/4d 添加 maxRounds 检查
- [ ] validation_failed 路径添加 maxRounds 检查
- [ ] Reviewer 失败路径添加 maxRounds 检查
- [ ] 添加单元测试覆盖所有路径
- [ ] E2E 测试验证循环能正常终止

---

## 相关文件

- `src/orchestrator/phases.ts` — Phase 状态机定义
- `src/writing/orchestrator.ts` — WritingOrchestrator 实现
- `src/config/loader.ts` — maxRounds 配置默认值

---

## 影响

- 会导致无限循环，浪费 token
- 用户体验差，无法自动终止
