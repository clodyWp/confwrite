# 变更影响分析 - 测试设计与实现计划

> **Issue**: #94  
> **Spec**: `specs/impact-analysis.md`  
> **日期**: 2026-10-15

---

## 1. 已完成

✅ **Spec 文件**：`specs/impact-analysis.md`

包含：
- 19 条不变量（IA-1 到 IA-19）
- 4 类映射规则（镜像、文件名、跨模块、全局）
- 影响分析算法（确定性、幂等、可验证）
- CI 集成方案（GitHub Action + npm script）
- 配置文件设计（JSON 格式，可验证）
- 测试覆盖要求（5 类测试场景）

---

## 2. 待实现

### 2.1 核心脚本

**文件**：`scripts/impact-analysis.js`

**功能**：
- 解析变更文件列表
- 应用映射规则（镜像 + 跨模块 + 全局）
- 输出受影响的测试文件
- 支持 `--verbose` 诊断模式

**依赖**：
- `glob` 包（已在 package.json 中）
- Node.js 内置模块（fs, path）

**实现要点**：
- 参考 `scripts/check-docs.js` 和 `scripts/check-sdd.js` 的代码风格
- 使用 ESM 导入（`.js` 后缀）
- 错误处理：配置文件缺失时降级，格式错误时终止
- 输出格式：空格分隔的测试文件列表（便于 CI 使用）

### 2.2 配置文件

**文件**：`scripts/impact-analysis-config.json`

**内容**：
- 跨模块依赖映射（初始版本包含 4-5 个关键依赖）
- 全局测试列表（8 个文件）
- 排除模式（fixtures, tmp）

**初始跨模块依赖**：
1. `src/orchestrator/state-machine.ts` → 状态机相关测试
2. `src/writing/orchestrator.ts` → 写作循环测试
3. `src/state/store.ts` → 状态存储测试
4. `src/dispatcher/index.ts` → 调度器测试

### 2.3 测试文件

**目录**：`tests/scripts/`

**测试文件列表**：

1. **impact-analysis-mirror.test.ts**
   - 镜像映射：单文件 → 单测试
   - 镜像映射：单文件 → 多测试
   - 镜像映射：模块排除
   - 覆盖：IA-1, IA-2, IA-3, IA-4

2. **impact-analysis-cross-module.test.ts**
   - 跨模块依赖：精确文件匹配
   - 跨模块依赖：目录展开
   - 跨模块依赖：配置缺失
   - 覆盖：IA-5, IA-6

3. **impact-analysis-global.test.ts**
   - 全局测试：任何 src/ 改动触发
   - 全局测试：非 src/ 改动不触发
   - 全局测试：配置可定制
   - 覆盖：IA-7, IA-8

4. **impact-analysis-algorithm.test.ts**
   - 确定性：相同输入 → 相同输出
   - 幂等性：多次运行结果一致
   - 过滤：不存在的测试文件被移除
   - 去重：重复测试只出现一次
   - 排序：输出按字母序
   - 覆盖：IA-9, IA-10, IA-11, IA-12

5. **impact-analysis-ci.test.ts**
   - CI 集成：使用影响分析结果
   - CI 集成：失败时回退到全量测试
   - 覆盖：IA-13, IA-14

6. **impact-analysis-config.test.ts**
   - 配置合法性：JSON 格式验证
   - 配置版本：version 字段存在
   - 配置验证：schema 检查
   - 覆盖：IA-15, IA-16, IA-17

7. **impact-analysis-errors.test.ts**
   - 错误处理：配置文件不存在
   - 错误处理：配置文件格式错误
   - 错误处理：变更文件列表为空
   - 错误处理：诊断信息输出
   - 覆盖：IA-18, IA-19

### 2.4 CI 集成

**文件**：`.github/workflows/ci.yml`

**修改**：
```yaml
# 在 "Test" 步骤之前添加
- name: Analyze impact
  id: impact
  run: |
    if [ "${{ github.event_name }}" == "pull_request" ]; then
      CHANGED_FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | tr '\n' ' ')
    else
      CHANGED_FILES=$(git diff --name-only HEAD~1 | tr '\n' ' ')
    fi
    AFFECTED_TESTS=$(node scripts/impact-analysis.js $CHANGED_FILES)
    echo "affected_tests=$AFFECTED_TESTS" >> $GITHUB_OUTPUT
    echo "Affected tests: $AFFECTED_TESTS"

# 修改 "Test" 步骤
- name: Test
  run: |
    if [ -n "${{ steps.impact.outputs.affected_tests }}" ]; then
      echo "Running affected tests only"
      npm test -- ${{ steps.impact.outputs.affected_tests }}
    else
      echo "Running all tests"
      npm test
    fi
```

**注意**：
- PR 检查：使用 `origin/${{ github.base_ref }}...HEAD`
- Push 检查：使用 `HEAD~1`
- 回退机制：影响分析失败时运行全量测试

### 2.5 npm scripts

**文件**：`package.json`

**添加**：
```json
{
  "scripts": {
    "test:impact": "node scripts/impact-analysis.js",
    "test:impact:verbose": "node scripts/impact-analysis.js --verbose"
  }
}
```

---

## 3. 实现顺序

### Phase 1: 核心脚本（优先级：P0）

1. 实现 `scripts/impact-analysis.js`
   - 镜像映射逻辑
   - 跨模块依赖逻辑
   - 全局测试逻辑
   - CLI 入口

2. 创建 `scripts/impact-analysis-config.json`
   - 初始跨模块依赖配置
   - 全局测试列表

3. 验证脚本可运行
   ```bash
   node scripts/impact-analysis.js src/assemble/assembler.ts
   ```

### Phase 2: 测试覆盖（优先级：P0）

4. 编写映射规则测试
   - `tests/scripts/impact-analysis-mirror.test.ts`
   - `tests/scripts/impact-analysis-cross-module.test.ts`
   - `tests/scripts/impact-analysis-global.test.ts`

5. 编写算法测试
   - `tests/scripts/impact-analysis-algorithm.test.ts`

6. 编写配置和错误处理测试
   - `tests/scripts/impact-analysis-config.test.ts`
   - `tests/scripts/impact-analysis-errors.test.ts`

7. 运行测试
   ```bash
   npm test -- tests/scripts/
   ```

### Phase 3: CI 集成（优先级：P1）

8. 修改 `.github/workflows/ci.yml`
   - 添加影响分析步骤
   - 修改测试步骤（使用影响分析结果）

9. 添加 npm scripts
   - `test:impact`
   - `test:impact:verbose`

10. 验证 CI 流程
    - 创建测试 PR
    - 检查 CI 输出
    - 验证测试范围正确

### Phase 4: 文档更新（优先级：P2）

11. 更新 `AGENTS.md`
    - 添加影响分析说明
    - 添加使用示例

12. 更新 `README.md`
    - 添加 CI 优化说明
    - 添加本地使用示例

13. 更新 `CHANGELOG.md`
    - 添加 Issue #94 条目

---

## 4. 验证清单

### 4.1 功能验证

- [ ] 镜像映射：`src/assemble/assembler.ts` → `tests/assemble/assembler*.test.ts`
- [ ] 跨模块依赖：`src/orchestrator/state-machine.ts` → 状态机相关测试
- [ ] 全局测试：任何 src/ 改动 → 8 个全局测试
- [ ] 去重排序：输出无重复，按字母序
- [ ] 过滤不存在：不存在的测试文件被移除

### 4.2 性能验证

- [ ] 单文件分析 < 100ms
- [ ] 10 文件分析 < 500ms
- [ ] CI 时间节省 > 30%（对比全量测试）

### 4.3 兼容性验证

- [ ] Windows 路径兼容（使用 `path.join()`）
- [ ] Linux 路径兼容
- [ ] Node.js 18+ 兼容
- [ ] Git Bash / PowerShell 兼容

### 4.4 不变量验证

- [ ] IA-1 到 IA-19 全部满足
- [ ] 所有测试通过
- [ ] CI 正常运行

---

## 5. 风险与缓解

### 5.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 跨模块依赖遗漏 | 回归未被捕获 | 定期审查配置，添加新依赖 |
| 配置文件格式错误 | 影响分析失败 | CI 检查配置合法性 |
| 测试文件重命名 | 映射失效 | 使用通配符匹配，定期验证 |
| 性能退化 | CI 时间增加 | 监控分析时间，优化算法 |

### 5.2 回退方案

如果影响分析失败或结果不可靠：
1. 禁用影响分析步骤（CI 回退到全量测试）
2. 保留全量测试作为后备
3. 记录失败原因，修复后重新启用

---

## 6. 下一步行动

### 立即可做

1. **实现核心脚本**：`scripts/impact-analysis.js`
   - 预计时间：2-3 小时
   - 依赖：无

2. **创建配置文件**：`scripts/impact-analysis-config.json`
   - 预计时间：30 分钟
   - 依赖：无

3. **编写测试**：`tests/scripts/impact-analysis-*.test.ts`
   - 预计时间：3-4 小时
   - 依赖：核心脚本

### 需要讨论

1. **跨模块依赖初始列表**：
   - 是否需要包含更多依赖？
   - 是否需要排除某些模块？

2. **全局测试列表**：
   - 8 个全局测试是否足够？
   - 是否需要添加更多回归测试？

3. **CI 集成策略**：
   - 是否立即启用影响分析？
   - 是否先并行运行（影响分析 + 全量测试）验证准确性？

---

## 7. 参考资源

- **Spec 文件**：`specs/impact-analysis.md`
- **类似脚本**：`scripts/check-docs.js`, `scripts/check-sdd.js`
- **测试模式**：`tests/orchestrator/spec-invariants.test.ts`
- **CI 配置**：`.github/workflows/ci.yml`

---

**文档版本**：1.0  
**最后更新**：2026-10-15
