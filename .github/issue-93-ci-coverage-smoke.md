# Issue #92: P1 — CI 覆盖率门槛 + E2E 冒烟测试

**父 Issue**: #86

## 问题

CI 目前只跑 `build + test`，没有：
1. **覆盖率门槛** — PR 导致覆盖率大幅下降无感知
2. **E2E 冒烟测试** — 单元测试全过，真实流程崩溃

## 方案

### 1. 覆盖率门槛（依赖 #88 先完成）

在 `vitest.config.ts` 中设置阈值：

```typescript
coverage: {
  thresholds: {
    lines: 80,
    branches: 70,
    functions: 75,
  },
}
```

CI 中加 step：
```yaml
- name: Coverage check
  run: npx vitest run --coverage
```

### 2. E2E 冒烟测试

新建 `tests/e2e/smoke.test.ts`，跑一个最小完整流程：

```typescript
describe('E2E Smoke Test', () => {
  it('init → organize → outline → write → review → assemble 不崩溃', async () => {
    // 最小需求文档（~200 字）
    // 只生成 2 章
    // 用 MockSubagentExecutor
    // 验证最终产物存在
  }, 30000);  // 30s timeout
});
```

CI 中单独跑冒烟测试：
```yaml
- name: E2E Smoke Test
  run: npx vitest run tests/e2e/smoke.test.ts
```

### 3. 覆盖率报告上传（可选）

```yaml
- name: Upload coverage
  uses: codecov/codecov-action@v4
  if: always()
```

## 验收标准

- [ ] CI 覆盖率低于阈值时失败
- [ ] E2E 冒烟测试在 CI 中运行
- [ ] 冒烟测试覆盖 init → assemble 完整路径
- [ ] 覆盖率报告可在 PR 中查看

## 文档更新

- [ ] AGENTS.md §3 开发硬约束 — 添加覆盖率门槛说明
- [ ] CHANGELOG.md — 添加条目

## 预估工时

1-2 小时

## 依赖

- #88（P0 覆盖率工具）必须先完成
