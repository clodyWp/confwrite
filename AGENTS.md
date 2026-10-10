# AGENTS.md — Coding Agent 开发指南

> 本文档是给接手本项目的 coding agent 的生存指南。
> 读完本文 → README.md（用户视角）→ DESIGN.md（架构细节）即可开始工作。

**文档版本**: v2.2 (2026-10-10)

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

### 3.6 缺陷修复必须形成闭环

1. **先复现用户症状**：优先写能失败的测试；必要时用最小脚本或真实日志回放。没有复现时，根因只能标为假设。
2. **先追完整链路**：检查输入、配置/状态持久化、所有消费者、状态转换和最终产物；不要只修最先报错的位置。
3. **一次验证一个假设**：区分事实与推断，避免把多个不相关修复捆在一起。
4. **固化回归测试**：测试应覆盖原始症状及关键后置条件，不只断言函数没有抛错或文件存在。
5. **如实报告验证范围**：列出实际运行的命令和结果；局部测试通过不代表真实 pi 流程已验证。

### 3.7 跨模块和并行改动

- 关键业务规则（预算、验收、章节状态等）要有明确来源；不要让多个模块各自定义成功条件。
- 修改数据流时，列出生产者和消费者，并验证旧状态/缺省值/用户编辑等边界。
- 多个 agent 并行时先划定文件与职责；同一业务链路由一个负责人集成，避免并发修改后只跑各自的局部测试。

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

## 7. 维护本指南

当技术栈、核心模块或开发约束改变时更新本文件；普通 bug 和功能细节分别记入 `BUGS.md`、`CHANGELOG.md`。保持规则短、可执行，并避免和其他文档重复。

仓库 Issue/PR 流程以 `.github/ISSUE_TEMPLATE/`、`.github/pull_request_template.md` 和 `.github/workflows/ci.yml` 为准。按仓库流程协作时使用现有模板；不要把开 Issue、开 PR 或自动合并当作本地调查和用户明确要求之外的通用技术步骤。
