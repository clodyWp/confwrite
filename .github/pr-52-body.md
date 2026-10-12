## 关联 Issue

Closes #47 (周期 3 of 4)

## 变更类型

- [x] Bug 修复
- [x] 测试

## 变更描述

修复 phase 4d 的 allExceeded 死锁问题。

**问题**：当所有待修复章节超过 maxRounds 时，validate 返回 blocked，但 exit 条件永远不满足（章节仍是 reviewed+revise），导致死锁。

**修复**：validate 检测到 allExceeded 时，强制将章节标记为终态（completed/failed），而不是返回 blocked。

## 文档更新检查清单

- [x] CHANGELOG.md 已添加版本条目
- [x] BUGS.md Bug 状态已更新（新增 Bug 40）
- [x] specs/state-machine.md 已更新（新增 SM-16 不变量）

## 测试

- [x] `npm run build` 通过
- [x] `npm test` 通过（1335 passed, 27 skipped）
- [x] 新增回归测试覆盖原始症状（6/6 pass）

## 技术约束

- 所有相对导入带 .js 后缀
- 不 mock fs，用临时目录
- SDD 流程：spec → test → fix → validate

## 残留风险

- validate 现在修改状态（违反 §5.1 纯函数规则），已在 SM-16 中记录
- 需要额外一个 tick：validate 标记章节 → execute 发现无待修复章节 → 下一 tick exit 条件满足
