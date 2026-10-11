# ConfWrite Bug 修复计划

**创建时间**: 2026-01-09  
**基于**: LMERP2V2-v6 E2E 测试

---

## Bug 总览

| # | Bug ID | 严重程度 | 描述 |
|---|--------|---------|------|
| 1 | bug-wordbudget-not-passed-to-reviewer.md | P0 | wordBudget 未传递给 Reviewer，第 7 节未生成 |
| 2 | bug-reviewer-prompt-duplicate-word-check.md | P0 | Reviewer prompt 中字数标准重复且矛盾 |
| 3 | bug-reviewer-prompt-word-limit.md | P0 | Reviewer 审阅标准与大纲预算矛盾 |
| 4 | bug-min-chapter-chars-mismatch.md | P0 | minChapterChars 配置值与 wordBudget 不一致 |
| 5 | bug-phase1-state-transition.md | P1 | Phase 1 状态转换绕过状态机 |
| 6 | bug-word-count-exceeded.md | P1 | 章节字数严重超标（平均 2.2x） |
| 7 | bug-reviewer-word-count.md | P1 | Reviewer 发现超标但仍然 accept |
| 8 | bug-chapter-count-mismatch.md | P2 | 大纲 10 章，文档 11 个二级标题 |
| 9 | bug-phase1-requirements-json.md | P2 | Phase 1 未生成 requirements.json |

---

## 因果分析

### 因果链 1：字数控制完全失效（Bug 1→2→3→4→6→7）

```
根因层：
  Bug 4: minChapterChars 配置值（8000）与 wordBudget.min（5000）不一致
    ↓
  Bug 1: wordBudget 未传递给 Reviewer（运行时 undefined）
    ↓
  Bug 2: Reviewer prompt 中第 7 节（字数预算检查）未生成
    ↓
表现层：
  Bug 3: 第 3 节使用 minChapterChars（8000）作为下限，与大纲预算矛盾
    ↓
  Bug 6: Writer 写了 15000+ 字，远超预算
    ↓
  Bug 7: Reviewer 只看到"≥ 8000 字"，没有上限检查，accept 了超标内容
```

**结论**：Bug 1-4 是根因，Bug 6-7 是表现。修复 Bug 1-4 后，Bug 6-7 应该自动解决。

### 因果链 2：Phase 1 状态转换（Bug 5→9）

```
Bug 5: Phase 1 内部直接修改 currentPhase = '2'，绕过状态机
  ↓
Bug 9: requirements.json 可能未生成，但状态已经推进到 Phase 2
```

**结论**：Bug 5 是根因，Bug 9 可能是表现。修复 Bug 5 后，Bug 9 应该自动解决。

### 独立问题（Bug 8）

```
Bug 8: 大纲 10 章，文档 11 个二级标题
```

**结论**：独立问题，需要单独排查组装逻辑。

---

## 修复计划

### 阶段 1：修复字数控制链路（P0，4 个 bug）

**目标**：确保 Reviewer 正确检查字数上限和下限

**修复内容**：

1. **Bug 1: wordBudget 未传递**
   - 文件：`src/dispatcher/index.ts`
   - 修复：添加日志和默认值，确保 wordBudget 总是传递
   - 验证：检查 task 文件中是否有"字数预算检查"部分

2. **Bug 2: Prompt 中字数标准重复**
   - 文件：`src/writing/task-executor.ts`
   - 修复：删除第 3 节的字数检查，只保留第 7 节
   - 验证：检查 prompt 中是否只有一处字数标准

3. **Bug 3: 审阅标准与大纲矛盾**
   - 文件：`src/writing/task-executor.ts`
   - 修复：使用 wordBudget 而不是 minChapterChars
   - 验证：检查 prompt 中的字数标准是否与大纲一致

4. **Bug 4: 配置不一致**
   - 文件：`src/config/loader.ts`
   - 修复：确保 minChapterChars 与 wordBudget.min 一致
   - 验证：检查默认配置是否合理

**预计工作量**：2-3 小时  
**依赖关系**：Bug 1-4 可以并行修复

### 阶段 2：修复 Phase 1 状态转换（P1，2 个 bug）

**目标**：确保 Phase 1 正确生成 requirements.json

**修复内容**：

1. **Bug 5: Phase 1 状态转换绕过状态机**
   - 文件：`src/orchestrator/phase1.ts`
   - 修复：删除 Phase 1 内部的 phase 修改，让状态机处理
   - 验证：检查 Phase 1 执行后状态是否正确

2. **Bug 9: requirements.json 未生成**
   - 文件：`src/orchestrator/phase1.ts`
   - 修复：确认是否是 Bug 5 的连锁反应
   - 验证：检查 requirements.json 是否生成

**预计工作量**：1-2 小时  
**依赖关系**：Bug 5 先修复，Bug 9 可能需要单独处理

### 阶段 3：修复组装逻辑（P2，1 个 bug）

**目标**：确保组装后章节数与大纲一致

**修复内容**：

1. **Bug 8: 章节数不匹配**
   - 文件：`src/assemble/assembler.ts`
   - 修复：检查组装逻辑，确保章节计数正确
   - 验证：检查组装后的文档章节数

**预计工作量**：1 小时  
**依赖关系**：独立问题

---

## 执行策略

### 方案 A：串行修复（推荐）

按阶段顺序修复，每个阶段完成后执行 E2E 测试验证。

**优点**：
- 风险低，每步都有验证
- 容易定位问题

**缺点**：
- 耗时长（4-6 小时）

### 方案 B：并行修复（使用 subagent）

启动 2 个 subagent：
- Subagent 1：修复字数控制链路（Bug 1-4）
- Subagent 2：修复 Phase 1 状态转换（Bug 5, 9）

**优点**：
- 耗时短（2-3 小时）

**缺点**：
- 风险高，可能有冲突
- 需要集成测试

### 方案 C：混合方案（推荐）

1. 先修复 Bug 1-4（字数控制），因为这是最严重的问题
2. 执行 E2E 测试验证
3. 再修复 Bug 5, 9（Phase 1）
4. 最后修复 Bug 8（组装）

**优点**：
- 平衡风险和时间
- 优先解决最严重的问题

---

## 验证计划

### 阶段 1 验证

1. 单元测试：检查 wordBudget 是否正确传递
2. 集成测试：检查 Reviewer prompt 是否正确
3. E2E 测试：执行完整流程，检查字数控制

### 阶段 2 验证

1. 单元测试：检查 Phase 1 状态转换
2. 集成测试：检查 requirements.json 是否生成
3. E2E 测试：执行完整流程，检查 Phase 1

### 阶段 3 验证

1. 单元测试：检查组装逻辑
2. E2E 测试：执行完整流程，检查章节数

---

## 风险与缓解

### 风险 1：修复 Bug 1-4 后，Writer 仍然写超长内容

**缓解**：检查 Writer prompt 中的字数约束是否足够强制

### 风险 2：修复 Bug 5 后，Phase 1 仍然不生成 requirements.json

**缓解**：单独排查 RequirementExtractor 的逻辑

### 风险 3：修复 Bug 8 后，组装逻辑引入新问题

**缓解**：添加回归测试，确保现有功能不受影响

---

## 决策

**选择方案 C（混合方案）**：
1. 先修复 Bug 1-4（字数控制）
2. 执行 E2E 测试验证
3. 再修复 Bug 5, 9（Phase 1）
4. 最后修复 Bug 8（组装）

**理由**：
- 字数控制是最严重的问题，影响所有测试
- Phase 1 问题相对独立，可以后续修复
- 组装问题影响较小，可以最后修复
