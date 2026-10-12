# Bug: LLM 不遵守字数约束

**状态**: 🔴 待修复  
**优先级**: P0  
**发现版本**: v0.22.0  
**发现日期**: 2026-10-12  
**GitHub Issue**: #42

---

## 问题描述

E2E 测试 v22 中发现 LLM 子代理在写作/修复/审阅过程中不遵守字数约束。

---

## 现象

### Writer 产出严重超标

| 章节 | 预算上限 | 实际字数 | 超标比例 |
|------|----------|----------|----------|
| ch001 | 7800 | 10999 | 141% |
| ch002 | 7800 | 9260 | 119% |
| ch003 | 7800 | 11510 | 148% |
| ch004 | 7800 | 13653 | 175% |
| ch005 | 7800 | 11351 | 146% |
| ch006 | 7800 | 11325 | 145% |

### Fixer 修复后反而增加字数

| 章节 | v1 (Writer) | v2 (Fixer) | 变化 |
|------|-------------|------------|------|
| ch001 | 10999 | 12459 | +1460 |
| ch003 | 26362 | 30348 | +3986 |

### Reviewer verdict 矛盾

Reviewer 输出 verdict=accept，但审阅报告 issues 中提到了字数超标问题。

---

## 根因分析

DIAG 日志确认 wordBudget 已正确传递到 prompt。问题是 **Prompt 工程问题**，不是代码 bug。

---

## 验收标准

- [ ] Writer prompt 强化字数约束
- [ ] Fixer prompt 明确要求精简到预算范围内
- [ ] Reviewer prompt 统一 verdict 判断逻辑
- [ ] E2E 测试 Writer 产出在预算范围内（允许 10% 容差）
- [ ] E2E 测试 Fixer 产出比 v1 更短

---

## 相关文件

- `src/writing/task-executor.ts` — Writer/Fixer prompt 生成
- `src/writing/reviewer-executor.ts` — Reviewer prompt 生成
- `knowledge/` — 知识库中的写作指南
