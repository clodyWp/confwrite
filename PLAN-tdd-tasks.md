# TDD 修复任务清单 v2

**创建时间**: 2026-10-12  
**最后更新**: 2026-10-12（对抗性审查后重构）  
**方法论**: 每个任务遵循 Red → Green → Refactor 循环

---

## 审查发现的关键问题

### Critical（必须修复）

1. **Phase 2 存在同样的状态机绕过问题**
   - `src/orchestrator/phase2.ts:32` 和 `:57` 直接修改 `currentPhase = '3'`
   - `src/commands/outline.ts:82` 也有同样问题
   - 这是**系统性问题**，不是孤立 bug

2. **#35 根因已明确，无需调查**
   - TOC 的 `## 目录` 被 `finalizer.ts:102` 计为章节
   - 10 个大纲章节 → 11 个 `##` 标题（10 + 1 TOC）

3. **现有测试会因修复而失败**
   - `tests/orchestrator/phase1-requirement-analysis.test.ts` 断言 `currentPhase === '2'`
   - 修复后此断言会失败，CI 不通过

### Major（需要调整）

4. **#34 因果假设未经验证**
   - 代码中文件写入在状态修改之前
   - #34 可能不是 #33 的副作用

5. **缺少 Refactor 步骤**
   - DIAG 诊断日志需要清理

---

## 优化后的任务清单

### 阶段 0: 快速消除独立问题

#### 任务 0.1: 修复 #36 store.ts 路径拼接（15min）

**Red**: 写失败测试
```typescript
// tests/state/store-path.test.ts
it('statePath 不应该包含混合分隔符', () => {
  const store = new ProjectStore('/test/path');
  // 断言：statePath 不包含混合的 / 和 \
});
```

**Green**: 修复代码
```typescript
// src/state/store.ts:16
import { join } from 'node:path';
this.statePath = join(projectDir, 'project-state.json');
```

**Refactor**: 检查是否有其他类似的模板字符串路径拼接

**工时**: 0.25h

---

### 阶段 1: 修复状态机绕过问题（系统性）

#### 任务 1.0: 更新现有测试（前置条件）

**修改**: `tests/orchestrator/phase1-requirement-analysis.test.ts`

```typescript
// ❌ 原测试（第 107-120 行）
it('应该更新项目状态', async () => {
  await phase1.execute();
  expect(updatedState!.currentPhase).toBe('2');  // 修复后会失败
});

// ✅ 新测试
it('execute() 不应该直接修改 currentPhase', async () => {
  const initialState = store.load();
  await phase1.execute();
  const finalState = store.load();
  expect(finalState!.currentPhase).toBe(initialState!.currentPhase);
});
```

**工时**: 0.25h

---

#### 任务 1.1: Phase 1 不直接修改状态（Red）

**测试文件**: `tests/orchestrator/phase1-state-transition.test.ts`

```typescript
describe('Phase1 状态转换', () => {
  it('execute() 不应该直接修改 state.currentPhase', async () => {
    // 1. 设置初始状态：currentPhase = '1'
    // 2. 调用 phase1.execute()
    // 3. 断言：state.currentPhase 仍然是 '1'
  });

  it('execute() 抛异常后状态不变', async () => {
    // 1. Mock RequirementExtractor 抛异常
    // 2. 调用 phase1.execute()
    // 3. 断言：state.currentPhase 未改变
  });
});
```

**预期**: 测试失败

**工时**: 0.5h

---

#### 任务 1.2: 移除 Phase 1 直接状态修改（Green）

**代码变更**: `src/orchestrator/phase1.ts`

删除第 63-69 行的代码块。

**验证**: 任务 1.1 的测试通过

**工时**: 0.25h

---

#### 任务 1.3: 清理 Phase 1 DIAG 日志（Refactor）

**代码变更**: `src/orchestrator/phase1.ts`

删除第 62、66 行的 `console.log` 诊断日志。

**工时**: 0.1h

---

#### 任务 1.4: Phase 2 不直接修改状态（Red）

**测试文件**: `tests/orchestrator/phase2-state-transition.test.ts`

```typescript
describe('Phase2 状态转换', () => {
  it('execute() 不应该直接修改 state.currentPhase（大纲已存在路径）', async () => {
    // 1. 创建 outline.md（已存在）
    // 2. 设置初始状态：currentPhase = '2'
    // 3. 调用 phase2.execute()
    // 4. 断言：state.currentPhase 仍然是 '2'
  });

  it('execute() 不应该直接修改 state.currentPhase（大纲生成路径）', async () => {
    // 1. 不创建 outline.md
    // 2. 创建 requirements.json
    // 3. Mock outlineCommand
    // 4. 调用 phase2.execute()
    // 5. 断言：state.currentPhase 仍然是 '2'
  });
});
```

**预期**: 测试失败

**工时**: 1h

---

#### 任务 1.5: 移除 Phase 2 直接状态修改（Green）

**代码变更**: `src/orchestrator/phase2.ts`

删除第 32-36 行和第 57-61 行的代码块。

**验证**: 任务 1.4 的测试通过

**工时**: 0.5h

---

#### 任务 1.6: 清理 Phase 2 DIAG 日志（Refactor）

**代码变更**: `src/orchestrator/phase2.ts`

删除所有 `console.log` 诊断日志。

**工时**: 0.1h

---

#### 任务 1.7: 检查 outline.ts 命令（验证）

**检查**: `src/commands/outline.ts:82`

如果也直接修改 `currentPhase`，需要同样修复。

**工时**: 0.5h（如需修复）

---

#### 任务 1.8: 状态机集成测试

**测试文件**: `tests/orchestrator/state-machine-integration.test.ts`

```typescript
describe('状态机集成测试', () => {
  it('Phase 1 → Phase 2 转换由 exit condition 驱动', async () => {
    // 1. 创建完整测试项目
    // 2. 运行状态机 tick() 直到 Phase 2
    // 3. 断言：转换由 exit condition 触发，不是 execute() 内部修改
  });
});
```

**工时**: 1.5h

---

### 阶段 2: 验证 #34

#### 任务 2.1: 验证 requirements.json 生成

**测试文件**: `tests/orchestrator/phase1-file-generation.test.ts`

```typescript
describe('Phase1 文件生成', () => {
  it('execute() 应该生成 requirements.json', async () => {
    // 1. 创建测试项目，拷贝输入文档
    // 2. 调用 phase1.execute()
    // 3. 断言：assets/requirements.json 存在
  });

  it('requirements.json 内容不应该为空数组', async () => {
    // 1. 创建测试项目，拷贝输入文档
    // 2. 调用 phase1.execute()
    // 3. 断言：JSON.parse(content).length > 0
  });
});
```

**预期**: 如果阶段 1 修复后此测试通过，说明 #34 是 #33 的副作用；否则需要深入调查

**工时**: 0.5h

---

#### 任务 2.2: 如果 2.1 失败，调查 RequirementExtractor

**测试文件**: `tests/outline/requirement-extractor.test.ts`

```typescript
describe('RequirementExtractor', () => {
  it('应该从 Markdown 文件中提取需求', async () => {
    // 1. 创建测试 Markdown 文件
    // 2. 调用 extractor.extractFromDocument()
    // 3. 断言：返回的需求数组不为空
  });
});
```

**工时**: 1.5h（仅在 2.1 失败时需要）

---

### 阶段 3: 修复 #35 章节计数问题

#### 任务 3.1: TOC 标题不被计为章节（Red）

**测试文件**: `tests/assemble/chapter-count.test.ts`

```typescript
describe('章节数一致性', () => {
  it('TOC 标题不应该被计为章节', async () => {
    // 1. 创建测试大纲（10 个章节）
    // 2. 创建测试草稿
    // 3. 调用 assembler.assemble()
    // 4. 断言：## 标题数 === 10（不包括 "## 目录"）
  });

  it('finalization.json 的 level2Headings 应该排除 TOC', async () => {
    // 1. 创建测试大纲（10 个章节）
    // 2. 调用 finalizer.finalize()
    // 3. 断言：report.stats.level2Headings === 10
  });
});
```

**预期**: 测试失败（当前会计入 TOC）

**工时**: 1h

---

#### 任务 3.2: 修复 TOC 标题计数（Green）

**代码变更**: `src/assemble/finalizer.ts:102`

```typescript
// ❌ 当前
const level2Headings = (content.match(/^## /gm) || []).length;

// ✅ 修复：排除 TOC 标题
const level2Headings = (content.match(/^## (?!目录)/gm) || []).length;
```

**验证**: 任务 3.1 的测试通过

**工时**: 0.5h

---

#### 任务 3.3: 检查 heading-checker.ts（Refactor）

**检查**: `src/assemble/heading-checker.ts` 的 `extractH2Headings()` 是否也需要排除 TOC

**工时**: 0.5h

---

## 执行顺序

```
阶段 0 (#36) → 阶段 1.0 (更新现有测试)
  → 阶段 1.1-1.3 (Phase 1 修复)
  → 阶段 1.4-1.7 (Phase 2 修复)
  → 阶段 1.8 (集成测试)
  → 阶段 2 (#34 验证)
  → 阶段 3 (#35 修复)
```

---

## 任务清单汇总

| 任务 | Issue | 类型 | 预估工时 | 依赖 |
|------|-------|------|---------|------|
| 0.1 | #36 | 修复 | 0.25h | 无 |
| 1.0 | #33 | 更新测试 | 0.25h | 无 |
| 1.1 | #33 | Red | 0.5h | 1.0 |
| 1.2 | #33 | Green | 0.25h | 1.1 |
| 1.3 | #33 | Refactor | 0.1h | 1.2 |
| 1.4 | #33 | Red | 1h | 1.3 |
| 1.5 | #33 | Green | 0.5h | 1.4 |
| 1.6 | #33 | Refactor | 0.1h | 1.5 |
| 1.7 | #33 | 验证 | 0.5h | 1.6 |
| 1.8 | #33 | 集成测试 | 1.5h | 1.7 |
| 2.1 | #34 | 验证 | 0.5h | 1.8 |
| 2.2 | #34 | 调查（如需） | 1.5h | 2.1 失败 |
| 3.1 | #35 | Red | 1h | 无 |
| 3.2 | #35 | Green | 0.5h | 3.1 |
| 3.3 | #35 | Refactor | 0.5h | 3.2 |

**总工时**: 9.35h（不含 2.2 的 1.5h）

---

## TDD 检查清单

每个任务完成后检查：
- [ ] 测试是否先失败（Red）
- [ ] 代码是否让测试通过（Green）
- [ ] 是否进行了必要的重构（Refactor）
- [ ] 是否运行了 `npm run build && npm test`
- [ ] 是否更新了相关文档

---

## 风险缓解

| 风险 | 缓解措施 |
|------|---------|
| 修 Phase 1 导致 Phase 2 行为变化 | 同时修复 Phase 2，一起测试 |
| outline.ts 也直接改 phase | 任务 1.7 覆盖 |
| TOC 修复影响其他统计 | 只改 finalizer 的计数逻辑，不改 assembler |
| 现有测试失败阻塞 CI | 任务 1.0 先于 1.2 执行 |
