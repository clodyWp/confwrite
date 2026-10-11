# Bug: 组装后章节数与大纲不一致

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: Phase 6 (组装), Phase 7 (定稿)  
**严重程度**: P2 - 警告

## 问题描述

大纲定义了 10 个章节（ch001-ch010），但组装后的文档有 11 个二级标题。

finalization.json 报告：
- `level2Headings: 11`
- 标题层级检查警告：`章节数不匹配：大纲有 10 个章节，文档有 11 个章节`

## 复现步骤

1. 执行 E2E 测试（LMERP2V2-v6）
2. 检查 outline.md → 10 个章节
3. 检查 output/finalization.json → 11 个二级标题
4. 检查 termConsistency → "warning"

## 可能原因

1. 组装时多出了一个标题（如文档标题被算作章节）
2. Writer 在某个章节中额外添加了二级标题
3. 组装器的章节计数逻辑与大纲解析不一致

## 影响

- 文档结构不完整或不一致
- 目录可能显示多余的条目
- 术语一致性检查降级为 warning

## 验证命令

```bash
# 检查大纲章节数
grep -c "^ch[0-9]" outline.md

# 检查文档二级标题数
grep -c "^## " output/final.md

# 检查 finalization.json
cat output/finalization.json | jq '.stats.level2Headings'
```

## 相关文件

- `src/assemble/assembler.ts` - 组装逻辑
- `src/assemble/finalizer.ts` - 定稿检查
