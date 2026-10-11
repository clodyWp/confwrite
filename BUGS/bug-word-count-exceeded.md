# Bug: 章节字数严重超标

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Phase 4a (写作), Phase 4b (审阅)  
**严重程度**: P1 - 严重

## 问题描述

所有章节字数都严重超出预算范围，平均超标 2.2 倍，总计 175,741 字，远超目标 50,000 字（3.5 倍）。

## 复现步骤

1. 执行 E2E 测试（LMERP2V2-v6 项目）
2. 配置：目标字数 50000，并发数 2
3. 等待写作流程完成
4. 检查 `drafts/chapters/ch*-v1.md` 文件字数

## 实际数据

| 章节 | 实际字数 | 预算范围 | 超标倍数 |
|------|---------|---------|---------|
| ch001 | 15,270 | 5,000-8,000 | 1.9x |
| ch002 | 14,883 | 5,000-8,000 | 1.9x |
| ch003 | 17,610 | 5,000-8,000 | 2.2x |
| ch004 | 17,793 | 5,000-8,000 | 2.2x |
| ch005 | 18,120 | 5,000-8,000 | 2.3x |
| ch006 | 21,033 | 5,000-8,000 | 2.6x |
| ch007 | 19,029 | 5,000-8,000 | 2.4x |
| ch008 | 21,477 | 5,000-8,000 | 2.7x |
| ch009 | 14,016 | 5,000-8,000 | 1.8x |
| ch010 | 16,510 | 5,000-8,000 | 2.1x |

**总计**: 175,741 字  
**目标**: 50,000 字  
**超标**: 3.5 倍

## 预期行为

- 每章字数应在 5,000-8,000 范围内（基于 50000 字目标和 10 章节计算）
- 总计应接近 50,000 字（允许 ±20% 偏差，即 40,000-60,000）
- Reviewer 应检查字数并反馈给 Writer 调整

## 实际行为

- 所有章节超标 1.8-2.7 倍
- 总计超标 3.5 倍
- Reviewer 未检查字数或未反馈
- Writer 未遵守字数约束

## 根本原因分析

### 可能原因

1. **Writer prompt 未强制字数约束**
   - Writer subagent 的 prompt 可能没有明确要求遵守字数预算
   - 或者字数约束不够强制（只是"建议"而非"必须"）

2. **Reviewer 未检查字数**
   - Reviewer 的审阅标准可能不包含字数检查
   - 或者检查了但未反馈给 Writer

3. **字数计算方式不一致**
   - 大纲生成时的字数预算可能基于字符数
   - Writer 实际输出可能按词数计算
   - 中文字符 vs 英文字符的计算差异

4. **并发数配置未生效**
   - 本次测试配置并发数=2，但实际可能用的并发=1
   - 并发数可能影响字数控制逻辑（待验证）

## 影响

- **用户体验**: 生成的文档过长，不符合用户预期
- **资源浪费**: 消耗更多 token 和时间
- **质量问题**: 内容可能冗余、重复

## 修复建议

### 短期修复（P1）

1. **强化 Writer prompt**
   ```typescript
   // src/subagent/writer-prompt.ts
   const wordCountConstraint = `
   你必须严格遵守字数预算：${minWords}-${maxWords} 字。
   如果超出范围，必须压缩内容。
   这是硬性要求，不是建议。
   `;
   ```

2. **Reviewer 增加字数检查**
   ```typescript
   // src/subagent/reviewer-prompt.ts
   const reviewCriteria = `
   - 检查字数是否在预算范围内（${minWords}-${maxWords}）
   - 如果超出，verdict 必须为 "revise"
   - 反馈中明确指出："字数超标，请压缩到 XXX 字以内"
   `;
   ```

3. **添加字数验证 gate**
   ```typescript
   // src/orchestrator/phases.ts - phase4b
   const wordCountCheck = (chapter: Chapter) => {
     const actual = countWords(chapter.content);
     const [min, max] = chapter.wordBudget;
     if (actual > max * 1.2) {
       return { pass: false, error: `字数超标: ${actual} > ${max}` };
     }
     return { pass: true };
   };
   ```

### 长期修复（P2）

1. **动态字数调整**
   - 根据实际输出动态调整后续章节的字数预算
   - 如果前几章超标，后续章节自动降低预算

2. **字数趋势监控**
   - 在日志中记录每章实际字数 vs 预算
   - 生成字数趋势报告，帮助优化 prompt

## 相关文件

- `src/subagent/writer-prompt.ts` - Writer prompt 生成
- `src/subagent/reviewer-prompt.ts` - Reviewer prompt 生成
- `src/orchestrator/phases.ts` - Phase 4a/4b 定义
- `src/outline/generator.ts` - 字数预算计算

## 验证方法

修复后执行 E2E 测试，检查：
1. 每章字数是否在预算范围内（允许 ±10% 偏差）
2. 总计字数是否接近目标（允许 ±20% 偏差）
3. Reviewer 是否正确反馈字数问题

## 备注

本次测试（LMERP2V2-v6）的并发数配置可能未生效（实际用的并发=1），需要单独验证并发数对字数控制的影响。
