# Bug: Phase 1 不生成 requirements.json

**状态**: 🔴 待修复  
**发现时间**: 2026-01-09  
**影响范围**: outline 命令  

## 问题描述

Phase 1 (需求分析) 执行完成后，`assets/requirements.json` 文件不存在，导致后续 `/confwrite:outline` 命令失败。

## 复现步骤

1. 执行 `/confwrite:init test-project`
2. 执行 `/confwrite:organize`
3. 执行 `/confwrite:write` 触发 Phase 1
4. 检查 `assets/requirements.json` → 文件不存在
5. 执行 `/confwrite:outline test-project technical-proposal 50000`
6. 报错: `未找到需求文件，请先运行 Phase 1 提取需求`

## 预期行为

Phase 1 应该生成 `assets/requirements.json`，包含从输入文档中提取的需求列表。

## 实际行为

Phase 1 执行完成（state.currentPhase 推进到 "2"），但 `requirements.json` 文件未生成。

## 根本原因

`src/orchestrator/phase1.ts` 第 51-59 行：

```typescript
const requirementsPath = join(assetsDir, 'requirements.json');
writeFileSync(requirementsPath, JSON.stringify(allRequirements, null, 2), 'utf-8');
```

代码逻辑正确，但实际执行时可能：
1. `allRequirements` 为空数组
2. `writeFileSync` 被跳过（条件判断问题）
3. 路径拼接错误

## 临时解决方案

手动创建 `assets/requirements.json`：

```bash
echo '[]' > assets/requirements.json
```

然后执行 `/confwrite:outline`。

## 验证方法

```bash
# 检查文件是否存在
ls -la assets/requirements.json

# 检查文件内容
cat assets/requirements.json | jq 'length'

# 应该 > 0
```

## 相关文件

- `src/orchestrator/phase1.ts` - Phase 1 实现
- `src/outline/requirement-extractor.ts` - 需求提取器
- `src/commands/outline.ts` - outline 命令（检查 requirements.json）
