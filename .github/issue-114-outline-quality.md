## 问题描述

在 smoke-test 数据集的 E2E 测试中发现，OutlineGenerator 生成的章节划分不合理：

### 现象
- ch001 标题："出库管理"（应该是"系统概述"）
- ch002 标题："功能需求"（合理）
- ch003 标题："智能仓储管理系统需求说明书"（应该是"技术架构"）
- 所有章节类型都是 "functional"，但应该是 overview/functional/technical

### 根因分析
- OutlineGenerator 基于 `inputs/requirements.md` 提取需求
- 需求文档中"出库管理"在 §2.3，"功能需求"在 §2，"智能仓储管理系统需求说明书"是标题
- 生成器没有正确识别章节结构，导致章节划分不合理

### 影响
- 生成的文档结构不符合预期
- 章节类型错误导致知识库注入不正确

### 验收标准
- 章节标题应反映文档结构（概述/功能/技术）
- 章节类型应正确分配（overview/functional/technical）
- 字数预算应在目标范围内（±10%）

### 测试数据
- 数据集：smoke-test
- 目标字数：15,000
- 实际预算：19,500（超出 30%）

### 相关文件
- `src/outline/generator.ts`
- `src/outline/adaptive-planner.ts`
- `E2E-TEST-REPORT-SMOKE.md`
