## Summary

完成可复现 Bug 测试的三项工作：

1. **集成到 CI**：添加专门的测试步骤，确保每次提交都运行可复现测试
2. **文档化**：创建完整的测试文档 `docs/reproducible-bug-tests.md`
3. **扩展覆盖**：新增 5 个测试用例，覆盖更多历史 bug

## Changes

### 1. CI 集成 (`.github/workflows/ci.yml`)

```yaml
- name: Run reproducible bug tests
  run: |
    npm test -- tests/reproducible-bugs.test.ts tests/reproducible-bugs-extended.test.ts tests/reproducible-bugs-concurrency.test.ts tests/reproducible-bugs-validation.test.ts
  continue-on-error: false
```

### 2. 文档化 (`docs/reproducible-bug-tests.md`)

- 概述和测试文件列表
- ConfigurableMockExecutor 使用说明
- 18 个测试用例详解
- 运行方法和 CI 集成说明

### 3. 扩展覆盖 (`tests/reproducible-bugs-validation.test.ts`)

新增 5 个测试用例：
- Issue #20: OutputValidator 不验证 Reviewer 的字数
- Issue #36: 跨平台兼容性：路径拼接问题
- Issue #19: minChapterChars 与 wordBudget 矛盾
- Issue #17: 字数控制失效（2个用例）

## Test Results

```
✓ tests/reproducible-bugs-concurrency.test.ts (3 tests) 46ms
✓ tests/reproducible-bugs.test.ts (4 tests) 55ms
✓ tests/reproducible-bugs-validation.test.ts (5 tests) 49ms
✓ tests/reproducible-bugs-extended.test.ts (6 tests) 71ms

Test Files: 4 passed (4)
Tests: 18 passed (18)
Duration: 732ms
```

## Coverage

**18 个可复现测试**，覆盖 **16 个历史 bug**：

| 测试文件 | 测试数 | 覆盖的 Issue |
|---------|-------|-------------|
| `reproducible-bugs.test.ts` | 4 | #80, #96, #42 |
| `reproducible-bugs-extended.test.ts` | 6 | #63, #74, #81, #47, #35, #41 |
| `reproducible-bugs-concurrency.test.ts` | 3 | #43 |
| `reproducible-bugs-validation.test.ts` | 5 | #20, #36, #19, #17 |

## Related Issues

Closes #98
