# Spec: 变更影响分析 (Impact Analysis)

> **版本**: 1.0  
> **日期**: 2026-10-15  
> **Issue**: #94  
> **源码**: `scripts/impact-analysis.js`（待实现）  
> **状态**: 草案

---

## 1. 职责

变更影响分析系统自动识别代码变更影响的测试模块，加速 CI 反馈循环。

**核心目标**：
- **快速反馈**：只运行受影响的测试，缩短 CI 时间
- **完整性保证**：不遗漏关键测试，避免回归
- **可维护性**：映射规则清晰，易于扩展

**适用场景**：
- PR 检查：只运行受 PR 影响的测试
- 本地开发：快速验证改动是否破坏相关功能
- 回归分析：识别代码变更的潜在影响范围

---

## 2. 映射规则

### 2.1 目录镜像映射

**规则**：`src/<module>/` → `tests/<module>/`

| 源码目录 | 测试目录 | 映射类型 |
|---------|---------|---------|
| `src/assemble/` | `tests/assemble/` | 1:1 镜像 |
| `src/commands/` | `tests/commands/` | 1:1 镜像 |
| `src/config/` | `tests/config/` | 1:1 镜像 |
| `src/diagrams/` | `tests/diagrams/` | 1:1 镜像 |
| `src/dispatcher/` | `tests/dispatcher/` | 1:1 镜像 |
| `src/knowledge/` | `tests/knowledge/` | 1:1 镜像 |
| `src/logging/` | `tests/logging/` | 1:1 镜像 |
| `src/orchestrator/` | `tests/orchestrator/` | 1:1 镜像 |
| `src/organize/` | `tests/organize/` | 1:1 镜像 |
| `src/outline/` | `tests/outline/` | 1:1 镜像 |
| `src/scheduler/` | `tests/scheduler/` | 1:1 镜像 |
| `src/state/` | `tests/state/` | 1:1 镜像 |
| `src/utils/` | `tests/utils/` | 1:1 镜像 |
| `src/writing/` | `tests/writing/` | 1:1 镜像 |

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-1 | **镜像映射必须覆盖所有 src/ 子目录** | 遗漏模块的测试无法被自动识别 |
| IA-2 | **镜像映射优先级最高** — 同目录下的测试优先运行 | 跨模块依赖未正确处理时，至少保证本模块测试通过 |

### 2.2 文件名映射

**规则**：`src/<module>/<file>.ts` → `tests/<module>/<file>.test.ts`

示例：
- `src/assemble/assembler.ts` → `tests/assemble/assembler.test.ts`
- `src/diagrams/pipeline.ts` → `tests/diagrams/pipeline.test.ts`
- `src/writing/orchestrator.ts` → `tests/writing/orchestrator.test.ts`

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-3 | **文件名映射必须精确匹配**（不含扩展名） | 测试文件无法被自动关联 |
| IA-4 | **一个源文件可对应多个测试文件** — 支持 `<file>-<aspect>.test.ts` 模式 | 遗漏特定方面的测试（如 `assembler-structure.test.ts`） |

**多测试文件示例**：
```
src/assemble/assembler.ts
  → tests/assemble/assembler.test.ts
  → tests/assemble/assembler-structure.test.ts
  → tests/assemble/assembler-title.test.ts
```

### 2.3 跨模块依赖映射

**规则**：某些模块存在跨模块依赖，需要显式声明。

**配置文件**：`scripts/impact-analysis-config.json`

```json
{
  "crossModuleDependencies": {
    "src/orchestrator/": [
      "tests/orchestrator/",
      "tests/writing/orchestrator.test.ts",
      "tests/e2e/state-machine-flow.test.ts"
    ],
    "src/writing/orchestrator.ts": [
      "tests/writing/orchestrator.test.ts",
      "tests/writing/orchestrator-failure.test.ts",
      "tests/e2e/phase4-convergence.test.ts"
    ],
    "src/state/store.ts": [
      "tests/state/store.test.ts",
      "tests/orchestrator/state-machine.test.ts",
      "tests/e2e/state-machine-flow.test.ts"
    ]
  }
}
```

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-5 | **跨模块依赖必须显式声明** — 不允许隐式依赖 | 遗漏关键测试，导致回归未被捕获 |
| IA-6 | **跨模块依赖配置必须可验证** — CI 检查配置完整性 | 配置漂移，映射规则失效 |

### 2.4 全局测试映射

**规则**：某些测试覆盖多个模块，任何 src/ 改动都应运行。

**全局测试文件**：
- `tests/e2e-full-flow.test.ts`
- `tests/reproducible-bugs.test.ts`
- `tests/reproducible-bugs-*.test.ts`
- `tests/regression-wave1-4.test.ts`
- `tests/types-consistency.test.ts`
- `tests/real-data-validation.test.ts`

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-7 | **全局测试在任何 src/ 改动时都必须运行** | 跨模块回归未被捕获 |
| IA-8 | **全局测试列表必须可配置** — 不允许硬编码 | 新增全局测试时遗漏配置 |

---

## 3. 影响分析算法

### 3.1 输入

- `changedFiles: string[]` — 变更文件列表（相对于项目根目录）

### 3.2 输出

- `affectedTests: string[]` — 受影响的测试文件列表（去重、排序）

### 3.3 算法流程

```
function analyzeImpact(changedFiles):
  affectedTests = Set()
  
  for file in changedFiles:
    // 1. 检查是否是源码文件
    if file.startsWith('src/') && file.endsWith('.ts'):
      // 2. 提取模块名和文件名
      module = extractModule(file)  // e.g., 'assemble'
      baseName = extractBaseName(file)  // e.g., 'assembler'
      
      // 3. 镜像映射：查找同目录下的测试
      mirrorTests = findMirrorTests(module, baseName)
      affectedTests.addAll(mirrorTests)
      
      // 4. 跨模块依赖：查找显式声明的依赖
      crossModuleTests = findCrossModuleTests(file)
      affectedTests.addAll(crossModuleTests)
    
    // 5. 配置文件改动：运行相关测试
    else if file.startsWith('src/config/'):
      affectedTests.addAll(findTestsInModule('config'))
    
    // 6. Spec 文件改动：运行 spec 不变量测试
    else if file.startsWith('specs/'):
      affectedTests.add('tests/orchestrator/spec-invariants.test.ts')
  
  // 7. 添加全局测试
  if changedFiles.some(f => f.startsWith('src/')):
    affectedTests.addAll(globalTests)
  
  // 8. 去重、排序、验证存在性
  return filterExisting(Array.from(affectedTests).sort())
```

### 3.4 辅助函数

```typescript
function extractModule(filePath: string): string {
  // src/assemble/assembler.ts → 'assemble'
  const parts = filePath.split('/');
  return parts[1];  // src 后的第一级目录
}

function extractBaseName(filePath: string): string {
  // src/assemble/assembler.ts → 'assembler'
  const fileName = path.basename(filePath, '.ts');
  return fileName;
}

function findMirrorTests(module: string, baseName: string): string[] {
  // 查找 tests/<module>/<baseName>*.test.ts
  const pattern = `tests/${module}/${baseName}*.test.ts`;
  return glob.sync(pattern);
}

function findCrossModuleTests(filePath: string): string[] {
  // 从配置文件读取跨模块依赖
  const config = loadConfig();
  return config.crossModuleDependencies[filePath] || [];
}

function filterExisting(tests: string[]): string[] {
  // 过滤不存在的测试文件
  return tests.filter(f => fs.existsSync(f));
}
```

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-9 | **算法必须是确定性的** — 相同输入产生相同输出 | CI 结果不可重现 |
| IA-10 | **算法必须是幂等的** — 多次运行结果一致 | 重复运行产生不同测试集 |
| IA-11 | **算法必须过滤不存在的测试文件** | 运行不存在的测试导致 CI 失败 |
| IA-12 | **输出必须去重并排序** | 重复运行测试或结果不可比 |

---

## 4. CI 集成

### 4.1 GitHub Action 集成

**工作流修改**：`.github/workflows/ci.yml`

```yaml
- name: Analyze impact
  id: impact
  run: |
    CHANGED_FILES=$(git diff --name-only origin/${{ github.base_ref }}...HEAD | tr '\n' ' ')
    AFFECTED_TESTS=$(node scripts/impact-analysis.js $CHANGED_FILES)
    echo "affected_tests=$AFFECTED_TESTS" >> $GITHUB_OUTPUT

- name: Run affected tests
  if: steps.impact.outputs.affected_tests != ''
  run: |
    npm test -- ${{ steps.impact.outputs.affected_tests }}
```

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-13 | **CI 必须使用影响分析结果** — 不允许硬编码测试列表 | 影响分析失效，CI 时间未优化 |
| IA-14 | **影响分析失败时必须回退到全量测试** — 不允许跳过测试 | 遗漏关键测试，回归未被捕获 |

### 4.2 本地开发集成

**npm script**：

```json
{
  "scripts": {
    "test:impact": "node scripts/impact-analysis.js",
    "test:impact:verbose": "node scripts/impact-analysis.js --verbose"
  }
}
```

**用法**：

```bash
# 分析最近一次 commit 的影响
npm run test:impact

# 分析指定文件的影响
npm run test:impact -- src/assemble/assembler.ts

# 分析并运行受影响的测试
npm run test:impact -- --run
```

---

## 5. 配置文件

### 5.1 映射配置

**文件**：`scripts/impact-analysis-config.json`

```json
{
  "version": "1.0",
  "mirrorMapping": {
    "enabled": true,
    "excludeModules": []
  },
  "crossModuleDependencies": {
    "src/orchestrator/": [
      "tests/orchestrator/",
      "tests/writing/orchestrator.test.ts",
      "tests/e2e/state-machine-flow.test.ts"
    ],
    "src/state/store.ts": [
      "tests/state/store.test.ts",
      "tests/orchestrator/state-machine.test.ts"
    ]
  },
  "globalTests": [
    "tests/e2e-full-flow.test.ts",
    "tests/reproducible-bugs.test.ts",
    "tests/reproducible-bugs-concurrency.test.ts",
    "tests/reproducible-bugs-extended.test.ts",
    "tests/reproducible-bugs-validation.test.ts",
    "tests/regression-wave1-4.test.ts",
    "tests/types-consistency.test.ts",
    "tests/real-data-validation.test.ts"
  ],
  "excludePatterns": [
    "tests/fixtures/**",
    "tests/tmp/**"
  ]
}
```

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-15 | **配置文件必须是合法的 JSON** | 解析失败，影响分析无法运行 |
| IA-16 | **配置文件必须版本化** — 包含 `version` 字段 | 配置格式变更时无法迁移 |
| IA-17 | **配置文件必须可验证** — 提供 schema 验证 | 配置错误导致映射失效 |

---

## 6. 错误处理

| 场景 | 预期行为 |
|------|---------|
| 配置文件不存在 | 使用默认配置（仅镜像映射），输出警告 |
| 配置文件格式错误 | 抛出错误，终止影响分析 |
| 变更文件列表为空 | 返回空测试列表，不运行任何测试 |
| 测试文件不存在 | 过滤掉不存在的文件，输出警告 |
| 跨模块依赖指向不存在的测试 | 过滤掉不存在的文件，输出警告 |

**不变量**：

| ID | 规则 | 违反后果 |
|----|------|---------|
| IA-18 | **影响分析失败不得静默** — 必须输出错误信息 | 错误被忽略，测试未被运行 |
| IA-19 | **影响分析必须输出诊断信息** — 支持 `--verbose` 模式 | 调试困难，无法定位映射问题 |

---

## 7. 测试覆盖要求

### 7.1 映射规则测试

| 场景 | 测试文件 | 覆盖的不变量 |
|------|---------|-------------|
| 镜像映射：单文件 | `tests/scripts/impact-analysis-mirror.test.ts` | IA-1, IA-2, IA-3 |
| 镜像映射：多测试文件 | `tests/scripts/impact-analysis-mirror.test.ts` | IA-4 |
| 跨模块依赖 | `tests/scripts/impact-analysis-cross-module.test.ts` | IA-5, IA-6 |
| 全局测试 | `tests/scripts/impact-analysis-global.test.ts` | IA-7, IA-8 |

### 7.2 影响分析算法测试

| 场景 | 测试文件 | 覆盖的不变量 |
|------|---------|-------------|
| 确定性 | `tests/scripts/impact-analysis-algorithm.test.ts` | IA-9 |
| 幂等性 | `tests/scripts/impact-analysis-algorithm.test.ts` | IA-10 |
| 过滤不存在的文件 | `tests/scripts/impact-analysis-algorithm.test.ts` | IA-11 |
| 去重和排序 | `tests/scripts/impact-analysis-algorithm.test.ts` | IA-12 |

### 7.3 CI 集成测试

| 场景 | 测试文件 | 覆盖的不变量 |
|------|---------|-------------|
| CI 使用影响分析结果 | `tests/scripts/impact-analysis-ci.test.ts` | IA-13 |
| 失败时回退到全量测试 | `tests/scripts/impact-analysis-ci.test.ts` | IA-14 |

### 7.4 配置文件测试

| 场景 | 测试文件 | 覆盖的不变量 |
|------|---------|-------------|
| 配置文件合法性 | `tests/scripts/impact-analysis-config.test.ts` | IA-15, IA-16 |
| 配置验证 | `tests/scripts/impact-analysis-config.test.ts` | IA-17 |

### 7.5 错误处理测试

| 场景 | 测试文件 | 覆盖的不变量 |
|------|---------|-------------|
| 配置文件不存在 | `tests/scripts/impact-analysis-errors.test.ts` | IA-18 |
| 配置文件格式错误 | `tests/scripts/impact-analysis-errors.test.ts` | IA-18 |
| 变更文件列表为空 | `tests/scripts/impact-analysis-errors.test.ts` | IA-18 |
| 诊断信息输出 | `tests/scripts/impact-analysis-errors.test.ts` | IA-19 |

---

## 8. 实现要点

### 8.1 脚本结构

**文件**：`scripts/impact-analysis.js`

```javascript
#!/usr/bin/env node
/**
 * 变更影响分析脚本
 * 
 * 用法：
 *   node scripts/impact-analysis.js [file1] [file2] ...
 *   node scripts/impact-analysis.js --verbose [file1] [file2] ...
 * 
 * 输入：变更文件列表（相对于项目根目录）
 * 输出：受影响的测试文件列表（空格分隔）
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// 加载配置
function loadConfig() {
  const configPath = join(ROOT, 'scripts/impact-analysis-config.json');
  if (!existsSync(configPath)) {
    console.warn('⚠️  配置文件不存在，使用默认配置');
    return getDefaultConfig();
  }
  
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error(`❌ 配置文件格式错误: ${err.message}`);
    process.exit(1);
  }
}

function getDefaultConfig() {
  return {
    version: '1.0',
    mirrorMapping: { enabled: true, excludeModules: [] },
    crossModuleDependencies: {},
    globalTests: [],
    excludePatterns: []
  };
}

// 提取模块名
function extractModule(filePath) {
  const parts = filePath.split('/');
  return parts[1];  // src 后的第一级目录
}

// 提取基础文件名
function extractBaseName(filePath) {
  return basename(filePath, '.ts');
}

// 查找镜像测试
function findMirrorTests(module, baseName) {
  const pattern = `tests/${module}/${baseName}*.test.ts`;
  return glob.sync(pattern, { cwd: ROOT });
}

// 查找跨模块依赖
function findCrossModuleTests(filePath, config) {
  const deps = config.crossModuleDependencies[filePath] || [];
  // 展开目录为具体文件
  const expanded = [];
  for (const dep of deps) {
    if (dep.endsWith('/')) {
      expanded.push(...glob.sync(`${dep}*.test.ts`, { cwd: ROOT }));
    } else {
      expanded.push(dep);
    }
  }
  return expanded;
}

// 主函数
function analyzeImpact(changedFiles, config, verbose = false) {
  const affectedTests = new Set();
  
  for (const file of changedFiles) {
    if (verbose) console.log(`\n分析: ${file}`);
    
    // 源码文件
    if (file.startsWith('src/') && file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const module = extractModule(file);
      const baseName = extractBaseName(file);
      
      // 镜像映射
      if (config.mirrorMapping.enabled && !config.mirrorMapping.excludeModules.includes(module)) {
        const mirrorTests = findMirrorTests(module, baseName);
        if (verbose) console.log(`  镜像测试: ${mirrorTests.length} 个`);
        mirrorTests.forEach(t => affectedTests.add(t));
      }
      
      // 跨模块依赖
      const crossTests = findCrossModuleTests(file, config);
      if (verbose) console.log(`  跨模块测试: ${crossTests.length} 个`);
      crossTests.forEach(t => affectedTests.add(t));
    }
    
    // Spec 文件
    else if (file.startsWith('specs/')) {
      affectedTests.add('tests/orchestrator/spec-invariants.test.ts');
      if (verbose) console.log(`  Spec 测试: 1 个`);
    }
  }
  
  // 添加全局测试
  if (changedFiles.some(f => f.startsWith('src/'))) {
    config.globalTests.forEach(t => affectedTests.add(t));
    if (verbose) console.log(`\n全局测试: ${config.globalTests.length} 个`);
  }
  
  // 过滤不存在的文件
  const existingTests = Array.from(affectedTests)
    .filter(t => existsSync(join(ROOT, t)))
    .sort();
  
  if (verbose) {
    console.log(`\n总计: ${existingTests.length} 个测试文件`);
  }
  
  return existingTests;
}

// CLI 入口
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const files = args.filter(a => !a.startsWith('--'));

if (files.length === 0) {
  console.error('用法: node scripts/impact-analysis.js [file1] [file2] ...');
  process.exit(1);
}

const config = loadConfig();
const affectedTests = analyzeImpact(files, config, verbose);

// 输出结果（空格分隔，便于 CI 使用）
console.log(affectedTests.join(' '));
```

### 8.2 配置文件示例

**文件**：`scripts/impact-analysis-config.json`

```json
{
  "version": "1.0",
  "mirrorMapping": {
    "enabled": true,
    "excludeModules": []
  },
  "crossModuleDependencies": {
    "src/orchestrator/state-machine.ts": [
      "tests/orchestrator/state-machine.test.ts",
      "tests/orchestrator/spec-invariants.test.ts",
      "tests/e2e/state-machine-flow.test.ts"
    ],
    "src/writing/orchestrator.ts": [
      "tests/writing/orchestrator.test.ts",
      "tests/writing/orchestrator-failure.test.ts",
      "tests/e2e/phase4-convergence.test.ts"
    ],
    "src/state/store.ts": [
      "tests/state/store.test.ts",
      "tests/orchestrator/state-machine.test.ts"
    ],
    "src/dispatcher/index.ts": [
      "tests/dispatcher/dispatch.test.ts",
      "tests/writing/orchestrator.test.ts"
    ]
  },
  "globalTests": [
    "tests/e2e-full-flow.test.ts",
    "tests/reproducible-bugs.test.ts",
    "tests/reproducible-bugs-concurrency.test.ts",
    "tests/reproducible-bugs-extended.test.ts",
    "tests/reproducible-bugs-validation.test.ts",
    "tests/regression-wave1-4.test.ts",
    "tests/types-consistency.test.ts",
    "tests/real-data-validation.test.ts"
  ],
  "excludePatterns": [
    "tests/fixtures/**",
    "tests/tmp/**"
  ]
}
```

---

## 9. 变更历史

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-10-15 | 初始版本 | Issue #94: 变更影响分析（测试和模块关联标注） |
