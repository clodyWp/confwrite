# 并行开发计划

## Track A: 当前会话（验证 + 文档）

| 步骤 | 内容 | 状态 |
|------|------|------|
| A1 | 在 LMERP2V2-v2 上验证 T2/T3 效果 | 待执行 |
| A2 | 更新 TODO.md 记录完成情况 | 待执行 |

## Track B: Subagent（LLM 大纲生成）

### 小步提交计划

| 步骤 | 内容 | 提交点 |
|------|------|--------|
| B1 | 创建 `src/outline/llm-planner.ts` 骨架 + 测试 | commit: feat: add LLMPlanner skeleton |
| B2 | 实现 prompt 构建 + JSON 解析 | commit: feat: implement LLM planner prompt |
| B3 | 集成到 OutlineGenerator | commit: feat: integrate LLMPlanner |
| B4 | 添加 eastE 测试用例 | commit: test: add eastE validation |
| B5 | 构建 + 部署到远程 | commit: chore: release v0.18.0 |
| B6 | 在 eastE-v2 上验证 | 验证完成 |

### 关键约束

1. **每步都要 build + test**
2. **每步都要 git commit**
3. **不回退已有功能**：LLM 规划器失败时回退到 AdaptiveOutlinePlanner
4. **保持接口兼容**：不修改现有 OutlineChapter 类型

### 回退策略

如果 LLM 规划器出问题：
- 修改 `OutlineGenerator.generate()` 中的优先级
- 让 AdaptiveOutlinePlanner 优先，LLM 作为备选
