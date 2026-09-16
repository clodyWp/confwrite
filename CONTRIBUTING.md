# Contributing to ConfWrite

感谢你对 ConfWrite 项目的关注！本文档提供了开发指南，帮助你快速上手。

---

## 开发环境

### 前置条件

- **Node.js** >= 18
- **npm** >= 8
- **Git**
- **pi coding agent** (已安装)

### 安装

```bash
git clone <repo-url>
cd confidenceWriter
npm install
```

### 验证

```bash
npm test          # 应该看到 247 tests passing
npx tsc --noEmit  # 应该无输出（零错误）
```

---

## 开发流程

### TDD（测试驱动开发）

本项目**严格遵循 TDD 流程**，所有新功能必须先写测试：

```
1. 写测试（tests/xxx.test.ts）
   ↓
2. 运行测试 → 确认失败（红色）
   ↓
3. 实现功能（src/xxx.ts）
   ↓
4. 运行测试 → 确认通过（绿色）
   ↓
5. 重构（如有需要）
   ↓
6. 提交
```

### 开发步骤

```bash
# 1. 创建功能分支
git checkout -b feat/my-feature

# 2. 写测试
vim tests/my-module/my-module.test.ts

# 3. 运行测试（应该失败）
npm test

# 4. 实现功能
vim src/my-module/my-module.ts

# 5. 运行测试（应该通过）
npm test

# 6. 类型检查
npx tsc --noEmit

# 7. 提交
git add .
git commit -m "feat: add my-module"
```

---

## 代码风格

### TypeScript

- **严格模式**：`tsconfig.json` 已启用 `strict: true`
- **ESM**：使用 `import/export`，不使用 `require()`
- **类型注解**：所有函数参数和返回值必须有类型注解
- **避免 any**：尽量使用具体类型或 `unknown`

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `task-executor.ts` |
| 类名 | PascalCase | `TaskExecutor` |
| 接口名 | PascalCase（不加 `I` 前缀） | `ReviewDecision` |
| 函数名 | camelCase | `generateWriterPrompt` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_SCHEDULER_CONFIG` |
| 类型别名 | PascalCase | `ChapterStatus` |
| 枚举值 | PascalCase | `ChapterStatusEnum` |
| 测试文件 | `<module>.test.ts` | `task-executor.test.ts` |

### Import 顺序

```typescript
// 1. Node.js 内置模块
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 2. 第三方库
import { Type, type Static } from '@sinclair/typebox';

// 3. 项目内部模块（使用 .js 扩展名）
import type { Task } from '../scheduler/types.js';
import { TokenBucket } from '../scheduler/token-bucket.js';
```

> **注意**：import 路径必须使用 `.js` 扩展名（ESM 要求），即使源文件是 `.ts`。

### 文件结构

```typescript
// 1. Import 语句
import { ... } from '...';

// 2. 类型/接口定义
export interface MyInterface { ... }
export type MyType = ...;

// 3. 常量
export const MY_CONSTANT = ...;

// 4. 类/函数实现
export class MyClass { ... }
export function myFunction() { ... }

// 5. 辅助函数（私有）
function helperFunction() { ... }
```

---

## 测试约定

### 测试框架

使用 **Vitest**，配置在 `vitest.config.ts`。

### 测试文件位置

```
tests/
├── state/store.test.ts              ← 镜像 src/ 结构
├── scheduler/token-bucket.test.ts
├── organize/scanner.test.ts
├── writing/task-executor.test.ts
└── ...
```

### 测试命名

```typescript
import { describe, it, expect } from 'vitest';

describe('ClassName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = ...;
      
      // Assert
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      // ...
    });
  });
});
```

### 测试原则

1. **每个公开方法至少 3 个测试**：正常路径 + 边界条件 + 错误路径
2. **测试行为，不测试实现**：测试"做什么"，不测试"怎么做"
3. **测试独立性**：每个测试独立运行，不依赖其他测试的状态
4. **使用 `beforeEach` 重置状态**：不要在测试间共享可变状态
5. **有意义的断言消息**：`expect(result).toBe(expected)` 而非 `expect(result).toBeTruthy()`

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npx vitest run tests/scheduler/token-bucket.test.ts

# 监视模式（文件变化时自动运行）
npx vitest

# 带覆盖率
npx vitest run --coverage
```

---

## Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>: <description>

[optional body]

[optional footer]
```

### Type

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add token bucket rate limiter` |
| `fix` | 修复 bug | `fix: handle empty chapter list` |
| `test` | 添加/修改测试 | `test: add edge case tests for scanner` |
| `docs` | 文档变更 | `docs: update USAGE.md with export examples` |
| `refactor` | 重构（不改变行为） | `refactor: extract helper function` |
| `chore` | 构建/工具变更 | `chore: update vitest config` |
| `perf` | 性能优化 | `perf: optimize priority queue` |
| `style` | 代码格式（不影响逻辑） | `style: fix indentation` |

### 示例

```bash
# 好的 commit
git commit -m "feat: add chapter-kit generator"
git commit -m "fix: handle missing outline.md gracefully"
git commit -m "test: add 10 tests for baseline extractor"
git commit -m "docs: add troubleshooting section to USAGE.md"

# 不好的 commit
git commit -m "update stuff"          # 太模糊
git commit -m "WIP"                   # 无意义
git commit -m "fix bug"               # 没有说明是什么 bug
```

---

## 项目架构

### 核心原则

1. **确定性状态机**：流程控制 100% TypeScript，LLM 只生成内容
2. **失败隔离**：单章节失败不阻塞其他章节
3. **素材包模式**：每个 Writer subagent 只看自己的素材包
4. **数据基线唯一来源**：跨章节数据只从 data-baseline.json 引用

### 模块依赖关系

```
commands/
  ├── init.ts        → state/store, utils/paths
  ├── organize.ts    → organize/* (scanner, indexer, etc.)
  └── export.ts      → assemble/* (assembler, converter)

orchestrator/
  ├── state-machine.ts → orchestrator/phases, state/store
  └── phases.ts        → state/schema

writing/
  ├── task-executor.ts  → scheduler/types
  └── orchestrator.ts   → state/schema, scheduler/types

scheduler/
  └── index.ts → token-bucket, priority-queue, retry
```

### 添加新模块

1. 在 `src/` 下创建目录和文件
2. 在 `tests/` 下创建对应的测试文件
3. 先写测试，再写实现
4. 确保 `npx tsc --noEmit` 通过
5. 确保 `npm test` 通过

---

## 文档

### 文档类型

| 文档 | 内容 | 维护者 |
|------|------|--------|
| `README.md` | 项目概述、快速开始 | 所有贡献者 |
| `USAGE.md` | 详细使用说明 | 所有贡献者 |
| `DESIGN.md` | 详细设计文档 | 核心开发者 |
| `ARCHITECTURE.md` | 架构设计 | 核心开发者 |
| `CHANGELOG.md` | 变更日志 | 发布管理者 |
| `HANDOFF.md` | 交接文档 | 当前开发者 |
| `GLOSSARY.md` | 术语表 | 所有贡献者 |
| `CONTRIBUTING.md` | 本文档 | 所有贡献者 |

### 更新文档

- 新增功能 → 更新 `USAGE.md`
- 架构变更 → 更新 `DESIGN.md` + `ARCHITECTURE.md`
- 新增术语 → 更新 `GLOSSARY.md`
- 发布版本 → 更新 `CHANGELOG.md`

---

## PR 流程

### 提交 PR 前

1. ✅ 所有测试通过 (`npm test`)
2. ✅ TypeScript 编译通过 (`npx tsc --noEmit`)
3. ✅ 新代码有对应的测试
4. ✅ Commit 信息符合 Conventional Commits
5. ✅ 文档已更新（如需要）

### PR 描述模板

```markdown
## 概述
简要描述这个 PR 做了什么。

## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 测试 (test)
- [ ] 文档 (docs)
- [ ] 重构 (refactor)
- [ ] 其他

## 测试
- [ ] 新增测试覆盖所有新代码
- [ ] 所有测试通过

## 文档
- [ ] 已更新相关文档

## 检查清单
- [ ] 代码符合项目风格
- [ ] 没有引入新的 TypeScript 错误
- [ ] Commit 信息规范
```

---

## 常见问题

### Q: 为什么 import 要用 `.js` 扩展名？

A: 因为项目使用 ESM (`"type": "module"`)，Node.js 的 ESM 解析器要求显式扩展名。虽然源文件是 `.ts`，但编译后是 `.js`，所以 import 路径用 `.js`。

### Q: 为什么不用 ESLint/Prettier？

A: 当前版本未配置，但建议后续添加。如果你有兴趣，可以提 PR 添加 ESLint + Prettier 配置。

### Q: 可以添加新依赖吗？

A: 可以，但需要：
1. 说明为什么需要
2. 确认包的大小和维护状态
3. 在 PR 中说明

### Q: 如何调试测试？

A: 使用 VSCode 的 Vitest 扩展，或在测试中加 `debugger` 语句：
```bash
npx vitest run --inspect-brk tests/my-module/my-module.test.ts
```

---

## 联系方式

- 问题反馈：GitHub Issues
- 功能讨论：GitHub Discussions

---

感谢你的贡献！🎉
