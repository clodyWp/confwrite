## 问题描述

当前 E2E skill 缺少"验证目标"的定义：
1. 不知道"为什么测试"：E2E 跑完只说"测试通过"，但没说验证了什么
2. 无法追踪 PR 验证状态：PR 合并了，但不知道是否被 E2E 验证过
3. 重复测试浪费：每次都全量测试，没有针对性

## 解决方案

### 核心概念：验证范围（Verification Scope）

```
上次 E2E (v0.24.0) ──────→ 本次 E2E (v0.25.0)
     │                           │
     └── PR #63, #65, #66 ───────┘
              ↓
         验证目标
```

### 实现方案

**追踪文件**：`e2e-regression/last-e2e-state.json`

```json
{
  "version": "v0.24.0",
  "commit": "962f09c",
  "timestamp": "2026-10-13T05:00:00Z",
  "verifiedPRs": ["#63", "#65", "#66"],
  "projectDir": "/home/water/proj/c4/projects/e2e-v24"
}
```

**工作流改进**：

```
Phase 0: 准备
  ├─ 读取 last-e2e-state.json
  ├─ 获取自上次以来的 PR 列表
  └─ 输出"本次验证目标: PR #68, #69"

Phase 1-5: 执行测试（不变）

Phase 6: 生成报告
  ├─ 对比验证目标与实际结果
  ├─ 标注每个 PR 的验证状态
  └─ 更新 last-e2e-state.json
```

### 需要更新的文件

1. `.agents/skills/e2e-testing/SKILL.md` - 增加验证范围概念
2. `e2e-regression/last-e2e-state.json` - 创建追踪文件模板
3. 可能需要创建辅助脚本获取 PR 列表

## 验收标准

- [ ] E2E skill 文档增加"验证范围"章节
- [ ] 创建 `last-e2e-state.json` 模板
- [ ] Phase 0 能自动获取待验证 PR 列表
- [ ] Phase 6 能生成包含验证状态的报告
- [ ] 测试通过

## 优先级

Medium - 提升 E2E 测试的针对性和可追溯性