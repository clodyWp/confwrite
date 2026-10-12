# Bug: Writer/Fixer 并发始终为 0/1

**状态**: 🔴 待修复  
**优先级**: P1  
**发现版本**: v0.22.0  
**发现日期**: 2026-10-12  
**GitHub Issue**: #43

---

## 问题描述

E2E 测试 v22 中，日志显示所有 Writer/Fixer 任务的并发数始终为 0/1，没有实现并行写作。

---

## 现象

```
🚀 [Writer] 开始写作 ch002 (并发 0/1)
🚀 [Writer] 开始写作 ch003 (并发 0/1)
🔧 [Fixer] 开始写作 ch001 (并发 0/1)
```

所有章节串行执行，6 章写作耗时约 30 分钟。

---

## 可能原因

1. `writing/orchestrator.ts` 中并发控制配置为 1
2. Subagent 调度器没有正确启用并行
3. 配置文件中 `maxConcurrent` 设置为 1

---

## 验收标准

- [ ] 确认并发配置项及默认值
- [ ] Writer 任务能并行执行（如 2-3 个同时运行）
- [ ] 日志显示正确的并发数（如 `并发 2/3`）
- [ ] E2E 测试总耗时显著缩短

---

## 相关文件

- `src/writing/orchestrator.ts` — 并发控制逻辑
- `src/scheduler/` — Subagent 调度器
