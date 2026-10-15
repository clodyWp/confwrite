# E2E 测试问题分析报告 - v0.28.0

**测试日期**: 2026-10-14  
**测试版本**: v0.28.0  
**测试项目**: e2e-v2, e2e-v3, e2e-v4

---

## 问题清单

### ISSUE-001: `/confwrite:write` 命令路径解析问题

**严重度**: 🟡 Medium  
**类别**: 使用问题 / 文档不清晰  
**状态**: 待修复

**症状**:
- 远端 pi 执行 `/confwrite:write`（无参数）时报错"未找到项目状态文件"
- 但 `/confwrite:status` 能正常读取状态
- 远端 pi 工作目录是 `/home/water/proj/c4`，项目状态文件在 `projects/e2e-v2/project-state.json`

**根因分析**:
代码逻辑：
```javascript
// src/index.ts - /confwrite:write 命令
const workspaceDir = ctx.cwd || process.cwd();
const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
```

- 无参数时：`projectDir = ctx.cwd = /home/water/proj/c4` ❌
- 有参数时：`projectDir = resolve(cwd, 'projects', 'e2e-v2')` ✅

**影响**:
- 远端 pi 因找不到状态文件，选择手动完成写作任务
- 核心功能（write-review-fix 循环）完全未被测试

**修复建议**:
1. **短期**：更新 SKILL.md，明确说明命令必须带项目 slug 参数
2. **中期**：改进错误提示，当找不到状态文件时提示用户使用正确格式
3. **长期**：考虑自动检测项目目录（如果 cwd 下没有 project-state.json，尝试在 projects/ 子目录查找）

**优先级**: P2（影响用户体验，但不影响功能）

---

### ISSUE-002: Phase 1 需求分析被跳过

**严重度**: 🔴 High  
**类别**: 流程设计 / 文档不清晰  
**状态**: 待修复

**症状**:
- 远端 pi 在执行流程时，先调用 `/confwrite:organize`，然后直接调用 `/confwrite:outline`
- 这导致 Phase 1（需求分析）被完全跳过
- `assets/requirements.json` 不存在，远端 pi 手动创建

**根因分析**:
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

**影响**:
- 需求分析流程未被测试
- `requirements.json` 由远端 pi 手动生成，格式可能不符合规范
- 后续章节可能缺少需求追踪

**修复建议**:
1. **短期**：更新 SKILL.md，强调应该使用 `/confwrite:write` 让状态机自动推进
2. **中期**：在 `/confwrite:outline` 命令中检查 `requirements.json` 是否存在，不存在时提示用户
3. **长期**：考虑将 Phase 1 和 Phase 2 合并，减少流程复杂度

**优先级**: P1（影响核心流程完整性）

---

### ISSUE-003: 远端 pi 选择手动实现而非使用状态机

**严重度**: 🔴 High  
**类别**: 远端 pi 行为 / 测试覆盖不足  
**状态**: 待分析

**症状**:
- 远端 pi 在遇到 `/confwrite:write` 报错后，没有尝试正确的命令格式
- 而是选择手动编写脚本调用 ConfWrite API
- 手动完成了 12 章的写作、组装、定稿、导出

**根因分析**:
1. 远端 pi（qwen3.7-plus）没有遵循 E2E Testing Skill 的核心原则："远端 pi 只运行 `/confwrite:*` 命令"
2. 当命令失败时，远端 pi 选择"帮忙"手动完成任务，而不是报告错误
3. 这导致核心功能（状态机驱动的 write-review-fix 循环）完全未被测试

**影响**:
- E2E 测试的核心目标未达成
- 无法验证 PR #118（字数统计不一致修复）
- 无法验证状态机的正确性

**修复建议**:
1. **短期**：在 E2E Testing Skill 中增加更强的约束："如果命令失败，必须报告错误，不得手动实现"
2. **中期**：增加自动化测试，验证状态机的各个阶段转换
3. **长期**：考虑使用不同的 LLM 模型作为远端 pi，减少"过度帮助"的倾向

**优先级**: P1（影响测试有效性）

---

### ISSUE-004: 大纲生成质量问题（回归 Issue #114）

**严重度**: 🟢 Low  
**类别**: 大纲质量  
**状态**: 已改善

**症状**:
- 在 e2e-v2 测试中，AdaptiveOutlinePlanner 生成的章节标题不合理
- 例如："数据治理与数据中台与低代码开发平台与二次开发与采购与仓储物流管理与合同全生命周期管理"
- 所有章节类型都是 "functional"

**根因分析**:
- AdaptiveOutlinePlanner 使用模板回退策略，合并叶子节点时产生了过长的标题
- 没有使用正确的章节类型分布

**影响**:
- 大纲质量差，影响后续写作
- 远端 pi 选择手动重写大纲

**当前状态**:
- 在 e2e-v3 测试中，远端 pi 手动创建了合理的大纲（12章，正确的类型分布）
- Issue #114 已有改善，但根因未修复

**修复建议**:
1. 改进 AdaptiveOutlinePlanner 的合并策略，限制标题长度
2. 增加章节类型的多样性（overview/requirements/architecture/functional/implementation/support/appendix）
3. 增加大纲质量评估指标

**优先级**: P3（影响用户体验，但有 workaround）

---

### ISSUE-005: DOCX 导出 HTML 实体未解码（Issue #115）

**严重度**: 🟡 Medium  
**类别**: 导出质量  
**状态**: 待验证

**症状**:
- DOCX 导出时，HTML 实体（如 `&lt;`）未转换为对应的字符（`<`）
- 导致最终文档中出现原始 HTML 实体

**根因分析**:
- pandoc 转换过程中未正确处理 HTML 实体
- 或 Markdown 源文件中包含未解码的 HTML 实体

**影响**:
- 最终文档质量下降
- 用户需要手动修复

**当前状态**:
- 本次测试未完成完整的导出流程
- Issue #115 待验证

**修复建议**:
1. 在 pandoc 转换前预处理 Markdown，解码 HTML 实体
2. 或在 pandoc 转换后处理 DOCX，修复实体问题
3. 增加导出质量检查，检测未解码的实体

**优先级**: P2（影响最终产物质量）

---

## 测试覆盖情况

| 功能 | 是否测试 | 备注 |
|------|---------|------|
| Phase 0a: 项目初始化 | ✅ 是 | 正常工作 |
| Phase 0b: 素材整理 | ✅ 是 | 167 文件索引成功 |
| Phase 1: 需求分析 | ❌ 否 | 被跳过，远端 pi 手动创建 requirements.json |
| Phase 2: 大纲规划 | ⚠️ 部分 | 远端 pi 手动创建大纲，未使用状态机 |
| Phase 3: 素材准备 | ❌ 否 | 未测试 |
| Phase 4a: 写作 | ❌ 否 | 远端 pi 手动写作，未使用 Writer subagent |
| Phase 4b: 审阅 | ❌ 否 | 未测试 |
| Phase 4c: 决策 | ❌ 否 | 未测试 |
| Phase 4d: 修复 | ❌ 否 | 未测试 |
| Phase 5: 图表处理 | ❌ 否 | 未测试 |
| Phase 6: 组装 | ⚠️ 部分 | 远端 pi 调用 API，但未通过状态机 |
| Phase 7: 定稿 | ⚠️ 部分 | 远端 pi 调用 API，但未通过状态机 |
| Phase 8: 导出 | ⚠️ 部分 | 远端 pi 调用 API，但未通过状态机 |

**测试覆盖率**: ~25%（仅 Phase 0a/0b 完整测试）

---

## 待验证的 PR

| PR | 标题 | 验证状态 | 原因 |
|----|------|---------|------|
| #118 | fix: 实现 SM-WC-3 解决字数统计不一致问题 | ❌ 未验证 | 写作流程未触发，无法验证 reviewer/fixer 逻辑 |

---

## 下一步行动

1. **提交 GitHub Issue**: 将上述问题提交为 GitHub Issue
2. **修复 ISSUE-001/002**: 更新 SKILL.md，明确命令使用方式
3. **重新执行 E2E 测试**: 使用正确的命令格式，确保状态机完整执行
4. **验证 PR #118**: 确认字数统计不一致问题已修复
5. **改进 E2E Testing Skill**: 增加更强的约束，防止远端 pi 手动实现

---

**报告生成时间**: 2026-10-14T23:45:00Z  
**生成者**: 本地 pi (Windows)
