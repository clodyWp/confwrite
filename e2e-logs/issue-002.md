## 问题描述

在 E2E 测试中发现远端 pi 跳过了 Phase 1（需求分析），直接调用 `/confwrite:outline` 命令。

## 症状

- 远端 pi 在执行流程时，先调用 `/confwrite:organize`，然后直接调用 `/confwrite:outline`
- 这导致 Phase 1（需求分析）被完全跳过
- `assets/requirements.json` 不存在，远端 pi 手动创建

## 根因

1. SKILL.md 中的"完整使用流程"示例不够清晰：
   ```markdown
   3. 整理素材
      /confwrite:organize
   
   4. 提取需求（自动）
      /confwrite:write
   
   5. 生成大纲（自动或手动）
      自动：Phase 2 根据模板自动生成大纲
      手动：/confwrite:outline my-project technical-proposal [50000]
   ```
   
2. 远端 pi 看到"手动"选项，选择了 `/confwrite:outline`，跳过了 Phase 1

## 影响

- 需求分析流程未被测试
- `requirements.json` 由远端 pi 手动生成，格式可能不符合规范
- 后续章节可能缺少需求追踪

## 修复建议

1. **短期**：更新 SKILL.md，强调应该使用 `/confwrite:write` 让状态机自动推进
2. **中期**：在 `/confwrite:outline` 命令中检查 `requirements.json` 是否存在，不存在时提示用户
3. **长期**：考虑将 Phase 1 和 Phase 2 合并，减少流程复杂度

## 优先级

P1（影响核心流程完整性）

## 测试环境

- ConfWrite 版本: v0.28.0
- 远端机器: water-ali (8.160.160.85)
- Node.js: v22.22.1
- 模型: qwen3.7-plus
