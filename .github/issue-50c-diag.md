## 背景

当前 DIAG 日志（`dispatcher/index.ts:83`, `writing/task-executor.ts:68`）绕过 EventBus，直接写入独立的 `diag-*.json` 文件。

这导致：
- 日志碎片化（两套日志系统）
- 无法统一查询
- 难以重建完整执行流程

## 改进方案

**选项 A（推荐）**：迁移到 EventBus
- `dispatcher/index.ts:83` 的 DIAG 日志改为 `eventBus.emit()`
- 统一日志输出格式

**选项 B**：保持独立但文档化
- 如果 DIAG 需要在 EventBus 初始化前工作，保持独立
- 在 `AGENTS.md` 中明确说明两套日志的用途

## 验收标准

- [ ] DIAG 日志与 EventBus 的关系明确
- [ ] 无重复记录（同一事件不在两处都记录）
- [ ] `npm run build && npm test` 通过
- [ ] 更新 CHANGELOG.md
- [ ] 更新 AGENTS.md（如果选择选项 B）

## 技术约束

- 所有相对导入带 `.js` 后缀
- 用 `path.join()` 拼路径
- 测试用 vitest
- 不要 mock `fs`，用临时目录

## 参考

- Council 分析：Issue #50
- DIAG 日志位置：`dispatcher/index.ts:83`, `writing/task-executor.ts:68`
