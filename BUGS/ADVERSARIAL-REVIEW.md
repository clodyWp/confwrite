# 修复计划对抗性检查报告

**检查时间**: 2026-01-09  
**检查对象**: TASK-BREAKDOWN.md

---

## 检查维度

1. **逻辑一致性**：任务之间是否有矛盾或强依赖？
2. **完整性**：是否遗漏了重要场景？
3. **可行性**：代码改动是否真的能解决问题？
4. **风险评估**：每个改动可能引入什么新问题？
5. **测试覆盖**：测试用例是否足够？

---

## 任务 1.1：删除第 3 节字数检查

### ❌ 严重问题：与任务 1.2 有强依赖

**问题描述**：
- 任务 1.1 删除第 3 节字数检查
- 但如果第 7 节没有生成（wordBudget 为 undefined），Reviewer 就完全没有字数检查了
- 任务 1.2 确保 wordBudget 总是传递，但还没有执行

**风险**：
- 如果先执行 1.1 再执行 1.2，中间状态会导致 Reviewer 没有字数检查
- 这是一个**破坏性改动**，必须确保第 7 节总是存在

**修复建议**：
1. **调整执行顺序**：先执行 1.2（确保第 7 节总是存在），再执行 1.1（删除第 3 节）
2. **增加保护性测试**：测试"当 wordBudget 为 undefined 时，第 7 节仍然应该存在"

### ❌ 测试覆盖不足

**问题描述**：
- 只测试了"第 3 节不包含字数"
- 没有测试"第 7 节必须存在"

**缺失的测试**：
```typescript
it('当 wordBudget 为 undefined 时，第 7 节仍然应该存在（使用默认值）', () => {
  const prompt = executor.generateReviewerPrompt(
    mockTask, '内容', mockBaseline, 1, '', undefined
    // 不传 wordBudget
  );
  
  // 第 7 节应该存在
  expect(prompt).toContain('### 7. 字数预算检查');
  // 应该使用默认值
  expect(prompt).toContain('5000-8000');
});
```

---

## 任务 1.2：为 wordBudget 设置默认值

### ⚠️ 设计问题：默认值硬编码

**问题描述**：
```typescript
wordBudget: { min: number; max: number } = { min: 5000, max: 8000 }  // 硬编码
```

**风险**：
- 如果配置变了（比如 defaultWordBudget.target 改为 7000），默认值不会跟随改变
- 违反了"单一数据源"原则

**修复建议**：
```typescript
// 从 config 读取默认值
wordBudget: { min: number; max: number } = {
  min: this.config.writing.minChapterChars,
  max: Math.round(this.config.writing.minChapterChars * 1.6)  // 8000 = 5000 * 1.6
}
```

**缺失的测试**：
```typescript
it('当 config 改变时，默认值应该跟随改变', () => {
  const customConfig = {
    ...DEFAULT_CONFIG,
    writing: {
      ...DEFAULT_CONFIG.writing,
      minChapterChars: 6000
    }
  };
  const executor = new TaskExecutor(customConfig);
  
  const prompt = executor.generateReviewerPrompt(
    mockTask, '内容', mockBaseline, 1, '', undefined
  );
  
  // 应该使用新的默认值
  expect(prompt).toContain('6000-9600');  // 6000 * 1.6 = 9600
});
```

---

## 任务 1.3：统一 minChapterChars 配置

### ⚠️ 向后兼容性问题

**问题描述**：
- 修改默认配置可能影响现有项目
- 没有说明向后兼容性

**风险**：
- 现有项目可能依赖旧的 minChapterChars 值
- 如果用户自定义了配置，修改默认值不会影响他们
- 但如果用户没有自定义配置，修改默认值会影响他们

**缺失的测试**：
```typescript
it('现有项目使用旧配置时应该正常工作', () => {
  // 模拟旧配置
  const oldConfig = {
    writing: {
      minChapterChars: 8000,  // 旧值
      defaultWordBudget: {
        target: 6500,
        tolerance: 0.2
      }
    }
  };
  
  // 应该能够正常加载
  const validator = new OutputValidator(testDir, oldConfig);
  // 应该使用旧值
  expect(validator.config.writing.minChapterChars).toBe(8000);
});
```

---

## 任务 1.4：集成测试

### ❌ 测试场景不完整

**问题描述**：
- 只测试了"正常情况"（wordBudget 存在）
- 没有测试"边界情况"（wordBudget 为 undefined）

**缺失的测试**：
```typescript
it('当 wordBudget 为 undefined 时，prompt 应该使用默认值', () => {
  const prompt = executor.generateReviewerPrompt(
    mockTask, '内容', mockBaseline, 1, '', undefined
    // 不传 wordBudget
  );
  
  // 应该包含第 7 节
  expect(prompt).toContain('### 7. 字数预算检查');
  // 应该使用默认值
  expect(prompt).toContain('5000-8000');
});

it('当 wordBudget 的 min > max 时，应该抛出错误', () => {
  expect(() => {
    executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 10000, max: 5000 }  // 错误：min > max
    );
  }).toThrow();
});
```

---

## 任务 2.1：删除 Phase 1 内部状态修改

### ❌ 严重问题：没有验证状态机推进逻辑

**问题描述**：
- 删除 Phase 1 内部状态修改后，状态机是否能正确推进？
- 没有验证状态机的 exit condition

**风险**：
- 如果状态机的 exit condition 依赖于 Phase 1 内部修改的状态，流程会卡住
- 需要检查 `src/orchestrator/phases.ts` 中 Phase 1 的 exit condition

**缺失的测试**：
```typescript
it('状态机应该能从 Phase 1 正确推进到 Phase 2', async () => {
  const state = createMinimalState(projectDir);
  state.currentPhase = '1';
  store.save(state);
  
  createInputFiles(projectDir);
  
  // 执行 Phase 1
  await phase1.execute();
  
  // 验证 requirements.json 已生成
  const requirementsPath = join(projectDir, 'assets', 'requirements.json');
  expect(existsSync(requirementsPath)).toBe(true);
  
  // 验证状态机可以推进
  const machine = new StateMachine(projectDir);
  const result = await machine.tick();
  
  // 应该推进到 Phase 2
  expect(result.phase).toBe('2');
  expect(result.advanced).toBe(true);
});
```

### ⚠️ 没有检查 Phase 1 的 exit condition

**需要检查的代码**：
```typescript
// src/orchestrator/phases.ts
export const phase1: PhaseDefinition = {
  id: '1',
  name: '需求分析',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    // ...
  },
  exits: [
    { target: '2', condition: (ctx) => {
      const store = new ProjectStore(ctx.projectDir);
      const phase1 = new Phase1RequirementAnalysis(ctx.projectDir, store);
      return phase1.validate();  // ← 检查 requirements.json 是否存在
    }},
  ],
};
```

**结论**：exit condition 检查 `requirements.json` 是否存在，不依赖于 Phase 1 内部修改的状态。所以删除内部状态修改是安全的。

---

## 任务 3.1：修复章节数不匹配

### ❌ 严重问题：代码位置待定位

**问题描述**：
- "代码位置待定位"说明还没有完全理解问题
- 没有说明可能的根因

**风险**：
- 可能在修复过程中发现更复杂的问题
- 可能需要更多的时间来定位问题

**建议**：
1. 先排查组装逻辑，确定具体改动位置
2. 可能的根因：
   - 组装器把文档标题算作了一个章节
   - 某个章节被重复组装
   - 大纲解析和组装逻辑不一致

**缺失的测试**：
```typescript
it('当大纲有 10 章但草稿有 11 章时，应该报告错误', () => {
  // 创建 10 章大纲
  createOutline(testDir, 10);
  
  // 创建 11 章草稿
  createChapterDrafts(testDir, 11);
  
  const assembler = new Assembler();
  
  // 应该报告错误
  expect(() => {
    assembler.assemble(testDir);
  }).toThrow('章节数不匹配');
});
```

---

## 整体问题

### ❌ 任务顺序错误

**问题描述**：
- 任务 1.1 和 1.2 有强依赖
- 当前顺序：1.1 → 1.2
- 正确顺序：1.2 → 1.1

**修复建议**：
```
执行顺序：
1. 任务 1.2 → 确保第 7 节总是存在
2. 任务 1.1 → 删除第 3 节字数检查
3. 任务 1.3 → 统一配置
4. 任务 1.4 → 集成测试
```

### ⚠️ 没有提到回归测试

**问题描述**：
- 每个任务完成后，应该运行完整测试套件
- 确保不破坏现有功能

**修复建议**：
在每个任务的"验收标准"中增加：
```
- ✅ 运行 `npm test`，所有现有测试通过
```

### ⚠️ 没有考虑向后兼容

**问题描述**：
- 修改默认配置可能影响现有项目
- 没有说明向后兼容策略

**修复建议**：
在 FIX-PLAN.md 中增加"向后兼容性"章节：
```markdown
## 向后兼容性

### 配置变更
- minChapterChars 默认值从 8000 改为 5000
- 影响：现有项目如果没有自定义配置，会使用新值
- 缓解：在 CHANGELOG 中说明，提供迁移指南

### API 变更
- generateReviewerPrompt 的 wordBudget 参数从可选改为有默认值
- 影响：现有代码不需要修改
- 缓解：向后兼容
```

---

## 修正后的任务分解

### 阶段 1：修复字数控制链路（P0）

**执行顺序**（修正后）：

1. **任务 1.2**：为 wordBudget 设置默认值（从 config 读取）
   - 确保第 7 节总是存在
   - 测试：wordBudget 为 undefined 时，使用默认值

2. **任务 1.1**：删除第 3 节字数检查
   - 前提：任务 1.2 已完成
   - 测试：第 3 节不包含字数，第 7 节包含字数

3. **任务 1.3**：统一 minChapterChars 配置
   - 测试：配置一致性

4. **任务 1.4**：集成测试
   - 测试：完整 prompt 包含所有必要部分
   - 测试：边界情况（wordBudget 为 undefined）

### 阶段 2：修复 Phase 1 状态转换（P1）

5. **任务 2.1**：删除 Phase 1 内部状态修改
   - 测试：状态机能正确推进

### 阶段 3：修复组装逻辑（P2）

6. **任务 3.1**：修复章节数不匹配问题
   - 先定位代码位置
   - 测试：章节数一致性

---

## 新增的测试用例

### 任务 1.2 新增测试

```typescript
it('当 config 改变时，默认值应该跟随改变', () => {
  const customConfig = {
    ...DEFAULT_CONFIG,
    writing: {
      ...DEFAULT_CONFIG.writing,
      minChapterChars: 6000
    }
  };
  const executor = new TaskExecutor(customConfig);
  
  const prompt = executor.generateReviewerPrompt(
    mockTask, '内容', mockBaseline, 1, '', undefined
  );
  
  expect(prompt).toContain('6000-9600');
});
```

### 任务 1.4 新增测试

```typescript
it('当 wordBudget 为 undefined 时，prompt 应该使用默认值', () => {
  const prompt = executor.generateReviewerPrompt(
    mockTask, '内容', mockBaseline, 1, '', undefined
  );
  
  expect(prompt).toContain('### 7. 字数预算检查');
  expect(prompt).toContain('5000-8000');
});

it('当 wordBudget 的 min > max 时，应该抛出错误', () => {
  expect(() => {
    executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 10000, max: 5000 }
    );
  }).toThrow();
});
```

### 任务 2.1 新增测试

```typescript
it('状态机应该能从 Phase 1 正确推进到 Phase 2', async () => {
  const state = createMinimalState(projectDir);
  state.currentPhase = '1';
  store.save(state);
  
  createInputFiles(projectDir);
  
  await phase1.execute();
  
  const requirementsPath = join(projectDir, 'assets', 'requirements.json');
  expect(existsSync(requirementsPath)).toBe(true);
  
  const machine = new StateMachine(projectDir);
  const result = await machine.tick();
  
  expect(result.phase).toBe('2');
  expect(result.advanced).toBe(true);
});
```

---

## 结论

### 发现的问题

| # | 问题 | 严重程度 | 任务 |
|---|------|---------|------|
| 1 | 任务 1.1 和 1.2 有强依赖，顺序错误 | ❌ 严重 | 1.1, 1.2 |
| 2 | 默认值硬编码，违反单一数据源 | ⚠️ 中等 | 1.2 |
| 3 | 没有考虑向后兼容 | ⚠️ 中等 | 1.3 |
| 4 | 测试场景不完整 | ❌ 严重 | 1.4 |
| 5 | 没有验证状态机推进逻辑 | ❌ 严重 | 2.1 |
| 6 | 代码位置待定位 | ❌ 严重 | 3.1 |
| 7 | 没有提到回归测试 | ⚠️ 中等 | 全部 |

### 修复建议

1. **调整任务顺序**：1.2 → 1.1 → 1.3 → 1.4
2. **从 config 读取默认值**：不要硬编码
3. **增加向后兼容性说明**：在 FIX-PLAN.md 中增加章节
4. **补充测试用例**：覆盖边界情况
5. **验证状态机推进**：增加集成测试
6. **先定位代码位置**：再开始任务 3.1
7. **每个任务完成后运行完整测试**：确保不破坏现有功能

### 风险评估

| 任务 | 风险等级 | 主要风险 |
|------|---------|---------|
| 1.1 | 🔴 高 | 如果第 7 节不存在，Reviewer 没有字数检查 |
| 1.2 | 🟡 中 | 默认值硬编码，可能不一致 |
| 1.3 | 🟡 中 | 可能影响现有项目 |
| 1.4 | 🟢 低 | 只是测试，没有代码改动 |
| 2.1 | 🟡 中 | 可能影响状态机推进 |
| 3.1 | 🔴 高 | 代码位置待定位，可能有复杂问题 |

### 最终建议

**先执行任务 1.2**，确保第 7 节总是存在，然后再执行任务 1.1。这样可以避免中间状态导致 Reviewer 没有字数检查。
