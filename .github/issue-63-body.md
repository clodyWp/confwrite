## 问题描述

E2E 测试 v9 中发现：Writer 任务因字数超标失败（validation_failed）时，章节状态被错误设置为 `reviewed`，导致审阅阶段被完全跳过。

## 症状

1. 所有 10 章 writer 任务都因字数超标失败
2. 章节状态从 `pending` 直接跳到 `reviewed`（跳过了 `written`）
3. Phase 4a → 4b → 4c → 4d 瞬间完成（审阅被跳过）
4. review 目录为空，没有审阅报告
5. Fixer 收到 "[审阅报告缺失]" 的提示

## 根因

`src/writing/orchestrator.ts` 第 164 行和 190 行：

```typescript
if (failureType === 'validation_failed') {
  chapter.status = 'reviewed';  // ❌ 错误！
  chapter.lastReviewVerdict = 'revise';
}
```

## 修复方案

1. validation_failed 时设置 `status = 'written'`（让 reviewer 评估）
2. Phase 4a 出口条件移除 `reviewed`
3. 更新 spec（SM-19）
4. 添加单元测试

## 不变量

新增 SM-19: `reviewed` 状态只应该在 Phase 4b（审阅）之后出现

## 测试要求

- Writer validation_failed 时状态为 `written`
- Phase 4a 出口条件不包含 `reviewed`
