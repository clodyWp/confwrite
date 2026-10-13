## 变更内容

Closes #70

### 问题
之前的实现关注"验证哪些 PR"，但 E2E 本身就是全量回归，自然会覆盖所有 PR。

### 改进
E2E 报告应该关注：
1. **待验证的 PR**：自上次 E2E 以来合并了哪些 PR（确认都被覆盖）
2. **已知问题回归**：上次发现的问题是否复现

### 具体改动

**追踪文件** `last-e2e-state.json`：
```json
{
  "version": "v0.24.0",
  "commit": "962f09c",
  "timestamp": "2026-10-13T05:00:00Z",
  "projectDir": "/home/water/proj/c4/projects/e2e-v24",
  "issuesFound": [
    {
      "id": "WORD-COUNT-001",
      "category": "validation",
      "description": "所有章节超出字数上限 39%-84%",
      "severity": "high",
      "status": "fixed",
      "fixPR": "#68"
    }
  ]
}
```

**报告模板**：
- 待验证的 PR 列表（自上次 E2E 以来）
- 已知问题回归检查表
- 回归总结：检查了多少问题，多少复现，多少未复现

**update-e2e-state.sh**：
- 改为接受 `issues-json` 参数（记录发现的问题）
- 不再记录 `verifiedPRs`

### 测试
- 全部 1380 测试通过
