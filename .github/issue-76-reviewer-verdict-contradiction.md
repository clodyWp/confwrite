## Bug 描述

审阅者检测到字数超标，但 verdict 仍为 "accept"，逻辑矛盾。

## 日志证据

```
Warning: ⚠️ 验证失败 (reviewer ch001):
  ❌ 章节字数超标: 12329 字 > 上限 8000 字
  ❌ verdict 矛盾: verdict 为 accept，但审阅报告中发现字数问题
```

## 根因分析

审阅 prompt 中字数检查的优先级不够高：
1. 审阅者检测到字数超标
2. 但在综合评估时仍给出 "accept"
3. 说明字数检查的权重不够

## 修复方案

在审阅 prompt 中明确：
1. 字数超标是硬性约束
2. 字数超标时 verdict 必须为 "revise"
3. 提供压缩策略指导

## 验收标准

- [ ] 审阅 prompt 明确字数为硬性约束
- [ ] 字数超标时 verdict 必须为 "revise"
- [ ] 单元测试验证

## 优先级

**Medium** - 与 WORD-COUNT-002 相关
