# Issue #93: P0 — 添加 Pre-commit Hook（husky + lint-staged）

**父 Issue**: #86

## 问题

当前本地 `git commit` 前没有任何自动化检查。开发者（或 AI agent）可能提交：
- 编译不过的 TypeScript
- 跑不过的测试
- 不符合 lint 规则的代码

这些错误推到 CI 才发现失败，浪费时间和 CI 资源。

## 方案

### 1. 安装依赖

```bash
npm install -D husky lint-staged
npx husky init
```

### 2. 配置 `.husky/pre-commit`

```bash
npx lint-staged
```

### 3. 配置 `package.json`

```json
"lint-staged": {
  "*.ts": [
    "vitest related --run --passWithNoTests",
    "tsc --noEmit"
  ]
}
```

### 4. 验证

- `git commit` 时自动跑相关测试 + 类型检查
- 失败则阻止提交
- 只跑受变更文件影响的测试（`vitest related`），不跑全量

## 验收标准

- [ ] `npm install` 后自动安装 husky hooks
- [ ] `git commit` 触发 lint-staged
- [ ] TypeScript 编译失败时阻止提交
- [ ] 相关测试失败时阻止提交
- [ ] README.md / AGENTS.md 更新开发流程说明

## 文档更新

- [ ] AGENTS.md §3 开发硬约束 — 添加 pre-commit 说明
- [ ] CHANGELOG.md — 添加条目

## 预估工时

30 分钟
