## Summary

实现 Issue #88：添加测试覆盖率工具

## Changes

### 1. 安装依赖

- 添加 `@vitest/coverage-v8@1.6.0`（与 vitest 1.6.1 兼容）

### 2. 配置 vitest.config.ts

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'json-summary'],
  include: ['src/**/*.ts'],
  exclude: [
    'src/index.ts',          // Extension 入口，注册命令
    'src/**/types.ts',       // 纯类型定义
    'src/scheduler/mock-executor.ts',  // 测试工具
    'src/scheduler/configurable-mock-executor.ts',  // 测试工具
  ],
}
```

### 3. 添加 npm script

```json
"test:coverage": "vitest run --coverage"
```

## Baseline Coverage

| 指标 | 覆盖率 |
|------|--------|
| Statements | 94.16% |
| Branches | 87.83% |
| Functions | 94.66% |
| Lines | 94.16% |

### 低覆盖率文件

| 文件 | 覆盖率 | 原因 |
|------|--------|------|
| scheduler/pi-executor.ts | 35.42% | 真实 LLM 执行器，需要 E2E 测试 |
| diagrams/png-converter.ts | 72.97% | 需要外部工具 (sharp) |
| commands/outline.ts | 80.58% | 部分错误处理路径未覆盖 |

### 测试统计

- **测试文件**: 181 passed, 3 skipped
- **测试用例**: 1424 passed, 32 skipped
- **执行时间**: 35.46s

## Usage

```bash
# 运行覆盖率测试
npm run test:coverage

# 查看 HTML 报告
open coverage/index.html
```

## Related Issues

Closes #88
