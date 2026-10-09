# AGENTS.md — Coding Agent 开发指南

> 本文档是给接手本项目的 coding agent 的生存指南。
> 读完本文 → README.md（用户视角）→ DESIGN.md（架构细节）即可开始工作。

**文档版本**: v2.0 (2026-10-09)

---

## 1. 项目身份

**ConfWrite** 是一个 pi-coding-agent 扩展包（Extension + Skill），用于生成 10+ 章节、百万字级长文档。

核心卖点：**流程由 TypeScript 状态机控制，LLM 只做内容生成**。状态机决定"下一步做什么"，LLM 只负责"写这一章的内容"。

```
用户输入素材 → 整理索引 → 大纲规划 → 写作/审阅/修复循环 → 图表渲染 → 组装 → 导出 Word
```

## 2. 技术栈

| 项 | 值 |
|---|---|
| 语言 | TypeScript (ES2022, strict) |
| 模块系统 | ESM (`"type": "module"`, Node16 resolution) |
| 运行时 | Node.js >= 18 |
| 框架 | pi-coding-agent Extension API |
| 测试 | vitest (15s timeout) |
| 状态持久化 | JSON 文件（原子化写入：write-temp → rename） |
| 图表 | 内置布局引擎（结构化格式 `containers/nodes/edges`），**不使用 mermaid** |
| DOCX 导出 | pandoc CLI 转换 + JSZip 后处理样式清理 |
| 类型验证 | @sinclair/typebox（运行时 JSON Schema） |
| 图片处理 | sharp |
| 文档转换 | mammoth (DOCX→MD), pdf-parse (PDF→MD) |

## 3. 开发硬约束

### 3.1 改完代码必须 build

```bash
npm run build    # TypeScript → dist/
npm test         # vitest run
```

**`dist/` 不被 git 跟踪。** 切分支后不 build 会静默跑旧代码——这是真实事故。

### 3.2 ESM 导入路径

所有相对导入必须带 `.js` 后缀：
```typescript
// ✅ 正确
import { Foo } from './bar.js';
// ❌ 错误（TypeScript 编译后找不到）
import { Foo } from './bar';
```

### 3.3 测试规范

- 测试文件放在 `tests/` 目录，镜像 `src/` 结构
- 文件名 `*.test.ts`
- 使用 vitest（API 兼容 jest，但用 `describe/it/expect`）
- Mock 执行器用 `MockSubagentExecutor`（`src/scheduler/mock-executor.ts`）
- 不要 mock `fs` 模块——用临时目录 + `afterEach` 清理

### 3.4 状态修改必须持久化

所有对 `ProjectState` 的修改必须通过 `ProjectStore.save()` 写回 JSON。
进程随时可能中断（用户 Ctrl+C、429 限流），未持久化的状态会丢失。

### 3.5 跨平台兼容

代码运行在 Windows 和 Linux 上。注意：
- 路径用 `path.join()`，不要手动拼 `/`
- Shell 工具按平台选择：Windows → powershell，Linux → bash
- 字体回退链需覆盖 CJK 字符（`Microsoft YaHei` → `SimHei` → `Noto Sans CJK`）

## 4. 架构速查

详细架构设计见 `DESIGN.md`。此处仅提供快速导航：

```
src/index.ts (Extension 入口)
  ├── commands/          命令实现
  ├── orchestrator/      状态机 (Phase 声明 + tick 循环)
  ├── dispatcher/        动作执行层
  ├── writing/           写作管线
  ├── scheduler/         Subagent 调度器
  ├── organize/          素材整理
  ├── outline/           大纲生成
  ├── diagrams/          图表管线
  ├── assemble/          组装与导出
  ├── logging/           日志系统
  ├── knowledge/         知识库加载
  ├── config/            配置加载与验证
  ├── state/             状态管理
  └── utils/             工具函数
```

**状态机 Phase 流转**：
```
0a (初始化) → 0b (素材整理) → 1 (需求分析) → 2 (大纲规划,waitPoint)
  ├─→ 3 (素材准备) ─→ 4a (写作)
  └─→ 4a (写作)  ← 素材已匹配大纲时可跳过 3
4a → 4b (审阅) → 4c (决策) → 4d (修复) → [回到 4b]
  → 5 (图表生成) → 6 (组装,waitPoint) → 7 (定稿) → 8 (导出) → done
```

## 5. 文件组织规范

### 5.1 Package 核心文件（根目录）

仅保留以下文件：

| 文件 | 用途 | 必须 |
|------|------|------|
| README.md | 用户文档 | ✅ |
| AGENTS.md | 开发者文档 | ✅ |
| DESIGN.md | 架构设计 | ✅ |
| CHANGELOG.md | 版本变更 | ✅ |
| TODO.md | 待办事项 | ✅ |
| BUGS.md | Bug 记录 | ✅ |
| SKILL.md | pi Skill 定义 | ✅ |
| package.json | 包配置 | ✅ |
| tsconfig.json | TypeScript 配置 | ✅ |
| vitest.config.ts | 测试配置 | ✅ |
| .gitignore | Git 忽略 | ✅ |
| .editorconfig | 编辑器配置 | ✅ |
| LICENSE | 许可证 | ✅ |

### 5.2 目录结构

| 目录 | 用途 | 示例 |
|------|------|------|
| src/ | 源代码 | src/outline/generator.ts |
| tests/ | 测试代码 | tests/outline/generator.test.ts |
| tests/fixtures/ | 测试数据 | tests/fixtures/requirements/sample.md |
| scripts/ | 工具脚本 | scripts/install.sh |
| examples/ | 示例项目 | examples/simple-proposal/ |
| knowledge/ | 知识库 | knowledge/chapter-types/ |
| templates/ | 模板 | templates/ |
| dist/ | 构建产物 | (gitignore) |
| node_modules/ | 依赖 | (gitignore) |

### 5.3 禁止出现在根目录

| 类型 | 示例 | 原因 |
|------|------|------|
| 远程项目产物 | LMERP2V2-*.md, *.docx | 不属于 package |
| 临时脚本 | check-*.py, fix-*.js | 一次性使用 |
| 旧版本包 | confwrite-0.*.tgz | 仅保留最新 |
| 临时目录 | test-debug/, test-*/ | 测试残留 |
| 已完成计划 | PLAN-*.md (已完成) | 删除或归档 |

### 5.4 文件命名规范

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 源代码 | kebab-case.ts | task-executor.ts |
| 测试文件 | *.test.ts | generator.test.ts |
| 计划文档 | PLAN-<feature>.md | PLAN-material-kit-improvement.md |
| 工具脚本 | <action>.sh/.ps1 | install.sh |

## 6. 版本号规范

### 6.1 语义化版本 (SemVer)

格式：`MAJOR.MINOR.PATCH`

| 版本 | 含义 | 示例 |
|------|------|------|
| MAJOR | 不兼容的 API 变更 | 1.0.0 → 2.0.0 |
| MINOR | 向后兼容的功能新增 | 0.13.0 → 0.14.0 |
| PATCH | 向后兼容的 Bug 修复 | 0.13.0 → 0.13.1 |

### 6.2 发布流程

```bash
# 1. 更新版本号
npm version patch|minor|major

# 2. 更新 CHANGELOG.md
# 添加新版本条目

# 3. 构建和测试
npm run build && npm test

# 4. 打包
npm pack

# 5. 提交
git add -A
git commit -m "chore: release vX.Y.Z"

# 6. 打 tag
git tag vX.Y.Z

# 7. 推送
git push && git push --tags

# 8. 发布 npm（如需要）
npm publish
```

### 6.3 清理旧版本

每次发布后，删除旧版本 .tgz，仅保留最新版本：

```bash
rm confwrite-*.tgz
npm pack  # 生成新版本
```

## 7. 文档分类规范

### 7.1 核心文档（保留在根目录）

| 文档 | 用途 | 更新频率 |
|------|------|----------|
| README.md | 用户文档 | 功能变更时 |
| AGENTS.md | 开发者文档 | 架构变更时 |
| DESIGN.md | 架构设计 | 架构变更时 |
| CHANGELOG.md | 版本变更 | 每次发布 |
| TODO.md | 待办事项 | 持续更新 |
| BUGS.md | Bug 记录 | 发现 Bug 时 |
| SKILL.md | pi Skill 定义 | 命令变更时 |

### 7.2 计划文档（临时）

| 类型 | 命名 | 生命周期 |
|------|------|----------|
| 当前计划 | PLAN-<feature>.md | 功能完成后删除 |
| 已完成计划 | 无 | 删除或归档 |

## 8. 快速参考

| 需要了解 | 读哪个文档 |
|----------|-----------|
| 用户接口 | README.md |
| 架构设计 | DESIGN.md |
| 当前待办 | TODO.md |
| Bug 记录 | BUGS.md |
| 版本变更 | CHANGELOG.md |
| 命令注册 | SKILL.md |

## 9. 本文档维护规范

### 9.1 何时更新 AGENTS.md

| 情况 | 需要更新 |
|------|----------|
| 新增/删除核心模块 | ✅ 更新 §4 架构速查 |
| 技术栈变更 | ✅ 更新 §2 技术栈 |
| 开发约束变更 | ✅ 更新 §3 开发硬约束 |
| 文件组织规范变更 | ✅ 更新 §5 文件组织规范 |
| 版本号规范变更 | ✅ 更新 §6 版本号规范 |
| Bug 修复 | ❌ 更新 BUGS.md，不更新本文档 |
| 功能新增 | ❌ 更新 CHANGELOG.md，不更新本文档 |

### 9.2 更新原则

1. **保持简洁**：AGENTS.md 是生存指南，不是百科全书
2. **指向其他文档**：架构细节 → DESIGN.md，Bug → BUGS.md
3. **及时更新**：架构变更后立即更新，不要累积
4. **版本号同步**：重大变更时更新文档版本（在文件头部标注）

### 9.3 文档版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v2.0 | 2026-10-09 | 重写：精简内容，新增文件/版本/文档规范 |
| v1.0 | 2026-09-29 | 初始版本 |
