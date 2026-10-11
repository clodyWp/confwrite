# E2E 测试报告：LMERP2V2-v7

**测试日期**: 2026-01-10  
**测试环境**: water-ali (远程机器)  
**ConfWrite 版本**: 0.21.1（含 DIAG 诊断日志）  
**测试目标**: 验证 wordBudget 传递问题，定位字数控制失效根因

---

## 测试配置

| 配置项 | 预期值 | 实际值 | 状态 |
|--------|--------|--------|------|
| 项目名称 | LMERP2V2-v7 | LMERP2V2-v7 | ✅ |
| 目标字数 | 50,000 | 50,000 | ✅ |
| 并发数 | 2 | 2 | ✅ |
| 模板 | technical-proposal | technical-proposal | ✅ |
| 素材类型 | Markdown | Markdown | ⚠️ 降级测试 |

---

## 执行进度

| 阶段 | 状态 | 耗时 | 备注 |
|------|------|------|------|
| Phase 0a (初始化) | ✅ 完成 | < 1s | - |
| Phase 0b (素材整理) | ✅ 完成 | ~30s | 167 文件，21 分类 |
| Phase 1 (需求分析) | ✅ 完成 | - | requirements.json 已生成 |
| Phase 2 (大纲规划) | ⚠️ 异常 | - | outline.md 未自动生成（见 Bug 10） |
| Phase 3 (素材准备) | ⏳ 待执行 | - | - |
| Phase 4a (写作) | ⏳ 待执行 | - | **核心测试** |
| Phase 4b (审阅) | ⏳ 待执行 | - | - |
| Phase 5+ | ⏳ 待执行 | - | - |

---

## 发现的问题

### Bug 10: Phase 2 waitPoint timing='entry' 导致大纲生成被跳过

**状态**: 🔴 新发现  
**严重程度**: P1 - 严重  
**发现时间**: 2026-01-10 22:05

#### 问题描述

Phase 2 的 waitPoint timing 设置为 'entry'（进入即暂停），导致：
1. 状态机进入 Phase 2 后立即暂停
2. Phase 2 的 `execute()` 从未被调用
3. outline.md 不会自动生成
4. 用户被要求"编辑 outline.md"，但文件不存在

#### 症状

```
Phase: 2, Status: outlining
用户提示: "请编辑 outline.md，用 ch001/ch002 等标记需要独立写作的章节"
实际: outline.md 文件不存在
```

#### 影响

- 必须手动执行 `/confwrite:outline` 命令才能继续
- 用户体验差，流程不连贯
- 与 Phase 1 的状态机绕过问题类似

#### 根因分析

**代码位置**: `src/orchestrator/phases.ts` Phase 2 定义

```typescript
export const phase2: PhaseDefinition = {
  id: '2',
  name: '大纲规划',
  waitPoint: {
    timing: 'entry',  // ❌ 问题所在
    message: '请确认大纲内容...',
  },
  execute: async (ctx) => {
    // 这部分从未执行
    const outlineGenerator = new OutlineGenerator(ctx.projectDir);
    // ...
  },
};
```

**预期行为**:
- waitPoint timing 应该是 'after-execute'
- 先执行大纲生成，再暂停等待用户确认

**实际行为**:
- waitPoint timing 是 'entry'
- 进入 Phase 2 立即暂停，大纲生成被跳过

#### 修复方案

**方案 1: 修改 waitPoint timing**（推荐）

```typescript
export const phase2: PhaseDefinition = {
  id: '2',
  name: '大纲规划',
  waitPoint: {
    timing: 'after-execute',  // ✅ 修复
    message: '请确认大纲内容...',
  },
  execute: async (ctx) => {
    // 大纲生成逻辑
  },
};
```

**方案 2: 在 Phase 1 完成时自动生成大纲**

```typescript
// Phase 1 execute() 末尾
if (requirementsGenerated) {
  // 自动生成大纲
  const outlineGenerator = new OutlineGenerator(ctx.projectDir);
  const outline = await outlineGenerator.generate(template, requirements, targetWords);
  // 保存 outline.md
}
```

#### 验证方法

修复后执行 E2E 测试：
1. 执行 `/confwrite:write`
2. 检查 outline.md 是否自动生成
3. 检查状态是否暂停在 Phase 2 waitPoint
4. 再次执行 `/confwrite:write` 继续流程

---

## 当前测试状态

**Phase**: 2 (outlining)  
**状态**: 等待手动执行 outline 命令  
**下一步**: 
1. 手动执行 `/confwrite:outline LMERP2V2-v7 technical-proposal 50000`
2. 再次执行 `/confwrite:write LMERP2V2-v7`
3. 监控 Phase 4a 写作过程
4. 检查 DIAG 诊断日志
5. 验证字数控制效果

---

## 诊断日志收集计划

### 目标

验证 wordBudget 是否正确传递到 Writer prompt。

### 检查点

1. **State 中的 wordBudget**
   ```bash
   ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/LMERP2V2-v7/project-state.json | jq ".chapters.ch001.wordBudget"'
   ```
   预期: `{"min": 5000, "max": 8000}`

2. **DIAG 诊断文件**
   ```bash
   ssh water@8.160.160.85 'cat /home/water/proj/c4/projects/LMERP2V2-v7/logs/diag-wordbudget.json'
   ```
   预期: 包含 wordBudget 信息

3. **Task 文件中的字数预算部分**
   ```bash
   ssh water@8.160.160.85 'grep -c "字数预算（硬性要求" /home/water/proj/c4/projects/LMERP2V2-v7/.confwrite-tasks/write-ch001-r1.md'
   ```
   预期: > 0（如果 wordBudget 正确传递）

4. **章节字数统计**
   ```bash
   ssh water@8.160.160.85 'for f in /home/water/proj/c4/projects/LMERP2V2-v7/drafts/chapters/*.md; do echo "$(basename $f): $(wc -m < $f) chars"; done'
   ```
   预期: 5000-8000 字/章

---

## 测试记录

### 2026-01-10 22:00 - 测试开始

- 清理 v7 项目
- 拷贝素材（requirements.md + reference_material）
- 配置并发数 = 2

### 2026-01-10 22:01 - Phase 0a 完成

- 执行 `/confwrite:init LMERP2V2-v7`
- 状态: Phase 0a, Status: init

### 2026-01-10 22:02 - Phase 0b 完成

- 执行 `/confwrite:organize LMERP2V2-v7`
- 结果: 167 文件，21 分类
- 状态: Phase 0b, Status: organizing

### 2026-01-10 22:04 - Phase 1 完成

- 执行 `/confwrite:write LMERP2V2-v7`
- 自动触发 Phase 1（需求分析）
- requirements.json 已生成（3.2K）
- 状态: Phase 2, Status: outlining

### 2026-01-10 22:05 - Phase 2 异常

- **发现 Bug 10**: outline.md 未自动生成
- 原因: Phase 2 waitPoint timing='entry'
- 处理: 手动执行 `/confwrite:outline` 命令

### 2026-01-10 22:06 - OutlineGenerator 报错

**截图**: `d:\2026-10.png`

**错误信息**:
```
[OutlineGenerator] No Word documents found in /home/water/proj/c4/projects/LMERP2V2-v7/inputs
[OutlineGenerator] requirementsContent: null
```

**根因**: 
- `OutlineGenerator.readRequirementsContent()` 期望从 `inputs/requirements.md` 读取
- 但测试数据准备时将文件放在了 `assets/requirements.md`
- `inputs/` 目录为空，导致 requirementsContent 为 null

**修复**: 
```bash
mkdir -p /home/water/proj/c4/projects/LMERP2V2-v7/inputs
cp /home/water/proj/c4/projects/LMERP2V2-v7/assets/requirements.md /home/water/proj/c4/projects/LMERP2V2-v7/inputs/requirements.md
```

**影响**: 
- 大纲生成使用了模板方式（最终回退），而非 LLM 或 AdaptiveOutlinePlanner
- 只生成了 7 个章节（非预期的 10 个）
- wordBudget 使用模板默认值，而非基于需求计算

### 2026-01-10 22:07 - Outline 完成，进入 Phase 3

- 重新执行 `/confwrite:outline LMERP2V2-v7 technical-proposal 50000`
- 生成 7 个章节（模板默认）
- **wordBudget 已正确设置**:
  - ch001: {min: 5000, max: 8000}
  - ch002: {min: 8000, max: 12000}
  - ch003: {min: 10000, max: 15000}
- 状态: Phase 3, Status: outlining

### 2026-01-10 22:07 - Outline 完成，进入 Phase 3

- 执行 `/confwrite:outline LMERP2V2-v7 technical-proposal 50000`
- 生成 7 个章节（非预期的 10 个）
- **wordBudget 已正确设置**:
  - ch001: {min: 5000, max: 8000}
  - ch002: {min: 8000, max: 12000}
  - ch003: {min: 10000, max: 15000}
- 状态: Phase 3, Status: outlining

### 2026-01-10 22:08 - 开始写作阶段

- 执行 `/confwrite:write LMERP2V2-v7`
- 进入 Phase 4a 写作阶段
- **待验证**: wordBudget 是否正确传递到 Writer prompt

### 2026-01-10 22:15 - 字数控制仍然失效

**字数统计**:
| 章节 | 实际字数 | 预算 | 超标倍数 |
|------|---------|------|----------|
| ch001 | 12,791 | 5000-8000 | 1.6x |
| ch002 | 14,892 | 8000-12000 | 1.2x |
| ch003 | 21,880 | 10000-15000 | 1.5x |
| ch004 | 23,381 | 10000-15000 | 1.6x |
| ch006 | 15,781 | 10000-15000 | 1.1x |

**DIAG 诊断日志**: 未生成

**Task 文件检查**:
- `write-ch001-r1.md` 中"字数预算（硬性要求）"出现次数：0
- `write-ch001-r1.md` 中"硬性上限"出现次数：0

**State 中的 wordBudget**: ✅ 存在
```json
{
  "ch001": { "wordBudget": { "min": 5000, "max": 8000 } },
  "ch002": { "wordBudget": { "min": 8000, "max": 12000 } },
  "ch003": { "wordBudget": { "min": 10000, "max": 15000 } }
}
```

**结论**: wordBudget 在 state 中存在，但没有被传递到 Writer prompt。

---

## 根因分析

### 问题链

```
1. OutlineGenerator 期望从 inputs/requirements.md 读取需求
   ↓
2. 测试数据准备时将文件放在了 assets/requirements.md
   ↓
3. inputs/ 目录为空，requirementsContent = null
   ↓
4. OutlineGenerator 回退到模板方式，生成 7 个章节（非 10 个）
   ↓
5. wordBudget 使用模板默认值，而非基于需求计算
   ↓
6. dispatcher.dispatchWriters() 读取 state 中的 wordBudget
   ↓
7. 但 task 文件中没有"字数预算（硬性要求）"部分
   ↓
8. Writer 没有收到字数约束，写了超长内容
```

### 核心问题

**wordBudget 传递失败**:
- state 中有 wordBudget ✅
- dispatcher 代码正确 ✅
- 但 task 文件中没有字数预算硬性要求 ❌
- DIAG 诊断日志未生成 ❌

**可能原因**:
1. dispatcher.dispatchWriters() 没有被调用
2. 调用时出错了，但错误被吞掉了
3. store.load() 返回的 state 中 chapters 没有 wordBudget（但直接检查 state 文件是有的）

### 需要进一步调查

1. 检查 dispatcher.dispatchWriters() 是否被调用
2. 检查 store.load() 返回的实际值
3. 添加更直接的诊断日志（在 task-executor 中检查 wordBudget 参数）

### 2026-01-10 22:25 - 诊断日志未生成

**问题**: dispatcher 和 task-executor 中的 DIAG 诊断日志都没有生成

**可能原因**:
1. dispatcher.dispatchWriters() 没有被调用
2. 调用时出错了，但错误被 try-catch 吞掉了
3. process.cwd() 不是项目目录，导致写入失败

**下一步**:
- 修改诊断日志路径，使用项目目录的绝对路径
- 或者在 dispatcher 中直接打印 wordBudget 的值到 console

### 2026-01-11 08:30 - 重新测试

**修复内容**:
1. 修改 DIAG 日志路径，使用项目目录绝对路径
2. 在写入日志前先创建 logs 目录
3. 添加 OutlineGenerator 的 DIAG 日志

**测试结果**:
- OutlineGenerator 成功读取 requirements.md（103,263 字符）
- AdaptiveOutlinePlanner 生成 10 个章节
- 但 DIAG 日志仍然没有生成

**问题**:
- 项目目录路径不一致：pi 的 cwd 是 `/home/water/proj/c4`，但项目创建在 `/home/water/proj/c4/projects/projects/LMERP2V2-v7/`
- organize 命令没有执行，assets 目录中没有 requirements.json

### 2026-01-11 08:45 - 路径问题确认

**根因**: 
- herdr workspace 的 cwd 是 `/home/water/proj/c4/projects`
- init 命令使用 `resolve(workspaceDir, 'projects', slug)` 计算项目路径
- 结果：`/home/water/proj/c4/projects/projects/LMERP2V2-v7/`

**影响**:
- 项目路径嵌套了两层 `projects/`
- organize 和 write 命令使用相同的路径计算逻辑，所以能找到项目
- 但手动检查时需要使用正确的路径

**下一步**:
1. 使用正确的项目路径继续测试
2. 手动执行 organize 命令
3. 验证 DIAG 日志是否生成

---

## 下一步行动

1. **立即**: 在 task-executor.ts 中添加诊断日志，检查 wordBudget 参数
2. **重新构建并部署**: 强制更新远程机器上的代码
3. **重新测试**: 清理 v7 项目，重新执行 E2E 测试
4. **验证**: 检查 task 文件中是否有字数预算硬性要求部分

---

## 下一步行动

1. **立即**: 手动执行 outline 命令，继续测试
2. **监控**: Phase 4a 写作过程，收集 DIAG 日志
3. **验证**: 检查 wordBudget 传递和字数控制效果
4. **报告**: 完成测试后更新本报告

---

## 关联问题

- `bug-wordbudget-not-passed-to-reviewer.md` - wordBudget 未传递（待验证）
- `FIX-PLAN.md` - 修复计划
- `REVIEW-SUMMARY.md` - 审查汇总
- `e2e-test-report-v6.md` - v6 测试报告（字数超标 3.5x）
