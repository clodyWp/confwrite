# E2E 测试报告 v7（中期）— wordBudget 传递失败确认

**测试日期**: 2026-01-10  
**测试项目**: LMERP2V2-v7  
**ConfWrite 版本**: 0.21.1（含 DIAG 诊断日志）

---

## 测试目标

验证 PR #30 添加的 `[DIAG]` 诊断日志能否收集到 wordBudget 传递失败的证据。

---

## 核心发现

### 问题确认：wordBudget 未传递到 Writer prompt

**证据链**：

1. **state 中 wordBudget 存在** ✅
   ```json
   "ch001": {
     "status": "written",
     "wordBudget": { "min": 5000, "max": 8000 }
   }
   ```

2. **task 文件中缺少字数预算硬性要求** ❌
   - 搜索 "字数预算（硬性要求" → 0 结果
   - 搜索 "硬性上限" → 0 结果
   - task 文件中只有素材包中的 "字数预算: 5000-8000字"（描述性，非强制）

3. **字数控制完全失效**
   | 章节 | 实际字数 | 预算 | 超标倍数 |
   |------|---------|------|---------|
   | ch001 | 14,522 | 5000-8000 | 1.8x |
   | ch002 | 14,987 | 5000-8000 | 1.9x |
   | ch003 | 15,588 | 5000-8000 | 1.9x |
   | ch004 | 17,257 | 5000-8000 | 2.2x |
   | ch005 | 13,672 | 5000-8000 | 1.7x |
   | ch006 | 19,957 | 5000-8000 | 2.5x |
   | **平均** | **15,997** | **6500** | **2.4x** |

---

## 根因分析

### 代码逻辑检查

**dispatcher/index.ts** (第 76-78 行):
```typescript
const state = this.store.load();  // 从磁盘读取 state
const wordBudget = state?.chapters?.[chapterId]?.wordBudget;
task.prompt = this.taskExecutor.generateWriterPrompt(task, kitContent, round, wordBudget);
```

**task-executor.ts** (第 67-88 行):
```typescript
const wordBudgetSection = wordBudget ? `
## 字数预算（硬性要求，必须严格遵守）
...
` : '';  // 如果 wordBudget 是 undefined，这部分为空
```

### 问题定位

虽然代码逻辑看起来正确，但 task 文件中没有字数预算部分，说明 `wordBudget` 在调用 `generateWriterPrompt` 时是 `undefined`。

**可能的原因**：

1. **时序问题**：dispatcher 读取 state 时，wordBudget 还没有被写入
   - 但 state 文件中确实有 wordBudget
   - 可能是内存缓存问题？

2. **store 实例问题**：dispatcher 使用的 store 和写入 wordBudget 的 store 不是同一个
   - outline command 创建新的 ProjectStore 实例
   - /confwrite:write 创建另一个 ProjectStore 实例
   - 但 dispatcher 调用 `store.load()` 应该从磁盘读取最新数据

3. **state 结构问题**：wordBudget 的路径不对
   - 代码：`state?.chapters?.[chapterId]?.wordBudget`
   - 实际：`state.chapters.ch001.wordBudget` ✅

### DIAG 日志缺失

**问题**：[DIAG] 日志没有出现在任何可观察的地方：
- 远程 pi 的 viewport 中没有
- subagent 日志文件中没有
- confwrite-log.json 中没有

**原因**：`console.log` 的输出被 subagent 执行器吞掉了，没有传递到主进程或日志系统。

---

## 其他发现的问题

### Bug: Phase 2 waitPoint timing='entry' 导致 outline.md 不自动生成

**症状**：
- Phase 2 的 waitPoint timing 是 'entry'（进入即暂停）
- execute() 从未被调用
- outline.md 不会自动生成
- 用户被要求"编辑 outline.md"，但文件不存在

**影响**：必须手动运行 `/confwrite:outline` 命令才能继续

**修复建议**：
- 将 Phase 2 的 waitPoint timing 改为 'after-execute'
- 或者在 Phase 1 完成时自动生成 outline.md

---

## 下一步行动

### 立即修复（P0）

1. **修复 wordBudget 传递问题**
   - 添加更详细的诊断日志（使用 logger 而不是 console.log）
   - 检查 dispatcher 读取 state 时的实际值
   - 可能需要强制从磁盘重新加载 state

2. **修复 Phase 2 waitPoint 问题**
   - 修改 timing 为 'after-execute'
   - 或者在状态机中特殊处理 Phase 2

### 验证修复

1. 重新部署包含修复的版本
2. 清理 v7 项目，重新执行 E2E 测试
3. 验证 task 文件中包含"字数预算（硬性要求）"部分
4. 验证章节字数控制在 5000-8000 范围内

---

## 测试状态

- **当前阶段**: Phase 4a (写作)
- **进度**: 6/10 章节完成
- **字数控制**: ❌ 失效（平均超标 2.4x）
- **DIAG 日志**: ❌ 未观察到输出

---

## 结论

**核心问题已确认**：wordBudget 在 state 中存在，但没有被传递到 Writer prompt。这导致字数控制完全失效。

**修复方向明确**：需要确保 dispatcher 正确读取 state 中的 wordBudget 并传递给 generateWriterPrompt。

**DIAG 日志改进**：console.log 不适合在 subagent 环境中使用，需要改用 confwrite 的 logger 系统。
