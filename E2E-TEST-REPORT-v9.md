# E2E 测试报告 v9 - LMERP2V2

**测试时间**: 2026-10-13 00:20 - 02:13 (约 2 小时)  
**测试项目**: LMERP2V2-v9 (10 章)  
**测试状态**: Phase 6 等待用户确认

## 测试流程

```
Phase 0a (初始化) → 0b (素材整理) → 1 (需求分析) → 2 (大纲规划)
  → 3 (素材准备) → 4a (写作) → 4b (审阅) → 4c (决策) → 4d (修复)
  → 4b → 4c → 4d (第二轮) → 4b → 4c → 5 (图表) → 6 (组装)
```

## 发现的问题

### Bug 1: Phase 4a 出现 reviewed 状态
**文件**: `BUGS/bug-phase4a-reviewed-state.md`  
**严重程度**: 高  
**描述**: Writer 任务因字数超标失败时，章节状态被错误设置为 `reviewed`，导致审阅阶段被跳过。

**根因**:
- `src/writing/orchestrator.ts` 第 164 行和 190 行：validation_failed 时设置 `status = 'reviewed'`
- Phase 4a 出口条件允许 `reviewed` 状态通过
- Phase 4b validate 失败但出口条件满足，导致审阅被跳过

**影响**:
- review 目录为空，没有审阅报告
- Fixer 收到 "[审阅报告缺失]" 的提示
- 修复质量无法保证

### Bug 2: Phase 4d 只启动了部分 fixer 任务
**文件**: `BUGS/bug-phase4d-partial-fixer.md`  
**严重程度**: 高  
**描述**: Phase 4d 只启动了 ch001-ch005 的 fixer 任务，没有启动 ch006-ch010 的 fixer 任务。

**根因**:
- 可能是 maxConcurrency 限制导致任务调度问题
- 或者 Phase 4d execute 逻辑只选择了部分章节

**影响**:
- 修复流程不完整
- 可能导致死锁

### Bug 3: DIAG 日志 flooding TUI
**文件**: `BUGS/bug-diag-log-tui-flood.md`  
**严重程度**: 中  
**描述**: DIAG 日志（DIAG-PROMPT, DIAG-REVIEW）输出到 TUI，淹没了 subagent 状态信息。

**根因**:
- `LoggingSystem.handleEvent()` 将所有事件输出到 TUI
- 包括 `diag.*` 事件

**影响**:
- 无法看到 subagent 状态
- 用户体验差

### Bug 4: 字数验证失败率高
**描述**: 所有章节都因字数超标验证失败（8000-11000 字 > 7800 字上限）。

**根因**:
- Writer prompt 中字数限制不够严格
- LLM 对字数控制不精确

**影响**:
- 所有 writer 任务都失败
- 进入修复循环
- 修复质量无法保证（没有审阅报告）

## 测试结果

### 成功的部分
- ✅ Phase 0-3 正常完成
- ✅ Phase 4a 写作完成（虽然字数超标）
- ✅ Phase 4b 审阅完成（第二轮）
- ✅ Phase 4c 决策完成
- ✅ Phase 4d 修复完成（第二轮）
- ✅ Phase 5 图表生成完成
- ✅ Phase 6 组装完成（生成 merged-v1.md）

### 失败的部分
- ❌ 第一轮审阅被跳过（Bug 1）
- ❌ 第一轮修复只启动了部分任务（Bug 2）
- ❌ 所有章节字数超标
- ❌ DIAG 日志 flooding TUI（Bug 3）

## 产物

| 文件 | 大小 | 说明 |
|------|------|------|
| `assembly/merged-v1.md` | 229K | 组装后的初稿 |
| `drafts/chapters/ch*-v*.md` | - | 各章节草稿（多版本） |
| `review/ch*-r*.json` | - | 审阅报告（第二轮） |
| `logs/confwrite-log.jsonl` | - | 事件日志 |
| `logs/subagent-*.log` | - | Subagent 日志 |

## 建议

1. **修复 Bug 1**: 修改 `updateChapterStatus()` 中 validation_failed 的处理逻辑，不要设置 `reviewed` 状态
2. **修复 Bug 2**: 检查 Phase 4d 的任务调度逻辑，确保所有章节都被修复
3. **修复 Bug 3**: 过滤 `diag.*` 事件，不输出到 TUI
4. **改进字数控制**: 在 Writer prompt 中更严格地限制字数，或者在验证失败时让 writer 重试而不是进入修复循环

## 下一步

等待用户确认 `assembly/merged-v1.md` 后，继续执行 Phase 7（定稿）和 Phase 8（导出）。
