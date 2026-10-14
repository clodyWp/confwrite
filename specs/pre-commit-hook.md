# Spec: Pre-commit Hook（husky + lint-staged）

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **Issue**: #93  
> **源码**: `.husky/`, `package.json` (lint-staged 配置)  
> **状态**: 草案

---

## 1. 目的

在 `git commit` 和 `git push` 之前自动执行代码质量检查，防止以下问题进入仓库：

1. **TypeScript 编译错误** — `npm run build` 失败
2. **测试失败** — `npm test` 不通过
3. **文档不一致** — `npm run docs:check` 失败
4. **SDD 违规** — `npm run sdd:check` 失败

**核心原则**：pre-commit hook 是**安全网**，不是**开发阻碍器**。检查必须快速（< 30s），只检查暂存的文件，失败时给出明确修复指引。

---

## 2. 不变量

| ID | 规则 | 违反后果 |
|----|------|---------|
| INV-PC-1 | **`git commit` 必须触发 pre-commit hook** — 通过 husky 管理 | 低级错误进入仓库 |
| INV-PC-2 | **pre-commit hook 只检查暂存的 `.ts` 文件** — 通过 lint-staged 过滤 | 全量检查太慢，阻碍开发 |
| INV-PC-3 | **TypeScript 编译检查必须通过** — `tsc --noEmit` 对暂存文件 | 编译错误进入仓库 |
| INV-PC-4 | **相关测试必须通过** — 暂存文件对应的测试 | 测试失败进入仓库 |
| INV-PC-5 | **hook 失败时必须阻止 commit** — 非零退出码 | 检查形同虚设 |
| INV-PC-6 | **`git commit --no-verify` 必须能跳过 hook** — 紧急场景需要绕过 | 无法紧急提交 |
| INV-PC-7 | **`npm install` 后 husky 自动配置** — 通过 `prepare` script | 新开发者忘记手动设置 |
| INV-PC-8 | **跨平台兼容** — Windows (PowerShell) 和 Linux (bash) 均可运行 | Windows 开发者无法使用 |
| INV-PC-9 | **pre-push hook 执行完整 build + test** — 推送前最终验证 | CI 才发现构建失败 |
| INV-PC-10 | **hook 脚本不得硬编码 shell** — 使用 Node.js 脚本或跨平台命令 | Windows 下 bash 脚本失败 |

---

## 3. 架构

### 3.1 工具链

| 工具 | 版本 | 职责 |
|------|------|------|
| husky | ^9.0.0 | 管理 git hooks 生命周期 |
| lint-staged | ^15.0.0 | 对暂存文件运行检查 |
| TypeScript (`tsc`) | 已有 (^5.4.0) | 类型检查（`--noEmit` 模式） |

**不引入 ESLint/Prettier**：当前项目依赖 TypeScript strict mode 作为代码质量保障，不增加额外格式化规则。后续如需引入，可独立扩展本 spec。

### 3.2 文件结构

```
confwrite/
├── .husky/
│   ├── pre-commit          # husky pre-commit hook 入口
│   └── pre-push            # husky pre-push hook 入口
├── scripts/
│   ├── pre-commit-check.js # pre-commit 检查逻辑（Node.js，跨平台）
│   └── pre-push-check.js   # pre-push 检查逻辑（Node.js，跨平台）
├── package.json            # lint-staged 配置 + prepare script
└── ...
```

### 3.3 Hook 触发流程

#### pre-commit（快速检查，< 30s）

```
git commit
  │
  ▼
husky pre-commit hook
  │
  ▼
npx lint-staged
  │
  ├── *.ts 文件 → tsc --noEmit（全项目编译检查）
  │
  └── 如果有对应的 *.test.ts → vitest run <相关测试>
  │
  ▼
通过 → commit 继续
失败 → commit 阻止，输出修复指引
```

#### pre-push（完整验证，< 120s）

```
git push
  │
  ▼
husky pre-push hook
  │
  ▼
scripts/pre-push-check.js
  │
  ├── npm run build          # TypeScript 编译
  ├── npm test               # 全量测试
  └── npm run docs:check     # 文档一致性
  │
  ▼
通过 → push 继续
失败 → push 阻止，输出修复指引
```

---

## 4. 详细行为规格

### 4.1 husky 配置

#### INV-PC-7: 自动安装

`package.json` 必须包含 `prepare` script：

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

- `npm install` 后自动执行 `husky`，配置 `.husky/` 目录
- CI 环境中（`CI=true`）跳过 prepare，避免不必要的 hook 安装
- 已安装 husky 的项目重复 install 不会出错

#### Hook 文件

`.husky/pre-commit`:
```sh
npx lint-staged
```

`.husky/pre-push`:
```sh
node scripts/pre-push-check.js
```

### 4.2 lint-staged 配置

#### INV-PC-2: 只检查暂存文件

`package.json` 中的 `lint-staged` 配置：

```json
{
  "lint-staged": {
    "*.ts": [
      "node scripts/pre-commit-check.js"
    ]
  }
}
```

**设计决策**：

- 使用自定义脚本 `pre-commit-check.js` 而非直接调用 `tsc`，因为：
  - 需要跨平台兼容（Windows PowerShell 不支持 `&&` 链接）
  - 需要收集暂存文件列表并做智能检查
  - 需要输出友好的错误信息

### 4.3 pre-commit 检查脚本

**文件**: `scripts/pre-commit-check.js`  
**触发**: lint-staged 对每批暂存的 `.ts` 文件调用  
**输入**: lint-staged 传入暂存文件路径作为参数  
**退出码**: 0 = 通过, 非 0 = 失败

#### INV-PC-3: TypeScript 编译检查

```
行为：
1. 运行 `tsc --noEmit`（全项目编译检查）
2. 如果编译失败，输出错误信息并退出码 1
3. 如果编译成功，继续下一步

理由：
- `tsc --noEmit` 不生成文件，只做类型检查
- 全项目检查（而非单文件）确保跨文件类型一致性
- 预计耗时 < 10s（项目规模）
```

#### INV-PC-4: 相关测试检查

```
行为：
1. 根据暂存文件路径推断对应测试文件：
   - src/foo/bar.ts → tests/foo/bar.test.ts
2. 如果对应测试文件存在，运行 `vitest run <测试文件>`
3. 如果测试文件不存在，跳过（不报错）
4. 如果测试失败，输出错误信息并退出码 1

理由：
- 只运行相关测试，避免全量测试的等待时间
- 测试文件不存在时不报错（新文件可能还没有测试）
- 预计耗时 < 20s（单个测试文件）
```

#### INV-PC-5: 失败阻止

```
行为：
1. 任何检查失败时，脚本以非零退出码退出
2. lint-staged 收到非零退出码后阻止 commit
3. 输出格式化的错误信息，包含：
   - 哪个检查失败
   - 错误详情
   - 修复建议

输出示例：
  ❌ Pre-commit check failed
  
  TypeScript compilation errors:
    src/orchestrator/state-machine.ts(42,5): error TS2322: ...
  
  Fix: resolve the type errors and try again.
```

### 4.4 pre-push 检查脚本

**文件**: `scripts/pre-push-check.js`  
**触发**: husky pre-push hook  
**退出码**: 0 = 通过, 非 0 = 失败

#### INV-PC-9: 完整验证

```
行为：
1. 运行 `npm run build`（完整 TypeScript 编译）
2. 如果 build 失败，输出错误并退出码 1
3. 运行 `npm test`（全量测试）
4. 如果 test 失败，输出错误并退出码 1
5. 运行 `npm run docs:check`（文档一致性）
6. 如果 docs:check 失败，输出警告并退出码 0（不阻止 push）

设计决策：
- build 和 test 失败 → 阻止 push（硬错误）
- docs:check 失败 → 警告但不阻止（软错误）
  理由：文档不一致不应阻止代码推送，CI 会再次检查
- 预计总耗时 < 120s
```

### 4.5 跨平台兼容

#### INV-PC-8, INV-PC-10: 跨平台

```
约束：
1. 所有 hook 脚本使用 Node.js 编写（.js 文件）
2. 不使用 bash-only 语法（如 `set -e`, `[[ ]]`）
3. 子进程调用使用 `child_process.execSync` 或 `spawnSync`
4. 路径拼接使用 `path.join()`
5. shell 命令通过 `shell: true` 选项跨平台执行

husky hook 文件：
- `.husky/pre-commit` 和 `.husky/pre-push` 使用 sh 语法
- husky 自身处理跨平台（Windows 下通过 Git Bash 执行 sh）
- hook 文件内容只调用 Node.js 脚本，不包含复杂 shell 逻辑
```

---

## 5. package.json 变更

### 5.1 新增 devDependencies

```json
{
  "devDependencies": {
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0"
  }
}
```

### 5.2 新增 scripts

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

### 5.3 新增 lint-staged 配置

```json
{
  "lint-staged": {
    "*.ts": [
      "node scripts/pre-commit-check.js"
    ]
  }
}
```

---

## 6. 验收标准

### 6.1 功能验收

| # | 场景 | 预期结果 |
|---|------|---------|
| AC-1 | `npm install` 后 `.husky/` 目录存在 | prepare script 自动配置 husky |
| AC-2 | 暂存一个有 TypeScript 错误的 `.ts` 文件并 commit | commit 被阻止，输出编译错误 |
| AC-3 | 暂存一个通过编译的 `.ts` 文件并 commit | commit 成功 |
| AC-4 | 暂存一个导致测试失败的 `.ts` 文件并 commit | commit 被阻止，输出测试失败信息 |
| AC-5 | `git commit --no-verify` 暂存有错误的文件 | commit 成功（跳过 hook） |
| AC-6 | `git push` 时 build 失败 | push 被阻止 |
| AC-7 | `git push` 时 build 和 test 通过 | push 成功 |
| AC-8 | Windows PowerShell 环境下 commit | hook 正常运行 |
| AC-9 | Linux bash 环境下 commit | hook 正常运行 |
| AC-10 | 暂存非 `.ts` 文件（如 `.md`）并 commit | hook 不触发检查，commit 成功 |

### 6.2 性能验收

| # | 指标 | 目标 |
|---|------|------|
| PERF-1 | pre-commit 检查耗时（正常代码） | < 15s |
| PERF-2 | pre-commit 检查耗时（有错误） | < 15s |
| PERF-3 | pre-push 检查耗时 | < 120s |

---

## 7. 测试设计

### 7.1 测试策略

pre-commit hook 的测试分三层：

1. **单元测试** — 测试 `pre-commit-check.js` 和 `pre-push-check.js` 脚本逻辑
2. **集成测试** — 在临时 git 仓库中验证 hook 触发行为
3. **手动验收** — 按 AC-1 ~ AC-10 逐项验证

### 7.2 单元测试

**文件**: `tests/scripts/pre-commit-check.test.ts`

| 测试用例 | 描述 |
|---------|------|
| `tsc --noEmit 通过时退出码为 0` | 正常 TypeScript 文件，编译通过 |
| `tsc --noEmit 失败时退出码为 1` | 有类型错误的文件，编译失败 |
| `对应测试文件存在时运行测试` | `src/foo.ts` 暂存 → 运行 `tests/foo.test.ts` |
| `对应测试文件不存在时跳过` | `src/new.ts` 暂存 → 无对应测试 → 跳过 |
| `测试失败时退出码为 1` | 测试断言失败 → 阻止 commit |
| `非 .ts 文件不触发检查` | lint-staged 过滤非 `.ts` 文件 |

**文件**: `tests/scripts/pre-push-check.test.ts`

| 测试用例 | 描述 |
|---------|------|
| `build 失败时退出码为 1` | TypeScript 编译错误 → 阻止 push |
| `test 失败时退出码为 1` | 测试失败 → 阻止 push |
| `docs:check 失败时退出码为 0` | 文档不一致 → 警告但不阻止 |
| `全部通过时退出码为 0` | build + test + docs:check 全部通过 |

### 7.3 集成测试

**文件**: `tests/scripts/hook-integration.test.ts`

使用临时 git 仓库验证完整流程：

```typescript
describe('Pre-commit hook integration', () => {
  // 每个测试创建临时 git 仓库
  // 安装 husky + lint-staged
  // 验证 hook 行为

  it('INV-PC-1: commit 触发 pre-commit hook', async () => {
    // 1. 创建临时仓库
    // 2. 初始化 husky + lint-staged
    // 3. 暂存一个有效 .ts 文件
    // 4. git commit
    // 5. 验证 hook 被执行（通过输出或日志）
  });

  it('INV-PC-5: hook 失败时阻止 commit', async () => {
    // 1. 创建临时仓库
    // 2. 暂存一个有类型错误的 .ts 文件
    // 3. git commit
    // 4. 验证 commit 失败
    // 5. 验证错误输出包含 TypeScript 错误信息
  });

  it('INV-PC-6: --no-verify 跳过 hook', async () => {
    // 1. 创建临时仓库
    // 2. 暂存一个有错误的 .ts 文件
    // 3. git commit --no-verify
    // 4. 验证 commit 成功
  });
});
```

### 7.4 测试场景矩阵

| 场景 | 暂存文件 | 编译 | 测试 | 预期 commit | 预期 push |
|------|---------|------|------|------------|----------|
| 正常代码 | `src/foo.ts` | ✅ | ✅ | ✅ 成功 | ✅ 成功 |
| 编译错误 | `src/bad.ts` | ❌ | - | ❌ 阻止 | ❌ 阻止 |
| 测试失败 | `src/buggy.ts` | ✅ | ❌ | ❌ 阻止 | ❌ 阻止 |
| 新文件无测试 | `src/new.ts` | ✅ | 跳过 | ✅ 成功 | ✅ 成功 |
| 仅文档改动 | `README.md` | 跳过 | 跳过 | ✅ 成功 | ✅ 成功 |
| 混合文件 | `src/a.ts` + `README.md` | ✅ | ✅ | ✅ 成功 | ✅ 成功 |

---

## 8. 实现要点

### 8.1 husky 安装

```bash
npm install -D husky lint-staged
npx husky init        # 创建 .husky/ 目录
```

### 8.2 prepare script 的 CI 兼容

```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

husky v9 自动检测 CI 环境，CI 中 `prepare` 不会安装 hooks。无需手动判断。

### 8.3 pre-commit-check.js 核心逻辑

```javascript
#!/usr/bin/env node
// scripts/pre-commit-check.js
// 由 lint-staged 调用，参数为暂存文件路径列表

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const stagedFiles = process.argv.slice(2);

// Step 1: TypeScript 编译检查
try {
  execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error('\n❌ Pre-commit: TypeScript compilation failed');
  process.exit(1);
}

// Step 2: 相关测试检查
for (const file of stagedFiles) {
  // src/foo/bar.ts → tests/foo/bar.test.ts
  if (!file.startsWith('src/') || !file.endsWith('.ts')) continue;
  
  const relativePath = relative(join(ROOT, 'src'), file);
  const testPath = join(ROOT, 'tests', 
    dirname(relativePath), 
    basename(relativePath, '.ts') + '.test.ts');
  
  if (existsSync(testPath)) {
    try {
      execSync(`npx vitest run "${testPath}"`, { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.error(`\n❌ Pre-commit: Tests failed for ${file}`);
      process.exit(1);
    }
  }
}

console.log('✅ Pre-commit checks passed');
```

### 8.4 pre-push-check.js 核心逻辑

```javascript
#!/usr/bin/env node
// scripts/pre-push-check.js

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const steps = [
  { name: 'Build', cmd: 'npm run build', blocking: true },
  { name: 'Test', cmd: 'npm test', blocking: true },
  { name: 'Docs check', cmd: 'npm run docs:check', blocking: false },
];

let failed = false;

for (const step of steps) {
  console.log(`\n🔍 Running ${step.name}...`);
  try {
    execSync(step.cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`✅ ${step.name} passed`);
  } catch {
    if (step.blocking) {
      console.error(`\n❌ Pre-push: ${step.name} failed — push blocked`);
      failed = true;
      break;  // 第一个 blocking 失败就停止
    } else {
      console.warn(`\n⚠️  Pre-push: ${step.name} failed — warning only`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('\n✅ Pre-push checks passed');
```

### 8.5 .gitignore 更新

无需更新 `.gitignore`。`.husky/` 目录应被 git 跟踪（hooks 是项目配置的一部分）。

### 8.6 CI 兼容

CI 环境中不需要 pre-commit hook（CI 已经执行完整检查）。husky v9 的 `prepare` script 在 CI 环境（`CI=true`）下自动跳过 hook 安装。

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `tsc --noEmit` 全项目检查慢 | 开发体验差 | 项目规模小（< 100 文件），预计 < 10s；后续可优化为增量检查 |
| lint-staged 多次调用脚本 | 每批文件调用一次 `pre-commit-check.js`，重复编译 | lint-staged 默认将所有 `.ts` 文件一次性传给脚本 |
| Windows 下 husky sh 脚本不执行 | hook 不触发 | husky v9 内置 Windows 支持；Git Bash 执行 sh |
| `prepare` 在 CI 中安装 hooks | 浪费 CI 时间 | husky v9 自动检测 CI 环境并跳过 |
| 开发者机器缺少 Node.js 18+ | hook 脚本执行失败 | `engines.node >= 18` 已在 package.json 声明 |

---

## 10. 后续扩展（不在本 Issue 范围）

以下功能不在 Issue #93 范围内，但本 spec 的设计预留了扩展点：

1. **ESLint 集成** — 在 lint-staged 中添加 `eslint --fix` 步骤
2. **Prettier 格式化** — 在 lint-staged 中添加 `prettier --write` 步骤
3. **增量编译检查** — 使用 `tsc --incremental` 或自定义文件依赖分析
4. **并行检查** — pre-commit 中并行运行编译和测试
5. **缓存** — 对 `tsc --noEmit` 结果做文件哈希缓存
