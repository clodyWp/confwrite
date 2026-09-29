# AGENTS.md — Coding Agent 开发指南

> 本文档是给接手本项目的 coding agent 的生存指南。
> 读完本文 → README.md（用户视角） → DESIGN.md（架构细节）即可开始工作。

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
| DOCX 导出 | JSZip 直接操作（不依赖 pandoc CLI） |
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

验证 dist 是新版：
```bash
grep -c 'DEFAULT_LAYER_PALETTE' dist/diagrams/style.js   # 应 > 0
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

## 4. 架构速查

### 4.1 数据流

```
src/index.ts (Extension 入口, 7 个命令注册)
  │
  ├── commands/          命令实现 (init, organize, export)
  │
  ├── orchestrator/      状态机 (14 个 Phase 声明 + tick 循环)
  │     └── phases.ts    每个 Phase: validate() + execute() + exits[] + onEnter?
  │
  ├── dispatcher/        动作执行层 (action → 读素材 → 生成 prompt → 提交任务)
  │
  ├── writing/           写作管线
  │     ├── task-executor.ts    Prompt 构建 + 审阅解析 (最大文件, 534 行)
  │     ├── orchestrator.ts     写作阶段编排
  │     ├── content-validator.ts 内容深度验证
  │     └── output-validator.ts  输出格式验证
  │
  ├── scheduler/         Subagent 调度器
  │     ├── index.ts           SubagentScheduler 主类
  │     ├── runner.ts          执行循环 (就绪→执行→标记)
  │     ├── pi-executor.ts     真实 pi SDK 桥接
  │     ├── token-bucket.ts    令牌桶限流
  │     ├── priority-queue.ts  最小堆优先级队列
  │     ├── retry.ts           指数退避重试
  │     ├── loop-detector.ts   任务循环检测
  │     └── turn-budget.ts     Turn 硬预算 (防无界迭代)
  │
  ├── organize/          素材整理
  │     ├── scanner.ts         资料扫描 + 分类
  │     ├── converter.ts       PDF/DOCX/HTML → Markdown
  │     ├── indexer.ts         JSON 索引生成
  │     ├── baseline-extractor.ts 数据基线提取
  │     ├── chapter-mapper.ts  章节-索引映射
  │     ├── chapter-syncer.ts  大纲→状态同步
  │     ├── kit-generator.ts   素材包生成
  │     └── kit-validator.ts   素材包校验
  │
  ├── diagrams/          图表管线 (结构化格式 + 内置布局引擎)
  │     ├── extractor.ts         图表代码块提取
  │     ├── structured-parser.ts 结构化格式解析 (containers/nodes/edges)
  │     ├── pipeline.ts          渲染管线
  │     ├── style.ts             配色/字体/尺寸 (可配置)
  │     ├── cache.ts             源哈希缓存
  │     ├── injector.ts          图表注入组装产物
  │     └── layout/              内置布局引擎 (graph→metrics→route→render→validate)
  │
  ├── assemble/          组装与导出
  │     ├── assembler.ts         章节组装
  │     ├── converter.ts         MD → HTML/DOCX
  │     ├── finalizer.ts         定稿 (统计+一致性检查)
  │     └── cleanup-docx-styles.ts DOCX 样式清理
  │
  ├── logging/           日志系统 (event-bus + logger + stats)
  ├── knowledge/         知识库加载 (图表规范/选型指南)
  ├── state/             状态管理 (TypeBox schema + 原子化持久化)
  └── utils/             路径安全 + 字符串工具
```

### 4.2 状态机 Phase 流转

```
0a (初始化) → 0b (素材整理) → 1 (需求分析,可选) → 2 (大纲规划,waitPoint)
→ 3 (素材准备) → 4a (写作) → 4b (审阅) → 4c (决策) → 4d (修复) → [回到 4b]
→ 5 (图表生成) → 6 (组装,waitPoint) → 7 (定稿) → 8 (导出) → done
```

- **waitPoint**: 暂停等待用户确认（如大纲编辑、组装结果审阅）
- **onEnter**: Phase 进入时清理自身残留产物（Bug 28 修复）

### 4.3 文件版本化约定

```
drafts/chapters/${chapterId}-v${round}.md    # Writer 输出
review/${chapterId}-r${round}.json            # Reviewer 输出
figures/${chapterId}-*.svg / .png             # 图表产物
assembly/merged-v1.md                         # 组装产物
output/final.md / final.docx                  # 最终导出
```

### 4.4 项目目录结构（用户项目侧）

```
projects/<slug>/
├── inputs/                    # 需求文档
├── reference_material/        # 原始参考资料
├── assets/
│   ├── indexes/               # JSON 索引
│   ├── chapter-kits/          # 章节素材包
│   ├── data-baseline.json     # 数据基线
│   └── references-index.md    # 资料清单
├── outline.md                 # 大纲（用户编辑）
├── project-state.json         # 进度状态（系统维护）
├── drafts/chapters/           # 章节草稿
├── review/                    # 审阅结果
├── figures/                   # 图表
├── assembly/                  # 组装产物
└── output/                    # 最终定稿
```

## 5. 关键设计结论（勿重复推翻）

### 5.1 字数度量层级 = ch 级

```
MIN_CHAPTER_CHARS = 8000    # 一个 ch 整体 ≥ 8000 字
```

**历史事故**：曾写「每个子节 ≥ 5000 字」，一个 ch 有 ~27 个小节，等于要求 135,000 字。
模型单次只能产出 ~18,000 字，导致「量字数→补内容→再量」循环吃掉 50% 运行时间。

**结论**：度量在 ch 层，不按内部小节分别计算。**不要改回按小节度量。**

### 5.2 图表不用 mermaid

Writer 在草稿中写结构化格式（`containers / nodes / edges`），由内置布局引擎渲染。
mermaid 已废弃（v0.6.0 起）。**不要引入 mermaid 依赖。**

### 5.3 DOCX 导出不依赖 pandoc

v0.8.0 起用 JSZip 直接操作 DOCX（`src/assemble/converter.ts`）。
pandoc 作为可选备选，不再是主要路径。

### 5.4 职责分离

| 角色 | 职责 | 不负责 |
|------|------|--------|
| Writer | 写内容 | 不自己检查字数 |
| Reviewer | 审阅 + 篇幅检查 | 不修改内容 |
| Fixer | 按审阅报告修复 | 不自行判断是否需要修复 |

**不要让 Writer 自己检查字数**——这是循环收敛性问题的根源。

### 5.5 Phase onEnter 清理残留

Phase 6/7/8 的 `onEnter` 钩子清理自身残留产物。
原因：状态机先查出口条件再执行，残留文件会让出口条件直接成立，阶段跳过自己的工作。
**新增 Phase 时，如果出口条件基于文件存在性，必须实现 onEnter 清理。**

## 6. 已知问题（不要意外踩到）

### 6.1 Phase 4 审阅收敛性（P1，未修）

| Bug | 问题 |
|-----|------|
| Bug 6 | 「段落 ≥ 300 字」规则在特定条件下仍可能不收敛 |
| Bug 4 | 审阅 accept 门槛「全部通过」几乎达不到 |
| Bug 5 | 裁决与严重度不相关（low 级问题也触发 revise） |
| Bug 7 | 审阅报告被覆盖（round 卡在 1） |
| Bug 3 | `pending` 孤儿 / 4c 死锁 |

**当前状态**：刻意不碰。目标是复用已有草稿走完 Phase 5→8，不重做 Phase 4。
如果要修，建议独立分支 `fix/review-convergence`。

### 6.2 并发数为 1（串行）

`DEFAULT_SCHEDULER_CONFIG.maxConcurrency = 1`。大项目耗时长。
调大前需测试并发写入稳定性。

### 6.3 dist/ 静默跑旧代码

`dist/` 不被 git 跟踪。切分支后必须 `npm run build`。
**这是最高频的新手陷阱。**

## 7. 发布 Checklist

```bash
# 1. 更新版本号
# 编辑 package.json 的 "version" 字段

# 2. 更新 CHANGELOG.md
# 添加新版本条目

# 3. 构建
npm run build

# 4. 测试
npm test

# 5. 提交
git add -A
git commit -m "chore: release vX.Y.Z"

# 6. 打 tag
git tag vX.Y.Z

# 7. 推送
git push origin dev
git push origin vX.Y.Z

# 8. 发布 npm（如需要）
npm publish
```

## 8. 测试项目参考

| 工作区 | 路径 | 用途 |
|--------|------|------|
| 本地开发 | 当前目录 | 单元测试 + 小型集成测试 |
| t3 远程 | `water@8.160.160.85:/home/water/proj/t3` | 端到端测试（LmERP2 项目） |
| c2 远程 | `water@8.160.160.85:/home/water/proj/c2` | 发布验证 |

远程测试需要 SSH 密钥和代理配置（`http.proxy http://127.0.0.1:10809`）。

## 9. 文档地图

| 文件 | 内容 | 何时读 |
|------|------|--------|
| **本文档** | 开发约束 + 架构速查 + 已知坑 | 接手时必读 |
| `README.md` | 用户视角：安装、使用、功能 | 需要了解用户接口时 |
| `DESIGN.md` | 详细设计：模块职责、数据流、决策 | 需要改架构时 |
| `TODO.md` | 当前状态 + 待办 + 历史数据 | 需要了解"现在在哪"时 |
| `BUGS.md` | Bug 证据 + 根因 + 修复状态 | 需要修 bug 时 |
| `CHANGELOG.md` | 版本变更记录 | 发布前回顾 |
| `SKILL.md` | pi 框架 Skill 定义 | 需要了解命令注册时 |
| `knowledge/diagrams/` | 图表知识库（16 个 MD） | 需要改图表逻辑时 |
