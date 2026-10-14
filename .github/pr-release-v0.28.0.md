## 关联 Issue

版本发布 PR，包含多个已合并的 feature 和 fix。

## 变更类型

- [x] 新功能
- [ ] Bug 修复
- [ ] 重构
- [x] 文档
- [x] 测试

## 变更描述

v0.28.0 发布，包含大量改进和修复：
- Issue #93: Pre-commit Hook (husky + lint-staged)
- Issue #73: TUI 状态行改进
- Issue #87: Dirty Mock 测试
- Issue #91: LLM 解析边界测试
- Issue #94: 变更影响分析工具
- Issue #90: OutlineGenerator LLM 集成测试
- Issue #89: PiSubagentExecutor SDK 测试
- Issue #25/#26: PR Evidence + Node 22/24 支持
- Issue #96: 移除字数截断，改为渐进式响应
- E2E Skill 职责分离重写

## 缺陷修复证据

> Bug 修复必填；其他类型请在每项填写"不适用"。CI 会检查这些字段非空。

- 症状与复现：不适用（版本发布）
- 根因证据：不适用（版本发布）
- 回归测试：1602 tests passed, 28 skipped
- 验证命令与结果：npm run build 通过, npm test 通过, npm run docs:check 通过

## 文档更新检查清单

- [x] 受影响的用户文档、配置或架构文档已更新（如适用）
- [x] SKILL.md 命令列表与 src/index.ts 一致
- [x] README.md 目录结构与实际与实际一致
- [x] AGENTS.md 架构描述与代码一致
- [ ] BUGS.md Bug 状态已更新（如适用）

## 测试

- 实际运行的命令和结果：
  - `npm run build` — 通过
  - `npm test` — 1602 passed, 28 skipped
  - `npm run docs:check` — 通过

## Stats
- 测试总数：1602 passed, 28 skipped
- 覆盖率：Statements 94.16%, Branches 87.83%, Functions 94.66%
- CI：Node 22.x + 24.x, PR Evidence 检查
