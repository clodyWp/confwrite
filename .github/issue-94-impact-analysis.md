# Issue #94: P2 — 变更影响分析（测试与模块关联标注）

**父 Issue**: #86

## 问题

当前 180 个测试文件，改了一个 `src/` 文件后，不知道：
- 哪些测试会受影响
- 该跑哪些测试来验证
- CI 跑全量测试要多久

`vitest related` 可以基于文件依赖图找到相关测试，但前提是测试文件的 import 链要完整。当前部分 E2E 测试直接 `import` 了多个模块，依赖图不够精确。

## 方案

### 1. 测试文件标注 `@affects`

在每个测试文件头部添加注释，标注该测试覆盖的模块：

```typescript
/**
 * @affects orchestrator, dispatcher, writing
 * 验证 Phase 4 写作→审阅→修复循环的状态流转
 */
describe('Phase 4 write-review-fix cycle', () => { ... });
```

### 2. 脚本解析 `@affects` 标签

新建 `scripts/find-affected-tests.js`：

```javascript
// 输入：变更的文件列表
// 输出：受影响的测试文件列表
// 逻辑：
// 1. 解析每个测试文件的 @affects 标签
// 2. 匹配变更文件所属模块
// 3. 输出需要跑的测试列表
```

### 3. CI 中使用

```yaml
- name: Find affected tests
  id: affected
  run: node scripts/find-affected-tests.js

- name: Run affected tests
  run: npx vitest run ${{ steps.affected.outputs.tests }}
```

### 4. 备选方案：直接用 `vitest related`

如果 `@affects` 标注维护成本高，可以改用：

```bash
vitest related $(git diff --name-only HEAD~1)
```

Vitest 会基于 import 依赖图自动找到相关测试。

## 验收标准

- [ ] 能快速定位"改了 X 文件，需要跑哪些测试"
- [ ] CI 中只跑受影响的测试（或全量，取决于变更范围）
- [ ] 文档说明如何标注和使用

## 文档更新

- [ ] AGENTS.md §3.3 测试规范 — 添加 @affects 标注规范
- [ ] CHANGELOG.md — 添加条目

## 预估工时

2-3 小时
