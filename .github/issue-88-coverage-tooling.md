# Issue #88: P0 — 添加测试覆盖率工具

**父 Issue**: #86

## 问题

当前 `vitest.config.ts` 没有配置覆盖率，`package.json` 没有 `@vitest/coverage-v8` 依赖。无法量化哪些代码行/分支未被测试覆盖，改进没有方向。

## 方案

### 1. 安装依赖

```bash
npm install -D @vitest/coverage-v8
```

### 2. 配置 vitest.config.ts

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',          // Extension 入口，注册命令
        'src/**/types.ts',       // 纯类型定义
        'src/scheduler/mock-executor.ts',  // 测试工具
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
});
```

### 3. 添加 npm script

```json
"test:coverage": "vitest run --coverage"
```

### 4. 首次运行，记录基线

运行 `npm run test:coverage`，记录当前覆盖率数字到 Issue 评论中，作为后续改进的基线。

## 验收标准

- [ ] `npm run test:coverage` 生成 HTML 报告
- [ ] 报告可在浏览器中查看（`coverage/index.html`）
- [ ] 记录基线覆盖率数字（text summary）
- [ ] CI 不强制覆盖率门槛（先观察，后续再设 threshold）

## 文档更新

- [ ] AGENTS.md §3 开发硬约束 — 添加覆盖率命令说明
- [ ] CHANGELOG.md — 添加条目

## 预估工时

30 分钟
