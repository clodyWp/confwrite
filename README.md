# ConfWrite

长文档生成 pi package。支持 100+ 章节、100 万字级文档的结构化写作。

> 流程由 TypeScript 状态机控制，LLM 只做内容生成。

## 特性

- **确定性流程控制** — 状态机在 TypeScript 中运行，不依赖 LLM 判断流程走向
- **最大化自主推进** — 无依赖的任务并行执行，单个失败不阻塞整体
- **自动重试** — 失败任务按令牌桶节奏自动重试，无硬上限
- **状态持久化** — 每一步都持久化到 JSON，随时可恢复
- **素材包体系** — 先整理素材再写作，每个章节有独立的素材包
- **知识库与素材分离** — 知识库存通用规则，素材存项目专属资料

## 安装

```bash
# 本地打包
npm pack

# 安装到 pi
pi install ./confwrite-0.1.0.tgz
```

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
│   ├── indexes/               # JSON 索引（按主题域分区）
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
| 5 | 图表生成 | diagram agents → SVG→PNG |
| 6 | 组装 | 合并章节 → final.md |
| 7 | 定稿 | 用户审阅确认 |
| 8 | 导出 | convert-to-docx → final.docx |

### 6. 查看进度 / 恢复

```
/confwrite:status    # 查看当前阶段和章节完成情况
/confwrite:resume    # 恢复中断的项目
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

### 项目结构

```
src/
├── index.ts                  # Extension 入口
├── commands/                 # pi 命令
│   ├── init.ts               # /confwrite:init
│   ├── organize.ts           # /confwrite:organize
│   ├── write.ts              # /confwrite:write
│   ├── status.ts             # /confwrite:status
│   └── resume.ts             # /confwrite:resume
├── orchestrator/             # 状态机
│   ├── state-machine.ts      # 核心状态机
│   ├── phases.ts             # Phase 定义
│   └── transitions.ts        # 转换规则
├── scheduler/                # Subagent 调度器
│   ├── index.ts              # 调度器主入口
│   ├── token-bucket.ts       # 令牌桶
│   ├── priority-queue.ts     # 优先级队列
│   ├── retry.ts              # 重试引擎
│   └── lifecycle.ts          # 生命周期管理
├── organize/                 # 素材整理
│   ├── scanner.ts            # 资料扫描
│   ├── converter.ts          # 格式转换
│   ├── indexer.ts            # JSON 索引生成
│   ├── baseline-extractor.ts # 数据基线提取
│   ├── chapter-mapper.ts     # 章节-索引映射
│   ├── kit-generator.ts      # 素材包生成
│   └── outline-parser.ts     # 大纲解析
├── agents/                   # Prompt 构建器
├── knowledge/                # 知识库
├── services/                 # 业务逻辑
├── state/                    # 状态管理
│   ├── schema.ts             # TypeBox schema
│   └── store.ts              # 持久化存储
└── utils/                    # 工具函数
    └── paths.ts              # 路径安全

knowledge/                    # 内置知识库
├── writing-methodology.md
├── review-criteria.md
├── diagram-rules.md
└── outline-patterns.md

tests/                        # 测试（TDD）
```

### 设计原则

1. **LLM 只做内容生成** — 流程判断在 TypeScript 中，不让 LLM 决定"下一步做什么"
2. **测试先行** — 每个模块先写测试，再写实现
3. **状态持久化** — 所有状态存 JSON 文件，进程重启后从文件恢复
4. **幂等恢复** — resume 就是重新调用 tick()，已完成的任务不重做

## License

MIT
