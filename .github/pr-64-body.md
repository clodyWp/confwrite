## 问题描述

E2E 测试 v9 中发现：Writer 任务因字数超标失败（validation_failed）时，章节状态被错误设置为 `reviewed`，导致审阅阶段被完全跳过。

## 症状

1. 所有 10 章 writer 任务都因字数超标失败
2. 章节状态从 `pending` 直接跳到 `reviewed`（跳过了 `written`）
3. Phase 4a → 4b → 4c → 4d 瞬间完成（审阅被跳过）
4. review 目录为空，没有审阅报告
5. Fixer 收到 "[审阅报告缺失]" 的提示

## 根因

`src/writing/orchestrator.ts` 中 `updateChapterStatus()` 在 validation_failed 时设置 `status = 'reviewed'`，这是错误的，因为 `reviewed` 只应该在 Phase 4b（审阅）之后出现。

## 修复方案

1. **validation_failed 时设置 `status = 'written'`**（让 reviewer 评估）
2. **execution_failed + 无输出时设置 `status = 'pending'`**（重试 writer）
3. **Phase 4a 出口条件移除 `reviewed`**
4. **更新 spec（SM-19）**：明确 reviewed 状态语义
5. **添加回归测试**覆盖 validation_failed 的三种情况

## 不变量

新增 **SM-19**: `reviewed` 状态只应该在 Phase 4b（审阅）之后出现

## 测试覆盖

- ✅ Writer validation_failed 时状态为 `written`
- ✅ execution_failed + 有输出时状态为 `completed`（Bug 32 不变）
- ✅ execution_failed + 无输出时状态为 `pending`
- ✅ 连续失败 5 次时状态为 `failed`
- ✅ validation_failed 达到 maxRounds 时状态为 `completed`（有输出）
- ✅ Phase 4a 出口条件不包含 `reviewed`

## 变更文件

- `src/writing/orchestrator.ts` - 修改 validation_failed 和 execution_failed 的处理逻辑
- `src/orchestrator/phases.ts` - 修改 Phase 4a 出口条件
- `specs/state-machine.md` - 新增 SM-19 不变量
- `tests/writing/validation-failed-status.test.ts` - 新增回归测试
- 更新 5 个旧测试以反映新的正确行为

Closes #63
