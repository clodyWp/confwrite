## 问题描述

在 E2E 测试中发现 `/confwrite:write` 命令存在路径解析问题，导致状态机未被正确执行。

## 症状

- 远端 pi 执行 `/confwrite:write`（无参数）时报错"未找到项目状态文件"
- 但 `/confwrite:status` 能正常读取状态
- 远端 pi 工作目录是 `/home/water/proj/c4`，项目状态文件在 `projects/e2e-v2/project-state.json`

## 根因

代码逻辑（src/index.ts）：
```javascript
const workspaceDir = ctx.cwd || process.cwd();
const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
```

- 无参数时：`projectDir = ctx.cwd = /home/water/proj/c4` ❌
- 有参数时：`projectDir = resolve(cwd, 'projects', 'e2e-v2')` ✅

## 影响

- 远端 pi 因找不到状态文件，选择手动完成写作任务
- 核心功能（write-review-fix 循环）完全未被测试
- E2E 测试覆盖率仅约 25%

## 修复建议

1. **短期**：更新 SKILL.md，明确说明命令必须带项目 slug 参数
2. **中期**：改进错误提示，当找不到状态文件时提示用户使用正确格式
3. **长期**：考虑自动检测项目目录（如果 cwd 下没有 project-state.json，尝试在 projects/ 子目录查找）

## 优先级

P2（影响用户体验，但不影响功能）

## 测试环境

- ConfWrite 版本: v0.28.0
- 远端机器: water-ali (8.160.160.85)
- Node.js: v22.22.1
- 模型: qwen3.7-plus
