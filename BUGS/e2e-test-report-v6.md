# E2E 测试报告：LMERP2V2-v6

**测试日期**: 2026-01-09  
**测试环境**: water-ali (远程机器)  
**ConfWrite 版本**: 0.21.1  
**Pi 版本**: 1.1.0  

---

## 测试目标

- 验证完整流程（init → organize → write → done）
- 测试并发数=2 的执行效果
- 验证字数控制机制（目标 50,000 字，每章 5,000-8,000 字）
- 检查图表生成质量

---

## 测试配置

| 配置项 | 预期值 | 实际值 | 状态 |
|--------|--------|--------|------|
| 项目名称 | LMERP2V2-v6 | LMERP2V2-v6 | ✅ |
| 目标字数 | 50,000 | 50,000 | ✅ |
| 并发数 | 2 | 1 | ❌ 未配置 |
| 模板 | technical-proposal | technical-proposal | ✅ |
| 素材类型 | Word 文件 | MD 文件 | ⚠️ 降级测试 |

---

## 执行结果

### 流程状态

| 阶段 | 状态 | 耗时 | 备注 |
|------|------|------|------|
| Phase 0a (初始化) | ✅ 完成 | < 1s | - |
| Phase 0b (素材整理) | ✅ 完成 | ~30s | 167 文件，21 分类 |
| Phase 1 (需求分析) | ⚠️ 异常 | - | requirements.json 未生成 |
| Phase 2 (大纲规划) | ✅ 完成 | ~90s | 10 章节 |
| Phase 3 (素材准备) | ✅ 完成 | - | 自动跳过 |
| Phase 4a (写作) | ✅ 完成 | ~42min | 10 章全部完成 |
| Phase 4b (审阅) | ✅ 完成 | ~26min | 10 章全部 accept |
| Phase 4c (决策) | ✅ 完成 | < 1s | - |
| Phase 5 (图表生成) | ✅ 完成 | ~2min | 13 图表，9 warnings |
| Phase 6 (组装) | ✅ 完成 | < 1s | 11 章节（不匹配） |
| Phase 7 (定稿) | ✅ 完成 | < 1s | 117,079 字 |
| Phase 8 (导出) | ✅ 完成 | ~5s | final.docx 661K |

**总耗时**: ~75 分钟  
**最终状态**: done ✅

---

## 发现的问题

### P0 - 阻塞问题（4 个）

| # | Bug ID | 描述 | 影响 |
|---|--------|------|------|
| 1 | bug-wordbudget-not-passed-to-reviewer.md | wordBudget 未传递给 Reviewer，第 7 节未生成 | Reviewer 没有上限检查 |
| 2 | bug-reviewer-prompt-duplicate-word-check.md | Reviewer prompt 中字数标准重复且矛盾 | LLM 收到矛盾指令 |
| 3 | bug-reviewer-prompt-word-limit.md | Reviewer 审阅标准与大纲预算矛盾 | 字数控制完全失效 |
| 4 | bug-min-chapter-chars-mismatch.md | minChapterChars 配置值与 wordBudget 不一致 | 实际 task 文件使用 8000 而不是 5000 |

### P1 - 严重问题（3 个）

| # | Bug ID | 描述 | 影响 |
|---|--------|------|------|
| 5 | bug-phase1-state-transition.md | Phase 1 状态转换绕过状态机 | 流程可能在缺少必要产物时继续执行 |
| 6 | bug-word-count-exceeded.md | 章节字数严重超标（平均 2.2x） | 总计 175,741 字，目标 50,000 字 |
| 7 | bug-reviewer-word-count.md | Reviewer 发现超标但仍然 accept | 没有触发修复循环 |

### P2 - 警告问题（2 个）

| # | Bug ID | 描述 | 影响 |
|---|--------|------|------|
| 8 | bug-chapter-count-mismatch.md | 大纲 10 章，文档 11 个二级标题 | 文档结构不一致 |
| 9 | bug-phase1-requirements-json.md | Phase 1 未生成 requirements.json | 可能是 #5 的连锁反应 |

---

## 字数统计

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
| **总计** | **175,741** | **50,000** | **3.5x** |

---

## Subagent 执行统计

### Writer Tasks

| 任务 | 耗时 | Turns | Tool Calls | 状态 |
|------|------|-------|------------|------|
| write-ch001-r1 | 211.9s | 13 | 19 | ✅ |
| write-ch002-r1 | 198.8s | - | - | ✅ |
| write-ch003-r1 | 395.7s | - | - | ✅ |
| write-ch004-r1 | 211.9s | - | - | ✅ |
| write-ch005-r1 | 250.3s | - | - | ✅ |
| write-ch006-r1 | 284.4s | - | - | ✅ |
| write-ch007-r1 | 225.3s | - | - | ✅ |
| write-ch008-r1 | 287.8s | - | - | ✅ |
| write-ch009-r1 | 209.8s | - | - | ✅ |
| write-ch010-r1 | 223.8s | - | - | ✅ |

**平均耗时**: 250s/章  
**总耗时**: ~42 分钟

### Reviewer Tasks

| 任务 | 耗时 | Turns | Tool Calls | verdict |
|------|------|-------|------------|---------|
| review-ch001-r1 | 135.3s | 14 | 13 | accept |
| review-ch002-r1 | 120.4s | - | - | accept |
| review-ch003-r1 | 205.3s | - | - | accept |
| review-ch004-r1 | 168.3s | - | - | accept |
| review-ch005-r1 | 227.7s | - | - | accept |
| review-ch006-r1 | 111.0s | - | - | accept |
| review-ch007-r1 | 104.8s | - | - | accept |
| review-ch008-r1 | 132.5s | - | - | accept |
| review-ch009-r1 | 132.3s | - | - | accept |
| review-ch010-r1 | 242.5s | - | - | accept |

**平均耗时**: 158s/章  
**总耗时**: ~26 分钟  
**全部 accept**: 没有触发修复循环

---

## 图表生成统计

| 指标 | 数值 |
|------|------|
| 总图表数 | 13 |
| 成功生成 | 13 |
| 失败 | 0 |
| 跳过 | 0 |
| Warnings | 9 |

### Warnings 详情

所有 warnings 都是 `GROUP_GAP_RATIO`（组间距/组内间距比不足）：

| 图表 ID | 实际比例 | 要求比例 |
|---------|---------|---------|
| ch001-fig1 | 1.9:1 | ≥3:1 |
| ch002-fig1 | 1.7:1 | ≥3:1 |
| ch003-fig1 | 2.0:1 | ≥3:1 |
| ch003-fig2 | 1.8:1 | ≥3:1 |
| ch004-fig2 | 1.8:1 | ≥3:1 |
| ch007-fig1 | 1.9:1 | ≥3:1 |
| ch007-fig2 | 1.0:1 | ≥3:1 |
| ch008-fig1 | 2.2:1 | ≥3:1 |
| ch008-fig2 | 1.8:1 | ≥3:1 |

**影响**: 图表视觉质量下降，组间区分度不够

---

## 最终产物

| 文件 | 大小 | 状态 |
|------|------|------|
| output/final.docx | 661K | ✅ |
| output/final.md | 392K | ✅ |
| output/finalization.json | 9.7K | ✅ |
| assembly/merged-v1.md | 392K | ✅ |

### 文档统计

| 指标 | 数值 |
|------|------|
| 字符数 | 156,814 |
| 词数 | 117,079 |
| 标题数 | 576 |
| 二级标题 | 11 |
| 表格 | 307 |
| 图片 | 13 |
| 链接 | 10 |

---

## 测试覆盖不足

| 项目 | 预期 | 实际 | 原因 |
|------|------|------|------|
| 并发数=2 | 测试并发执行 | 实际并发=1 | 未配置 confwrite.config.json |
| Word → MD 转换 | 测试格式转换 | 使用已解析的 MD | 测试数据准备不足 |

---

## 根因分析

### 字数超标问题的因果链

```
bug-wordbudget-not-passed-to-reviewer.md
wordBudget 未传递给 Reviewer
  ↓
bug-reviewer-prompt-duplicate-word-check.md
Reviewer prompt 中第 7 节（字数预算检查）未生成
  ↓
bug-min-chapter-chars-mismatch.md
第 3 节使用 minChapterChars（实际值 8000）作为下限
  ↓
Reviewer 只看到"≥ 8000 字"要求，没有上限检查
  ↓
bug-reviewer-word-count.md
Writer 写了 15000+ 字，Reviewer 仍然 accept
  ↓
bug-word-count-exceeded.md
所有章节超标 2.2 倍，总计超标 3.5 倍
```

### 核心问题

1. **wordBudget 未传递** - dispatcher 代码正确，但运行时 wordBudget 为 undefined
2. **Prompt 矛盾** - 第 3 节和第 7 节字数标准不一致
3. **配置不一致** - minChapterChars 与 wordBudget.min 不匹配
4. **缺少验证** - 没有代码检查 wordBudget 是否正确传递

---

## 修复优先级

### 立即修复（P0）

1. **bug-wordbudget-not-passed-to-reviewer.md** - 确保 wordBudget 正确传递给 Reviewer
2. **bug-reviewer-prompt-duplicate-word-check.md** - 删除第 3 节的字数检查，只保留第 7 节
3. **bug-min-chapter-chars-mismatch.md** - 统一配置，确保 minChapterChars 与 wordBudget.min 一致
4. **bug-reviewer-prompt-word-limit.md** - 修改 Reviewer prompt，添加上限检查

### 后续修复（P1）

5. **bug-phase1-state-transition.md** - 修复 Phase 1 状态转换逻辑
6. **bug-word-count-exceeded.md** - 强化 Writer prompt 字数约束（P0 修复后应该自动解决）
7. **bug-reviewer-word-count.md** - Reviewer 应该检查字数并反馈（P0 修复后应该自动解决）

### 最后修复（P2）

8. **bug-chapter-count-mismatch.md** - 修复组装逻辑
9. **bug-phase1-requirements-json.md** - 确认是否是 #5 的连锁反应
5. **bug-phase1-requirements-json.md** - 确认是否是 #2 的连锁反应

---

## 下次测试建议

1. **配置并发数** - 在 confwrite.config.json 中设置 maxConcurrency=2
2. **使用 Word 文件** - 测试完整的格式转换流程
3. **验证字数控制** - 修复 P1 问题后重新测试
4. **检查图表质量** - 修复 GROUP_GAP_RATIO warnings

---

## 结论

**流程可跑通**：从 init 到 done 的完整流程可以正常执行  
**质量不达标**：字数控制完全失效，最终文档超标 3.5 倍  
**需要修复**：至少修复 3 个 P1 问题后才能认为质量达标
