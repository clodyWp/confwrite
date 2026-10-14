# Issue #94 交付物清单

## 已生成文件

### 1. Spec 文件 ✅
**文件**：`specs/impact-analysis.md`  
**行数**：605 行  
**内容**：
- 19 条不变量（IA-1 到 IA-19）
- 4 类映射规则（镜像、文件名、跨模块、全局）
- 影响分析算法（含伪代码）
- CI 集成方案
- 配置文件设计
- 测试覆盖要求（7 类测试场景）
- 实现要点（含完整代码示例）

### 2. 实现计划 ✅
**文件**：`IMPACT-ANALYSIS-PLAN.md`  
**内容**：
- 待实现清单（核心脚本、配置文件、测试、CI 集成）
- 4 阶段实现计划（Phase 1-4）
- 验证清单（功能、性能、兼容性、不变量）
- 风险与缓解措施
- 下一步行动建议

---

## Spec 核心内容

### 不变量清单（19 条）

**映射规则**（IA-1 到 IA-8）：
- IA-1: 镜像映射必须覆盖所有 src/ 子目录
- IA-2: 镜像映射优先级最高
- IA-3: 文件名映射必须精确匹配
- IA-4: 一个源文件可对应多个测试文件
- IA-5: 跨模块依赖必须显式声明
- IA-6: 跨模块依赖配置必须可验证
- IA-7: 全局测试在任何 src/ 改动时都必须运行
- IA-8: 全局测试列表必须可配置

**算法特性**（IA-9 到 IA-12）：
- IA-9: 算法必须是确定性的
- IA-10: 算法必须是幂等的
- IA-11: 算法必须过滤不存在的测试文件
- IA-12: 输出必须去重并排序

**CI 集成**（IA-13 到 IA-14）：
- IA-13: CI 必须使用影响分析结果
- IA-14: 影响分析失败时必须回退到全量测试

**配置文件**（IA-15 到 IA-17）：
- IA-15: 配置文件必须是合法的 JSON
- IA-16: 配置文件必须版本化
- IA-17: 配置文件必须可验证

**错误处理**（IA-18 到 IA-19）：
- IA-18: 影响分析失败不得静默
- IA-19: 影响分析必须输出诊断信息

### 映射规则

1. **目录镜像映射**：`src/<module>/` → `tests/<module>/`
   - 14 个模块的 1:1 映射
   - 优先级最高

2. **文件名映射**：`src/<module>/<file>.ts` → `tests/<module>/<file>.test.ts`
   - 支持多测试文件模式：`<file>-<aspect>.test.ts`
   - 示例：`assembler.ts` → `assembler.test.ts`, `assembler-structure.test.ts`

3. **跨模块依赖映射**：显式声明跨模块测试依赖
   - 配置文件：`scripts/impact-analysis-config.json`
   - 初始依赖：4-5 个关键模块

4. **全局测试映射**：任何 src/ 改动都运行的测试
   - 8 个全局测试文件
   - 包括：e2e-full-flow, reproducible-bugs-*, regression-wave1-4, etc.

### 影响分析算法

```
输入：changedFiles[]
输出：affectedTests[]

流程：
1. 遍历变更文件
2. 对每个 src/ 文件：
   - 应用镜像映射
   - 应用跨模块依赖
3. 如果有 src/ 改动，添加全局测试
4. 过滤不存在的文件
5. 去重、排序
6. 返回结果
```

### 测试覆盖要求

**7 类测试场景**：

1. **映射规则测试**（3 个文件）
   - `impact-analysis-mirror.test.ts`
   - `impact-analysis-cross-module.test.ts`
   - `impact-analysis-global.test.ts`

2. **算法测试**（1 个文件）
   - `impact-analysis-algorithm.test.ts`

3. **CI 集成测试**（1 个文件）
   - `impact-analysis-ci.test.ts`

4. **配置测试**（1 个文件）
   - `impact-analysis-config.test.ts`

5. **错误处理测试**（1 个文件）
   - `impact-analysis-errors.test.ts`

**总计**：7 个测试文件，覆盖 19 条不变量

---

## 实现计划摘要

### Phase 1: 核心脚本（P0，2-3 小时）
- ✅ 实现 `scripts/impact-analysis.js`
- ✅ 创建 `scripts/impact-analysis-config.json`
- ✅ 验证脚本可运行

### Phase 2: 测试覆盖（P0，3-4 小时）
- ✅ 编写 7 个测试文件
- ✅ 运行测试验证

### Phase 3: CI 集成（P1，1-2 小时）
- ✅ 修改 `.github/workflows/ci.yml`
- ✅ 添加 npm scripts
- ✅ 验证 CI 流程

### Phase 4: 文档更新（P2，1 小时）
- ✅ 更新 AGENTS.md
- ✅ 更新 README.md
- ✅ 更新 CHANGELOG.md

**总预计时间**：7-10 小时

---

## 关键设计决策

### 1. 映射策略
**决策**：三层映射（镜像 + 跨模块 + 全局）  
**原因**：
- 镜像映射覆盖 80% 的场景（简单、直观）
- 跨模块依赖处理复杂场景（状态机、调度器等）
- 全局测试保证关键回归不被遗漏

### 2. 配置文件格式
**决策**：JSON 格式，版本化  
**原因**：
- 易于手动编辑和审查
- 支持 schema 验证
- 版本字段支持未来迁移

### 3. CI 集成方式
**决策**：GitHub Action step + npm script  
**原因**：
- 与现有 CI 流程无缝集成
- 本地开发也可使用
- 支持回退到全量测试

### 4. 输出格式
**决策**：空格分隔的测试文件列表  
**原因**：
- 便于 CI 直接使用（`npm test -- $AFFECTED_TESTS`）
- 便于本地脚本处理
- 人类可读

---

## 验证方法

### 功能验证
```bash
# 测试单文件影响
node scripts/impact-analysis.js src/assemble/assembler.ts

# 测试多文件影响
node scripts/impact-analysis.js src/assemble/assembler.ts src/writing/orchestrator.ts

# 详细输出
node scripts/impact-analysis.js --verbose src/assemble/assembler.ts
```

### 测试验证
```bash
# 运行所有影响分析测试
npm test -- tests/scripts/impact-analysis-*.test.ts

# 运行特定测试
npm test -- tests/scripts/impact-analysis-mirror.test.ts
```

### CI 验证
1. 创建测试 PR
2. 检查 "Analyze impact" 步骤输出
3. 验证 "Test" 步骤只运行受影响的测试
4. 对比 CI 时间（预期节省 30%+）

---

## 下一步行动

### 立即可做
1. **审查 Spec 文件**：确认 19 条不变量是否完整
2. **审查映射规则**：确认跨模块依赖列表是否准确
3. **开始实现**：按照 Phase 1 计划实现核心脚本

### 需要讨论
1. **跨模块依赖初始列表**：是否需要调整？
2. **全局测试列表**：8 个测试是否足够？
3. **CI 启用策略**：立即启用还是先并行验证？

---

## 文件清单

| 文件 | 状态 | 说明 |
|------|------|------|
| `specs/impact-analysis.md` | ✅ 已完成 | Spec 文件（605 行） |
| `IMPACT-ANALYSIS-PLAN.md` | ✅ 已完成 | 实现计划 |
| `scripts/impact-analysis.js` | ⏳ 待实现 | 核心脚本 |
| `scripts/impact-analysis-config.json` | ⏳ 待实现 | 配置文件 |
| `tests/scripts/impact-analysis-*.test.ts` | ⏳ 待实现 | 7 个测试文件 |
| `.github/workflows/ci.yml` | ⏳ 待修改 | CI 集成 |
| `package.json` | ⏳ 待修改 | 添加 npm scripts |

---

**生成日期**：2026-10-15  
**Issue**：#94  
**优先级**：P2
