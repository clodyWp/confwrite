# 烟雾测试数据集 (Smoke Test Dataset)

轻量级测试数据集，用于快速验证 ConfWrite 基本工作流。

## 数据集概览

| 属性 | 值 |
|------|-----|
| **名称** | smoke-test |
| **章节数** | 3 |
| **素材文件** | 3 个 Markdown + 1 个 Word |
| **预计字数** | 15,000 字 |
| **预计耗时** | 20-25 分钟 |
| **复杂度** | 低 |

## 文件结构

```
smoke-test/
├── config.json                          # 数据集配置
├── README.md                            # 本文件
├── generate-docx.js                     # Word 文档生成脚本
├── inputs/
│   └── requirements.docx                # Word 格式需求文档（测试 docx 转换）
└── reference_material/
    ├── 01_系统概述.md                    # 概述章素材
    ├── 02_功能需求详细说明.md            # 功能章素材
    └── 03_技术架构设计.md                # 技术章素材
```

## 测试覆盖

### 功能测试
- ✅ DOCX 转换（inputs/requirements.docx → markdown）
- ✅ Markdown 素材整理（3 个文件）
- ✅ 大纲生成（3 章）
- ✅ 写作流程（3 章）
- ✅ 审阅/修复循环
- ✅ 图表生成
- ✅ 组装导出

### 章节类型
- **概述章** (overview)：系统概述、目标、范围
- **功能章** (functional)：详细功能需求
- **技术章** (technical)：技术架构设计

## 使用方法

### 1. 上传数据集到远程机器

```bash
# 本地执行：上传整个数据集
scp -r e2e-regression/datasets/smoke-test water@8.160.160.85:/home/water/proj/c4/projects/
```

### 2. 初始化项目

```bash
# 远程执行：通过 herdr 发送命令
herdr pane run <remote-pane-id> "cd /home/water/proj/c4/projects/smoke-test"
herdr pane run <remote-pane-id> "/confwrite:init smoke-test"
```

### 3. 整理素材

```bash
# 远程执行
herdr pane run <remote-pane-id> "/confwrite:organize smoke-test"
```

**预期结果**：
- 扫描：4 个文件（3 个 MD + 1 个 DOCX）
- 转换：1/1 成功（DOCX → MD）
- 索引：4 个文件，3 个分类

### 4. 生成大纲

```bash
# 远程执行
herdr pane run <remote-pane-id> "/confwrite:outline smoke-test technical-proposal 15000"
```

**预期结果**：
- 生成 3 章大纲
- 总字数预算：15,000 字
- 每章 3,000-5,000 字

### 5. 开始写作

```bash
# 远程执行
herdr pane run <remote-pane-id> "/confwrite:write smoke-test"
```

**预期结果**：
- Phase 4a：3 章全部写完
- Phase 4b/4c/4d：审阅/修复循环
- Phase 5：图表生成
- Phase 6：组装
- Phase 7：定稿
- Phase 8：导出 DOCX

## 验证检查点

### Phase 0b（素材整理）
- [ ] DOCX 文件成功转换为 Markdown
- [ ] 4 个文件全部索引
- [ ] 生成 `assets/indexes/index.json`

### Phase 2（大纲生成）
- [ ] 生成 3 章大纲
- [ ] 章节类型正确（overview/functional/technical）
- [ ] 字数预算合理（每章 3,000-5,000 字）

### Phase 4a（写作）
- [ ] 3 章全部完成
- [ ] 字数在预算范围内
- [ ] 无严重超标（< 20%）

### Phase 8（导出）
- [ ] 生成 `output/final.docx`
- [ ] 文件大小合理（> 50KB）
- [ ] State 达到 `done`

## 数据集特点

### 优点
1. **轻量级**：只有 3 章，测试快速
2. **覆盖全面**：包含 docx 转换、多种章节类型
3. **独立数据**：不依赖 LMERP2V2，可重复测试
4. **真实场景**：基于智能仓储管理系统需求

### 局限
1. **规模较小**：不适合测试大规模并发
2. **章节类型有限**：只有 3 种类型（overview/functional/technical）
3. **无图表**：素材中不包含图表描述

## 扩展建议

如需更全面的测试，可以使用：
- **standard 数据集**：7 章，覆盖 6 种章节类型
- **full 数据集**：167 个文件，真实生产数据

## 故障排查

### DOCX 转换失败
- 检查 `inputs/requirements.docx` 是否存在
- 检查远程机器是否安装了 docx 转换依赖
- 查看 `logs/confwrite-log.jsonl` 中的错误信息

### 素材扫描为 0
- 检查 `reference_material/` 目录下是否有文件
- 检查文件权限是否正确
- 确认项目目录结构正确

### 大纲生成失败
- 检查是否已完成 Phase 1（需求分析）
- 检查 `inputs/requirements.docx` 是否成功转换
- 查看 `assets/requirements.json` 是否存在

## 相关文档

- [E2E Testing Skill](../../../.agents/skills/e2e-testing/SKILL.md)
- [E2E Regression README](../../README.md)
- [Bug Patterns](../../bug-patterns.json)
