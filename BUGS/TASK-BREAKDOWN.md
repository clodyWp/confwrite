# ConfWrite Bug 修复任务分解（最小测试单元）

**创建时间**: 2026-01-09  
**基于**: LMERP2V2-v6 E2E 测试

---

## 任务分解原则

每个任务必须包含：
1. **具体代码改动**：文件路径、行号、修改内容
2. **测试用例**：新增或修改的测试文件
3. **验收标准**：明确的通过/失败条件

---

## 阶段 1：修复字数控制链路（P0）

### 任务 1.1：修复 Reviewer prompt 中字数标准重复问题

**Bug ID**: bug-reviewer-prompt-duplicate-word-check.md

**代码改动**：
- 文件：`src/writing/task-executor.ts`
- 行号：449-460（第 3 节"内容深度"）
- 修改：删除字数检查部分，改为引用第 7 节

```typescript
// 修改前（第 449 行）
**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ ${this.config.writing.minChapterChars} 字**

// 修改后
**篇幅检查**（Reviewer 核心职责）：
- 见第 7 节"字数预算检查"
```

**测试用例**：
- 文件：`tests/writing/reviewer-prompt-word-check.test.ts`（新增）
- 测试 1：Reviewer prompt 中只有一处字数标准
- 测试 2：第 3 节不包含具体字数要求
- 测试 3：第 7 节包含 wordBudget 的 min 和 max

```typescript
describe('Reviewer Prompt - 字数标准唯一性', () => {
  it('应该只有一处字数检查标准（第 7 节）', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 5000, max: 8000 }
    );
    
    // 第 3 节不应该包含具体字数
    const section3 = prompt.split('### 3. 内容深度')[1].split('### 4.')[0];
    expect(section3).not.toMatch(/≥ \d+ 字/);
    
    // 第 7 节应该包含字数预算
    const section7 = prompt.split('### 7. 字数预算检查')[1];
    expect(section7).toContain('5000-8000');
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

### 任务 1.2：确保 wordBudget 总是传递给 Reviewer

**Bug ID**: bug-wordbudget-not-passed-to-reviewer.md

**代码改动**：
- 文件：`src/writing/task-executor.ts`
- 行号：365（generateReviewerPrompt 方法签名）
- 修改：为 wordBudget 参数设置默认值

```typescript
// 修改前
generateReviewerPrompt(
  task: Task,
  chapterContent: string,
  baseline: ReviewBaseline,
  round: number = 1,
  knowledgeContent: string = '',
  projectDir?: string,
  wordBudget?: { min: number; max: number }  // 可选参数
): string

// 修改后
generateReviewerPrompt(
  task: Task,
  chapterContent: string,
  baseline: ReviewBaseline,
  round: number = 1,
  knowledgeContent: string = '',
  projectDir?: string,
  wordBudget: { min: number; max: number } = { min: 5000, max: 8000 }  // 默认值
): string
```

**测试用例**：
- 文件：`tests/writing/reviewer-prompt-wordbudget-default.test.ts`（新增）
- 测试 1：不传 wordBudget 时使用默认值
- 测试 2：传 wordBudget 时使用传入值

```typescript
describe('Reviewer Prompt - wordBudget 默认值', () => {
  it('不传 wordBudget 时应该使用默认值 5000-8000', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined
      // 不传 wordBudget
    );
    
    expect(prompt).toContain('5000-8000');
  });
  
  it('传 wordBudget 时应该使用传入值', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 6000, max: 10000 }
    );
    
    expect(prompt).toContain('6000-10000');
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

### 任务 1.3：统一 minChapterChars 配置

**Bug ID**: bug-min-chapter-chars-mismatch.md

**代码改动**：
- 文件：`src/config/loader.ts`
- 行号：81（minChapterChars 默认值）
- 修改：确保与 wordBudget.min 一致

```typescript
// 修改前
minChapterChars: 5000,  // Bug 41 修复：与 wordBudget.min 保持一致（5200）

// 修改后
minChapterChars: 5000,  // 与 defaultWordBudget.target * (1 - tolerance) 一致
// 5000 = 6500 * (1 - 0.2) = 5200，取整为 5000
```

**测试用例**：
- 文件：`tests/config/loader-consistency.test.ts`（新增）
- 测试 1：minChapterChars 与 wordBudget.min 一致

```typescript
describe('Config - 字数配置一致性', () => {
  it('minChapterChars 应该与 wordBudget.min 一致', () => {
    const config = DEFAULT_CONFIG;
    const expectedMin = Math.round(
      config.writing.defaultWordBudget.target * 
      (1 - config.writing.defaultWordBudget.tolerance)
    );
    
    expect(config.writing.minChapterChars).toBe(expectedMin);
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

### 任务 1.4：集成测试 - Reviewer prompt 完整性

**Bug ID**: 综合验证

**测试用例**：
- 文件：`tests/writing/reviewer-prompt-integration.test.ts`（新增）
- 测试 1：完整 prompt 包含所有必要部分
- 测试 2：字数标准唯一且正确
- 测试 3：wordBudget 正确传递

```typescript
describe('Reviewer Prompt - 集成测试', () => {
  it('应该包含完整的字数预算检查（第 7 节）', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 5000, max: 8000 }
    );
    
    // 应该包含第 7 节
    expect(prompt).toContain('### 7. 字数预算检查');
    expect(prompt).toContain('5000-8000');
    expect(prompt).toContain('硬性上限');
    expect(prompt).toContain('不得超过 8000 字');
  });
  
  it('字数标准应该唯一', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask, '内容', mockBaseline, 1, '', undefined,
      { min: 5000, max: 8000 }
    );
    
    // 统计"字数"出现次数（应该只在第 7 节详细说明）
    const wordCountMentions = (prompt.match(/字数预算/g) || []).length;
    expect(wordCountMentions).toBeGreaterThanOrEqual(1);
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

## 阶段 2：修复 Phase 1 状态转换（P1）

### 任务 2.1：修复 Phase 1 内部状态修改

**Bug ID**: bug-phase1-state-transition.md

**代码改动**：
- 文件：`src/orchestrator/phase1.ts`
- 行号：67-69
- 修改：删除内部状态修改

```typescript
// 修改前（第 67-69 行）
const state = this.store.load();
if (state) {
  state.currentPhase = '2';  // ❌ 直接修改 phase
  state.lastUpdated = new Date().toISOString();
  this.store.save(state);
}

// 修改后
// 删除这段代码，让状态机处理状态转换
```

**测试用例**：
- 文件：`tests/orchestrator/phase1-state-transition.test.ts`（新增）
- 测试 1：Phase 1 执行后不修改 currentPhase
- 测试 2：状态机正确推进到 Phase 2

```typescript
describe('Phase1 - 状态转换', () => {
  it('执行后不应该修改 currentPhase', async () => {
    const state = createMinimalState(projectDir);
    state.currentPhase = '1';
    store.save(state);
    
    // 创建输入文件
    createInputFiles(projectDir);
    
    await phase1.execute();
    
    // 验证 phase 仍然是 '1'
    const updatedState = store.load();
    expect(updatedState.currentPhase).toBe('1');
  });
  
  it('应该生成 requirements.json', async () => {
    const state = createMinimalState(projectDir);
    store.save(state);
    
    createInputFiles(projectDir);
    
    await phase1.execute();
    
    // 验证 requirements.json 已生成
    const requirementsPath = join(projectDir, 'assets', 'requirements.json');
    expect(existsSync(requirementsPath)).toBe(true);
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

## 阶段 3：修复组装逻辑（P2）

### 任务 3.1：修复章节数不匹配问题

**Bug ID**: bug-chapter-count-mismatch.md

**代码改动**：
- 文件：`src/assemble/assembler.ts`
- 行号：待定位
- 修改：确保章节计数正确

**测试用例**：
- 文件：`tests/assemble/assembler-chapter-count.test.ts`（新增）
- 测试 1：组装后章节数与大纲一致

```typescript
describe('Assembler - 章节数一致性', () => {
  it('组装后的章节数应该与大纲一致', () => {
    // 创建 10 章草稿
    createChapterDrafts(testDir, 10);
    
    const assembler = new Assembler();
    const result = assembler.assemble(testDir);
    
    // 验证章节数
    expect(result.chapters.length).toBe(10);
  });
});
```

**验收标准**：
- ✅ 测试通过
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过

---

## 执行顺序

1. **任务 1.1** → 测试 → 提交
2. **任务 1.2** → 测试 → 提交
3. **任务 1.3** → 测试 → 提交
4. **任务 1.4** → 集成测试 → 提交
5. **任务 2.1** → 测试 → 提交
6. **任务 3.1** → 测试 → 提交

---

## 总工作量估算

| 任务 | 代码改动 | 测试编写 | 预计时间 |
|------|---------|---------|---------|
| 1.1 | 10 行 | 30 行 | 30 分钟 |
| 1.2 | 5 行 | 30 行 | 30 分钟 |
| 1.3 | 5 行 | 20 行 | 20 分钟 |
| 1.4 | 0 行 | 50 行 | 40 分钟 |
| 2.1 | 10 行 | 40 行 | 40 分钟 |
| 3.1 | 待定位 | 30 行 | 1 小时 |
| **总计** | ~30 行 | ~200 行 | **3.5 小时** |

---

## 风险与缓解

### 风险 1：任务 1.1-1.4 之间有依赖

**缓解**：按顺序执行，每个任务完成后运行完整测试套件

### 风险 2：任务 2.1 可能影响状态机其他部分

**缓解**：先运行现有状态机测试，确保不破坏现有功能

### 风险 3：任务 3.1 代码位置待定位

**缓解**：先排查组装逻辑，确定具体改动位置
