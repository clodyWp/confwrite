# Issue #86: 测试覆盖率改进计划

## 背景

当前项目有 82 个源文件、180 个测试文件（测试/源码比 2.2:1），测试数量充足。但存在以下问题：

1. **没有覆盖率工具** — 无法量化哪些代码行/分支未被测试覆盖
2. **所有 E2E 测试用 MockSubagentExecutor** — 返回"完美"输出，不模拟真实 LLM 的脏数据
3. **LLM 输出解析只覆盖了常见情况** — 畸形 JSON、截断输出、格式变异等边界场景不足
4. **OutlineGenerator 的 LLM 路径从未在集成测试中走过** — 3 级回退中的 LLMPlanner 路径未验证
5. **PiSubagentExecutor 的 SDK 交互层未测试** — `createAgentSession` + `session.prompt()` 流程未覆盖

## Part A: 测试覆盖率改进

| Issue | 优先级 | 内容 | 预估工时 | 依赖 |
|-------|--------|------|----------|------|
| #88 | P0 | 加覆盖率工具（vitest coverage） | 30 min | 无 |
| #87 | P1 | Dirty Mock — 模拟真实 LLM 脏输出 | 2-3 h | #88 |
| #91 | P2 | LLM 输出解析边界测试 | 1-2 h | 无 |
| #90 | P3 | OutlineGenerator LLM 路径集成测试 | 1 h | 无 |
| #89 | P4 | PiSubagentExecutor SDK 交互测试 | 2 h | 无 |

## Part B: 回归保护机制补强

| Issue | 优先级 | 内容 | 预估工时 | 依赖 |
|-------|--------|------|----------|------|
| #93 | P0 | Pre-commit Hook（husky + lint-staged） | 30 min | 无 |
| #92 | P1 | CI 覆盖率门槛 + E2E 冒烟测试 | 1-2 h | #88 |
| #94 | P2 | 变更影响分析（测试与模块关联标注） | 2-3 h | 无 |

## 迭代顺序

```
Sprint 1（1h）:  #88 P0 + #93 P0 → 看见盲区 + 本地拦截
Sprint 2（1-2h）: #91 P2 + #92 P1 → LLM 解析边界 + CI 门槛
Sprint 3（2-3h）: #87 P1 → Dirty Mock 系统韧性验证
Sprint 4（3-4h）: #90 P3 + #89 P4 + #94 P2 → 集成盲区 + 影响分析
```

## 不做的事

- ❌ 不引入真实 LLM 的 CI 测试（成本高、不稳定）
- ❌ 不追求 100% 覆盖率（纯类型文件、入口文件跳过）
- ❌ 不重构现有测试（只增量补充）

## 验收标准

- [ ] `npm run test:coverage` 可用，生成 HTML 报告
- [ ] src/ 行覆盖率 ≥ 80%
- [ ] Dirty Mock 测试覆盖 ≥ 6 种脏输出场景
- [ ] LLM 解析边界测试覆盖 ≥ 6 种畸形输入
- [ ] OutlineGenerator LLM 路径有集成测试
- [ ] PiSubagentExecutor SDK 交互有 mock 测试
