# ConfWrite

长文档生成 pi Extension。支持 100+ 章节、100 万字级文档的结构化写作。

> 流程由 TypeScript 状态机控制，LLM 只做内容生成。

## 特性

- **确定性流程控制** — 状态机在 TypeScript 中运行，不依赖 LLM 判断流程走向
- **最大化自主推进** — 无依赖的任务并行执行，单个失败不阻塞整体
- **自动重试** — 失败任务按令牌桶节奏自动重试，无硬上限
- **状态持久化** — 每一步都持久化到 JSON，随时可恢复
- **素材包体系** — 先整理素材再写作，每个章节有独立的素材包
- **知识库与素材分离** — 知识库存通用规则，素材存项目专属资料
- **大纲→状态自动同步** — 编辑 outline.md 后自动同步章节到项目状态
- **真实文档转换** — 支持 PDF (pdf-parse) / DOCX (mammoth) / HTML → Markdown
- **定稿一致性检查** — Phase 7 自动统计文档 + 校验数据基线一致性

## 图表渲染

图表由内置布局引擎生成，**不使用 mermaid**。写手产出结构化格式
（`containers / nodes / edges`），引擎负责：

- **正交折线**：连线只有水平段和竖直段，没有曲线和斜线
- **单页压缩**：画布宽 ≤680px（保证字号可读）、高 ≤900px，压不下时按
  「边距 → 层间距 → 字号」的顺序压缩，**不拆成多张图**
- **分组与权重**：`containers` 决定分层，`high_weight` 节点更大更醒目，
  `crosscut` 画成贯穿全程的侧条

布局实现见 `src/diagrams/layout/`（`graph` → `metrics` → `route` → `render`）。

真实数据的几何回归（可选）：

```bash
CONFWRITE_REAL_DRAFTS=/path/to/project/drafts/chapters npm test
```

## 安装

### 前置依赖

- **Node.js** >= 18
- **pandoc** (可选，仅导出 DOCX/PDF 时需要)
  - macOS: `brew install pandoc`
  - Ubuntu/Debian: `sudo apt install pandoc`
  - Windows: `choco install pandoc` 或从 https://pandoc.org/installing.html 下载

### 安装方式

```bash
# 方式 1: 从 npm 安装（推荐）
pi install npm:confwrite

# 方式 2: 从 GitHub 安装
pi install git:github.com/clodyWp/confwrite

# 方式 3: 从本地目录安装
pi install ./confidenceWriter

# 方式 4: 使用安装脚本（自动编译）
bash scripts/install.sh      # Linux/macOS
.\scripts\install.ps1        # Windows PowerShell
```

**注意**：从 GitHub 安装时，需要手动构建：

```bash
cd .pi/git/github.com/clodyWp/confwrite  # 项目本地安装路径
npm install  # 安装所有依赖（包括 devDependencies）
npm run build  # 构建 TypeScript
```

这是因为 pi 对 git 包使用 `npm install --omit=dev`，跳过了构建所需的 typescript。

## 使用

### 1. 初始化项目

```
/confwrite:init my-project
```

创建项目目录结构：

```
projects/my-project/
├── inputs/                    # 需求文档
├── reference_material/        # 原始参考资料（PDF/Word/HTML/MD）
├── assets/
│   ├── indexes/               # JSON 索引
│   ├── chapter-kits/          # 章节素材包
│   ├── data-baseline.json     # 数据基线
│   └── references-index.md    # 资料清单
├── outline.md                 # 大纲
├── project-state.json         # 进度状态
├── drafts/chapters/           # 章节草稿
├── review/                    # 审阅结果
├── figures/                   # 图表
├── assembly/                  # 组装产物
└── output/                    # 最终定稿
```

### 2. 导入参考资料

将参考资料放入 `reference_material/` 目录，支持 Markdown、PDF、Word、HTML 格式。

### 3. 整理素材

```
/confwrite:organize
```

自动执行：
- 扫描资料 → 按主题域分类
- 格式转换（PDF/Word/HTML → Markdown）
- 生成 JSON 索引
- 提取数据基线
- 建立章节-索引映射
- 生成章节素材包（chapter-kits）
- **同步大纲→状态**（自动添加/移除章节）

### 4. 大纲规划

人机协作，多轮迭代。大纲中的层级决定 spawn 粒度：

```markdown
# 卷一：技术方案
## 篇1：总体架构
### 1.1 系统概述
ch001 系统背景
ch002 建设目标
### 1.2 技术路线
ch003 技术选型
```

带 `ch` 前缀的行表示该层级启用独立 subagent 编写。

### 5. 启动写作

```
/confwrite:write
```

状态机自动推进各阶段：

| Phase | 名称 | 说明 |
|-------|------|------|
| 0a | 项目初始化 | 创建目录结构 |
| 0b | 素材整理 | 扫描→索引→素材包 |
| 1 | 需求分析 | researcher subagent（可选） |
| 2 | 大纲规划 | 人机协作多轮迭代 |
| 3 | 素材准备 | 素材索引（如 0b 未完成） |
| 4a | 写作 | writer subagent 批量 |
| 4b | 审阅 | reviewer subagent 批量 |
| 4c | 决策 | 自动判断 pass/revise/reject |
| 4d | 修复 | fixer subagent 批量 |
| 5 | 图表生成 | 提取 mermaid → SVG → PNG |
| 6 | 组装 | 合并章节 → final.md |
| 7 | 定稿 | 统计文档 + 基线一致性检查 |
| 8 | 导出 | pandoc → `output/final.docx`（含 TOC） |

### 6. 查看进度 / 恢复 / 上下文管理

```
/confwrite:status    # 查看当前阶段和章节完成情况
/confwrite:resume    # 恢复中断的项目
/confwrite:compact   # 手动压缩上下文（防止长任务 429 错误）
```

**Context Compaction**：长文档写作过程中，context 可能膨胀导致 429 错误。设置 `compactThresholdTokens`（如 120000）后，系统会在 token 超过阈值时自动压缩上下文。压缩失败会自动暂停，提示用户手动处理。

### 7. 导出

```
/confwrite:export md      # 导出 Markdown
/confwrite:export html    # 导出 HTML
/confwrite:export docx    # 导出 Word（需 pandoc）
```

## 执行模型

### 调度器

- **令牌桶频率控制** — 控制提交频率，避免 LLM provider 限流
- **优先级队列** — 按优先级和依赖关系调度
- **自动重试** — 指数退避，无硬上限，失败不阻塞其他任务
- **状态持久化** — 调度器状态也持久化，随时可恢复

### 失败处理

```
queued → running → completed ✓
              ↓
           failed → retrying → running → ...
              ↓
         多轮失败 → failed（标记，不阻塞）
              ↓
         用户 steering 修正 → queued（重新入队）
```

- 单个任务失败不影响其他任务继续
- 阶段内所有可执行的任务都尝试完成后，阶段结束
- 用户可通过 steering 修正失败任务的 prompt 后重试

### 知识库 vs 项目素材

| | 知识库 | 项目素材 |
|---|--------|---------|
| 位置 | package 内置 / `~/.pi/agent/knowledge/` | `projects/<slug>/assets/` |
| 内容 | 写作方法论、审阅标准、图表规范 | 参考资料、数据基线、章节素材包 |
| 作用域 | 跨项目通用 | 单项目专属 |
| 用途 | 给 subagent 注入角色知识 | 给 writer 提供项目上下文 |

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 测试
npm test

# 开发模式
npm run test:watch
```

### 项目统计

| 指标 | 数值 |
|------|------|
| 源文件 | 62 个 TypeScript 文件 |
| 测试文件 | 112 个 |
| 依赖 | mammoth, pdf-parse, sharp, marked, docx, @sinclair/typebox |

### 项目结构

```
src/
├── index.ts                  # Extension 入口 (7 个命令 + runWriteLoop)
├── commands/                 # pi 命令
│   ├── init.ts               # /confwrite:init
│   ├── organize.ts           # /confwrite:organize
│   └── export.ts             # /confwrite:export
├── orchestrator/             # 状态机
│   ├── state-machine.ts      # 核心状态机
│   └── phases.ts             # 14 个 Phase 定义
├── scheduler/                # Subagent 调度器
│   ├── index.ts              # SubagentScheduler 主类
│   ├── executor.ts           # 执行器接口
│   ├── mock-executor.ts      # 测试用 Mock
│   ├── pi-executor.ts        # 真实 pi SDK 桥接
│   ├── runner.ts             # 执行循环
│   ├── token-bucket.ts       # 令牌桶
│   ├── window-limiter.ts     # 滑动窗口速率限制
│   ├── priority-queue.ts     # 优先级队列
│   ├── retry.ts              # 重试引擎
│   ├── loop-detector.ts      # 任务循环检测
│   ├── turn-budget.ts        # Turn 预算控制
│   └── types.ts              # 调度器类型定义
├── organize/                 # 素材整理
│   ├── scanner.ts            # 资料扫描
│   ├── converter.ts          # 格式转换 (mammoth + pdf-parse)
│   ├── indexer.ts            # JSON 索引生成
│   ├── baseline-extractor.ts # 数据基线提取
│   ├── outline-parser.ts     # 大纲解析
│   ├── chapter-mapper.ts     # 章节-索引映射
│   ├── chapter-syncer.ts     # 大纲→状态同步
│   ├── kit-generator.ts      # 素材包生成
│   └── kit-validator.ts      # 素材包校验
├── writing/                  # 写作管线
│   ├── task-executor.ts      # Prompt 构建 + 审阅解析
│   ├── content-validator.ts  # 内容深度验证
│   ├── output-validator.ts   # 输出格式验证
│   └── orchestrator.ts       # 写作阶段编排
├── dispatcher/               # 任务分发
│   └── index.ts              # action → prompt → 提交任务
├── assemble/                 # 组装与导出
│   ├── assembler.ts          # 章节组装
│   ├── converter.ts          # 格式转换 (MD→HTML/DOCX)
│   ├── finalizer.ts          # 定稿处理 (统计+一致性)
│   └── cleanup-docx-styles.ts # DOCX 样式清理
├── diagrams/                 # 图表管线（结构化格式 + 内置布局引擎）
│   ├── extractor.ts          # 图表代码块提取
│   ├── description-parser.ts # 图表描述解析（分层/节点/连接）
│   ├── structured-parser.ts  # 结构化格式解析 (containers/nodes/edges)
│   ├── style.ts              # 配色/字体/尺寸风格（可配置，支持项目覆盖）
│   ├── cache.ts              # 源哈希缓存（含产物存在性校验）
│   ├── injector.ts           # 把生成的图表注入组装产物
│   ├── pipeline.ts           # 渲染管线
│   ├── png-converter.ts      # SVG → PNG 转换
│   ├── path-adjuster.ts      # 图表路径调整
│   ├── validator.ts          # 图表结构校验
│   └── layout/               # 内置布局引擎
│       ├── index.ts          # 布局入口
│       ├── graph.ts          # 图构建
│       ├── metrics.ts        # 几何度量
│       ├── route.ts          # 正交连线路由
│       ├── render.ts         # SVG 渲染
│       └── validate.ts       # 布局校验
├── logging/                  # 日志系统
│   ├── index.ts              # 日志入口
│   ├── logger.ts             # 日志记录器
│   ├── event-bus.ts          # 事件总线
│   ├── stats.ts              # 统计汇总
│   └── types.ts              # 日志类型定义
├── knowledge/                # 知识库加载
│   └── loader.ts             # 知识库加载+注入
├── state/                    # 状态管理
│   ├── schema.ts             # TypeBox schema
│   └── store.ts              # 原子化持久化
└── utils/
    ├── paths.ts              # 路径安全
    └── dedent.ts             # 字符串缩进处理

knowledge/diagrams/           # 内置图表知识库 (16 个 MD 文件)
tests/                        # 112 个测试文件
```

### 设计原则

1. **LLM 只做内容生成** — 流程判断在 TypeScript 中，不让 LLM 决定"下一步做什么"
2. **测试先行** — 每个模块先写测试，再写实现
3. **状态持久化** — 所有状态存 JSON 文件，进程重启后从文件恢复
4. **幂等恢复** — resume 就是重新调用 tick()，已完成的任务不重做

## License

MIT
