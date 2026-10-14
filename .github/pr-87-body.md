## Summary

Issue #87: Dirty Mock 测试 — 模拟 LLM 异常输出的系统韧性测试

### Changes
- 新增 `DirtyMockExecutor`（`src/scheduler/dirty-mock-executor.ts`）
  - 支持 6 种脏输出模式：bad_json, empty, oversized, garbled, timeout, contradictory_review
  - 支持概率控制和序列模式
  - 支持 per-type 配置覆盖全局
- 新增单元测试 `tests/scheduler/dirty-mock-executor.test.ts`（18 tests）
- 新增集成测试 `tests/writing/dirty-output-resilience.test.ts`（27 tests）
- 新增 spec `specs/dirty-mock-testing.md`

### Spec Coverage
- INV-DM-1: 系统不得因脏输出而崩溃
- INV-DM-2: 脏输出必须被检测并记录
- INV-DM-3: 连续脏输出触发章节失败
- INV-DM-4: 脏输出不污染其他章节
- DIRTY-1~6: 各类型脏输出的行为不变量

Closes #87
