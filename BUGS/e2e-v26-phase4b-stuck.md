# E2E v26 Bug 报告：Phase 4b 无法退出

**时间**: 2026-10-13T23:30:00Z
**版本**: v0.26.0
**项目**: e2e-v26

## Bug 4: Phase 4b 无法退出当所有章节 failed

### 症状

所有 7 个章节都 failed 后，Phase 4b 仍然卡在 reviewing 状态，无法退出：

```
Error: ⛔ 审阅: 没有已写好的章节需要审阅
```

### 分析

Phase 4b 的退出条件可能是：
- 所有 written 状态的章节都被审阅
- 或者所有审阅任务完成

但当所有章节都 failed 时，没有 written 状态的章节，导致 Phase 4b 无法退出。

**可能原因**：
1. Phase 4b 的退出条件没有考虑所有章节 failed 的情况
2. 需要增加一个退出条件：当所有章节都 failed 或 completed 时退出
3. 需要检查 Phase 4b 的退出逻辑

### 影响

- 测试无法完成
- 状态机卡在 Phase 4b
- 需要手动干预才能恢复

### 代码位置

- `src/orchestrator/phases.ts`: Phase 4b 的退出条件
- `src/writing/orchestrator.ts`: 审阅循环逻辑

### 建议修复

1. 增加退出条件：当所有章节都 failed 或 completed 时退出 Phase 4b
2. 增加错误处理：当没有 written 状态的章节时，退出 Phase 4b 并报告错误
3. 增加状态机不变量：SM-20: Phase 4b 必须在所有章节都 failed/completed 时退出

## E2E 测试结果总结

### 完成的 Phase

- Phase 0a: ✅ 初始化
- Phase 0b: ✅ 素材整理
- Phase 1: ✅ 需求分析
- Phase 2: ✅ 大纲生成
- Phase 3: ✅ 素材准备
- Phase 4a: ✅ 写作（所有章节完成）
- Phase 4b: ❌ 审阅（所有任务失败，无法退出）

### 失败的章节

所有 7 个章节都因为 exceeded_max_rounds_validation 而 failed：
- ch001: 12581 字 > 上限 8000 字 (+57%)
- ch002: 9970 字 > 上限 7800 字 (+28%)
- ch003: 13319 字 > 上限 7800 字 (+71%)
- ch004: 8178 字 > 上限 7800 字 (+5%)
- ch005: 12278 字 > 上限 7800 字 (+57%)
- ch006: 12132 字 > 上限 7800 字 (+55%)
- ch007: 11948 字 > 上限 8000 字 (+49%)

### 发现的 Bug

1. **Bug 1**: Writer 字数控制仍然失败（Issue #79）
2. **Bug 2**: Reviewer verdict 矛盾（Issue #80）
3. **Bug 3**: 审阅流程陷入循环
4. **Bug 4**: Phase 4b 无法退出当所有章节 failed（新 Issue）

### 下一步

1. 创建 Issue 跟踪 Bug 4
2. 修复所有 bug
3. 重新运行 E2E 测试
