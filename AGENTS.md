# AGENTS.md — Coding Agent 开发指南

> 本文档是给接手本项目的 coding agent 的生存指南。
> 读完本文 → README.md（用户视角）→ DESIGN.md（架构细节）即可开始工作。

**文档版本**: v2.3 (2026-10-14)

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
| 运行时 | Node.js >= 22.19.0（与当前 pi 宿主依赖最低版本一致） |
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

### 3.1.1 Commit Message 格式（强制）

**所有 commit 必须使用 Conventional Commits 格式**，husky + commitlint 会自动检查：

```
<type>: <description>

# 示例
feat: add diagram export
fix: resolve phase 4b deadlock
docs: update README
chore: update dependencies
```

**Type 类型**：
- `feat` — 新功能 → 自动升 MINOR
- `fix` — Bug 修复 → 自动升 PATCH
- `docs` — 文档变更
- `style` — 代码格式（不影响逻辑）
- `refactor` — 重构
- `perf` — 性能优化
- `test` — 测试相关
- `build` — 构建系统/外部依赖
- `ci` — CI 配置
- `chore` — 其他杂务
- `revert` — 回滚

**Breaking Change**：在 type 后加 `!` 或在 footer 写 `BREAKING CHANGE:` → 自动升 MAJOR

### 3.1.2 版本号自动管理

**版本号由 commit 历史自动决定，不需要手动改 `package.json`。**

发布流程：
```bash
npm run release
```

一条命令自动完成：
1. `npm test`（验证测试通过）
2. 扫描 commit 历史 → 算出版本号
3. 自动生成 changelog（分类：Features / Bug Fixes / Docs / Tests...）
4. 修改 `package.json` 版本号
5. `npm run build`（重新编译）
6. Git commit + tag + push
7. 创建 GitHub Release

**预览模式**（不实际发布）：
```bash
npx release-it --dry-run
```

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

### 3.6 Spec-Driven 开发流程

本项目采用 Spec-Driven Development（SDD），行为规格定义在 `specs/` 目录：

- `specs/state-machine.md` — 状态机行为规格（13 条不变量）
- `specs/module-contracts.md` — 模块间契约（通用规则 + Phase 契约 + 数据传递契约）

**开发流程**：

1. **改代码前**：读 `specs/` 下相关 spec，理解模块的行为契约
2. **spec 不存在或不覆盖**：先补/修 spec，再写代码
3. **写代码时**：代码必须满足 spec 中的所有不变量
4. **写测试时**：测试必须覆盖 spec 中定义的前置/后置条件
5. **修 bug 时**：先写/修 spec（定义"对"是什么），再写失败测试，最后修代码

**验证方式**：

- `tests/orchestrator/spec-invariants.test.ts` — 验证状态机不变量（SM-*）
- 每条测试名包含不变量 ID（如 `SM-4: index.ts 在 tick 之前判定终态`）
- `npm test` 通过 = spec 被遵守；测试失败 = spec 被违反

**违反 spec = 违反 AGENTS.md = 不可接受**

### 3.7 缺陷修复必须形成闭环

1. **先复现用户症状**：优先写能失败的测试；必要时用最小脚本或真实日志回放。没有复现时，根因只能标为假设。
2. **先追完整链路**：检查输入、配置/状态持久化、所有消费者、状态转换和最终产物；不要只修最先报错的位置。
3. **一次验证一个假设**：区分事实与推断，避免把多个不相关修复捆在一起。
4. **固化回归测试**：测试应覆盖原始症状及关键后置条件，不只断言函数没有抛错或文件存在。
5. **如实报告验证范围**：列出实际运行的命令和结果；局部测试通过不代表真实 pi 流程已验证。

### 3.8 跨模块和并行改动

- 关键业务规则（预算、验收、章节状态等）要有明确来源；不要让多个模块各自定义成功条件。
- 修改数据流时，列出生产者和消费者，并验证旧状态/缺省值/用户编辑等边界。
- 多个 agent 并行时先划定文件与职责；同一业务链路由一个负责人集成，避免并发修改后只跑各自的局部测试。

### 3.9 PR 工作流：先开 PR 再迭代

**核心原则**：PR 应该在开始工作时立即创建，而不是等全部完成后才开。这样可以保持工作透明，早期获得反馈，避免方向错误导致大量返工。

**标准流程**：

1. **创建 Issue**（除非是 trivial 改动）
   - 使用 `gh issue create` 描述问题/需求
   - 后续 commit 和 PR 关联此 Issue

2. **创建分支后立即开 Draft PR**
   - 使用 `gh pr create --draft` 创建 Draft PR
   - PR 标题标注 `[WIP]` 或 `[Draft]`
   - PR 描述关联 Issue（`Closes #xxx`）并说明当前进度和计划

3. **每个 SDD 阶段分别 commit 并 push**
   - Spec 阶段：`git commit -m "docs: add spec for <feature>"`
   - 测试阶段：`git commit -m "test: add failing tests for <feature>"`
   - 实现阶段：`git commit -m "feat: implement <feature>"`
   - 每个 commit 都 push 到远程，保持 PR 可见

4. **在 PR 上迭代**
   - reviewer 可以在过程中看到 diff 和进展
   - 根据反馈及时调整方向
   - 避免"黑箱开发"——全部做完才能 review

5. **完成后标记 ready for review**
   - 所有测试通过
   - 文档已更新
   - 使用 `gh pr ready` 标记为 ready
   - 移除 `[WIP]` 标记

6. **合并**
   - CI 全部通过
   - 至少一个 reviewer approve
   - 使用 `gh pr merge --squash` 合并（保持主分支历史清晰）

**反模式**：
- ❌ 本地完成全部工作（spec → 测试 → 实现 → 验证）→ 一次性 commit → push → 开 PR
- ❌ 过程中不可见，完成后才能 review
- ❌ 如果方向错误，返工量大

**正确模式**：
- ✅ 创建 Issue → 创建分支 → 立即开 Draft PR → 每个阶段分别 commit 并 push → reviewer 实时可见 → 完成后标记 ready → 合并
- ✅ 早期反馈，及时调整
- ✅ 透明度高，协作顺畅

**例外情况**：
- 纯文档修改（typo、格式调整）可以一次性 commit
- 紧急 hotfix 可以先本地验证再开 PR，但仍应尽快开 PR 保持可见

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

## 5. 文档与仓库约定

- 用户用法写在 `README.md`，架构细节写在 `DESIGN.md`，pi 命令和 Skill 行为写在 `SKILL.md`。
- 影响用户行为、配置、命令或架构的改动，更新对应文档；纯内部改动不需要无意义地改所有文档。
- 缺陷修复记录在 `BUGS.md`；版本发布时更新 `CHANGELOG.md`。不要把完整发布手册复制到本文件。
- 源码在 `src/`，测试在 `tests/` 并按模块镜像；临时脚本和生成产物不要混入 package 根目录。
- 修改 Node 或 pi API 支持范围时，同步核对 `package.json`、锁文件、CI 和用户文档。

## 6. 快速参考

| 需要了解 | 读哪个文档 |
|----------|-----------|
| 用户接口 | README.md |
| 架构设计 | DESIGN.md |
| 当前待办 | TODO.md |
| Bug 记录 | BUGS.md |
| 版本变更 | CHANGELOG.md |
| 命令注册 | SKILL.md |
| Commit 格式 | §3.1.1 |
| 发布流程 | §3.1.2 |

## 7. 维护本指南

当技术栈、核心模块或开发约束改变时更新本文件；普通 bug 和功能细节分别记入 `BUGS.md`、`CHANGELOG.md`。保持规则短、可执行，并避免和其他文档重复。

仓库 Issue/PR 流程以 `.github/ISSUE_TEMPLATE/`、`.github/pull_request_template.md` 和 `.github/workflows/ci.yml` 为准。按仓库流程协作时使用现有模板；不要把开 Issue、开 PR 或自动合并当作本地调查和用户明确要求之外的通用技术步骤。

**PR 创建规则**：创建 PR 时必须复制 `.github/pull_request_template.md` 的完整格式，特别是 `## 缺陷修复证据` 部分的 4 个字段（`症状与复现`、`根因证据`、`回归测试`、`验证命令与结果`）。CI 的 `check-pr-evidence.js` 会检查这些字段非空。格式错误会导致 CI 失败并浪费时间。
