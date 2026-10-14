# E2E 测试报告 - Smoke Test Dataset

**测试日期**: 2026-10-14  
**测试版本**: v0.28.0  
**数据集**: smoke-test（轻量级烟雾测试）  
**测试状态**: ⚠️ 部分完成（已停止）

---

## 测试目标

验证新创建的 smoke-test 数据集是否可以正常运行 ConfWrite 完整流程，特别是：
1. DOCX 转换功能（inputs/requirements.docx）
2. Markdown 素材整理（3 个文件）
3. 大纲生成质量
4. 写作流程

---

## 测试结果

### ✅ 成功的部分

1. **DOCX 转换**
   - `inputs/requirements.docx` 成功转换为 `inputs/requirements.md`
   - 转换内容完整（1727 字节）
   - 包含所有需求条目（FR-001~009, NFR-001~004, TC-001~004, AC-001~004）

2. **素材整理**
   - 3 个 Markdown 文件成功扫描和索引
   - 生成 `assets/indexes/index.json`
   - 生成 `assets/data-baseline.json`（15 个指标）

3. **Phase 流转**
   - Phase 0b → 1 → 2 → 3 → 4a 正常流转
   - 状态机运行正常

---

### ❌ 发现的问题

#### 问题 1: 大纲生成质量差（严重）

**现象**：
- ch001 标题："出库管理"（应该是"系统概述"）
- ch002 标题："功能需求"（合理）
- ch003 标题："智能仓储管理系统需求说明书"（应该是"技术架构"）
- 所有章节类型都是 "functional"，但应该是 overview/functional/technical

**根因分析**：
- 大纲生成器（OutlineGenerator）基于 `inputs/requirements.md` 提取需求
- 需求文档中"出库管理"在 §2.3，"功能需求"在 §2，"智能仓储管理系统需求说明书"是标题
- 生成器没有正确识别章节结构，导致章节划分不合理

**影响**：
- 生成的文档结构不符合预期
- 章节类型错误导致知识库注入不正确

**建议**：
- 改进 OutlineGenerator 的章节识别逻辑
- 增加对文档标题的识别（区分主标题和章节标题）
- 参考 `reference_material/` 中的素材来优化章节划分

---

#### 问题 2: 字数预算超出目标（中等）

**现象**：
- 目标字数：15,000 字
- 实际预算：19,500 字（超出 30%）
- 每章预算：5,200-7,800 字

**根因分析**：
- OutlineGenerator 的字数分配算法过于保守
- 3 章 × 6,500 字（平均值）= 19,500 字

**影响**：
- 可能导致写作时间延长
- 可能导致字数超标问题

**建议**：
- 调整字数分配算法，更严格地遵守目标字数
- 允许用户手动调整章节字数预算

---

#### 问题 3: 素材整理命令使用不当（轻微）

**现象**：
- 第一次运行 `/confwrite:organize` 时扫描到 0 个文件
- 需要指定项目名称 `/confwrite:organize smoke-test` 才能正确工作

**根因分析**：
- 远程 pi 的 cwd 是 `/home/water/proj/c4`，不是项目目录
- 命令需要指定项目名称才能定位到正确的项目目录

**影响**：
- 用户体验不佳，需要记住指定项目名称

**建议**：
- 改进命令提示，当 cwd 不是项目目录时给出明确提示
- 或者自动检测当前目录下是否有 `project-state.json`

---

## 测试数据

### 项目状态

```json
{
  "currentPhase": "4a",
  "status": "writing",
  "chapters": {
    "ch001": {
      "title": "出库管理",
      "type": "functional",
      "status": "pending",
      "wordBudget": { "min": 5200, "max": 7800 }
    },
    "ch002": {
      "title": "功能需求",
      "type": "functional",
      "status": "pending",
      "wordBudget": { "min": 5200, "max": 7800 }
    },
    "ch003": {
      "title": "智能仓储管理系统需求说明书",
      "type": "functional",
      "status": "pending",
      "wordBudget": { "min": 5200, "max": 7800 }
    }
  }
}
```

### 日志摘要

- Phase 转换：0b → 1 → 2 → 3 → 4a（正常）
- Writer 任务：write-ch001-r1 已启动
- 素材读取：读取了 3 个 reference_material 文件
- DOCX 转换：成功（在 outline 阶段触发）

---

## 建议的 Issue

### Issue #114: 大纲生成质量改进

**标题**: 大纲生成器章节识别不准确  
**优先级**: High  
**标签**: bug, outline-generator

**描述**：
OutlineGenerator 基于需求文档生成大纲时，章节划分不合理：
- 章节标题不符合文档结构
- 章节类型识别错误（都识别为 functional）
- 字数预算超出目标 30%

**验收标准**：
- 章节标题应反映文档结构（概述/功能/技术）
- 章节类型应正确分配（overview/functional/technical）
- 字数预算应在目标范围内（±10%）

---

### Issue #115: 字数预算分配算法优化

**标题**: 字数分配算法导致预算超出目标 30%  
**优先级**: Medium  
**标签**: enhancement, outline-generator

**描述**：
当目标字数为 15,000 字时，实际分配的字数预算为 19,500 字（超出 30%）。

**验收标准**：
- 字数预算应在目标范围内（±10%）
- 允许用户手动调整章节字数预算

---

## 下一步

1. **继续写作流程**：虽然大纲质量不佳，但可以继续测试写作流程，验证 Issue #96 的修复效果
2. **创建 Issue**：为上述问题创建 GitHub Issue
3. **改进数据集**：优化 smoke-test 数据集的需求文档，使其更清晰
4. **改进 OutlineGenerator**：根据 Issue #114 改进大纲生成逻辑

---

## 附录

### 测试命令

```bash
# 初始化项目
/confwrite:init smoke-test

# 整理素材
/confwrite:organize smoke-test

# 生成大纲
/confwrite:outline smoke-test technical-proposal 15000

# 开始写作
/confwrite:write smoke-test
```

### 文件结构

```
smoke-test/
├── inputs/
│   ├── requirements.docx    # ✅ 已转换为 MD
│   └── requirements.md      # ✅ 1727 字节
├── reference_material/
│   ├── 01_系统概述.md        # ✅ 2993 字节
│   ├── 02_功能需求详细说明.md # ✅ 7106 字节
│   └── 03_技术架构设计.md     # ✅ 11564 字节
├── assets/
│   ├── indexes/index.json   # ✅ 已生成
│   ├── data-baseline.json   # ✅ 15 个指标
│   └── requirements.json    # ✅ 已生成
├── outline.md               # ✅ 已生成（质量不佳）
└── project-state.json       # ✅ Phase 4a
```
