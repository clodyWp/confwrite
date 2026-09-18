# ConfWrite 详细设计文档

> **版本**: v0.7.2  
> **日期**: 2025-06  
> **状态**: 全链路可用，已发布就绪  
> **作者**: ConfWrite Team

---

## 目录

- [1. 概述](#1-概述)
- [2. 设计目标与约束](#2-设计目标与约束)
- [3. 系统架构](#3-系统架构)
- [4. 模块详细设计](#4-模块详细设计)
  - [4.1 状态管理 (state/)](#41-状态管理-state)
  - [4.2 调度器系统 (scheduler/)](#42-调度器系统-scheduler)
  - [4.3 素材组织系统 (organize/)](#43-素材组织系统-organize)
  - [4.4 写作管线 (writing/)](#44-写作管线-writing)
  - [4.5 组装与导出 (assemble/)](#45-组装与导出-assemble)
  - [4.6 状态机 (orchestrator/)](#46-状态机-orchestrator)
  - [4.7 Dispatcher 层 (dispatcher/)](#47-dispatcher-层-dispatcher)
  - [4.8 命令层 (commands/)](#48-命令层-commands)
  - [4.9 Extension 入口 (index.ts)](#49-extension-入口-indexts)
- [5. 数据流设计](#5-数据流设计)
- [6. 关键设计决策](#6-关键设计决策)
- [7. 已识别的架构问题](#7-已识别的架构问题)
- [8. 测试覆盖](#8-测试覆盖)
- [9. 附录](#9-附录)

---

## 1. 概述

### 1.1 项目定位

ConfWrite 是一个 **pi 原生扩展包**（Extension + Skill），用于生成 10+ 章节、百万字级长文档。典型场景包括技术方案、白皮书、操作手册等。

### 1.2 核心问题

传统 LLM 写作面临三个核心挑战：

| 挑战 | 描述 | ConfWrite 解法 |
|------|------|---------------|
| **上下文溢出** | 单次 LLM 调用无法处理整本书 | 章节素材包 (Chapter Kit) 模式，每个 subagent 只处理一章 |
| **数据不一致** | 多章节间数字/术语矛盾 | 数据基线 (Data Baseline) 机制，Writer 引用 + Reviewer 核查 |
| **流程不可控** | LLM 驱动的 flow control 不可靠 | 确定性 TypeScript 状态机，LLM 只负责内容生成 |

### 1.3 设计哲学

> **"LLM 是写手，不是项目经理。"**

- 流程控制：100% TypeScript 确定性代码
- 内容生成：100% LLM subagent
- 状态持久化：原子化 JSON 文件
- 失败隔离：单章节失败不阻塞整体

---

## 2. 设计目标与约束

### 2.1 设计目标

| 编号 | 目标 | 度量 |
|------|------|------|
| G1 | 支持 10~100 章长文档 | 章节数可配置 |
| G2 | 数据跨章节一致 | 基线机制 + Reviewer 核查 |
| G3 | 单任务失败不阻塞 | 失败隔离 + 自动重试 |
| G4 | 可中断可恢复 | 状态持久化到 JSON |
| G5 | 速率安全 | 令牌桶限流 |
| G6 | 多格式导出 | MD / HTML / DOCX |

### 2.2 约束

| 约束 | 说明 |
|------|------|
| C1 | 不依赖外部 LLM 服务 API（使用 pi subagent 机制） |
| C2 | 状态存储仅使用本地 JSON 文件（无数据库依赖） |
| C3 | 不修改 pi 核心代码，仅使用 Extension API |
| C4 | 所有代码 TypeScript，TDD 开发 |
| C5 | 本地分发（npm pack → pi install），不发布公共 npm |

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                     pi Extension API                            │
│  registerCommand('confwrite:init')                              │
│  registerCommand('confwrite:organize')                          │
│  registerCommand('confwrite:write')                             │
│  registerCommand('confwrite:status')                            │
│  registerCommand('confwrite:resume')                            │
│  registerCommand('confwrite:export')                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Command Layer (commands/)                     │
│                                                                 │
│  init.ts          organize.ts         export.ts                 │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐         │
│  │ 创建目录  │    │ 扫描→索引→    │    │ 组装→格式    │         │
│  │ 初始化状态│    │ 基线→映射→    │    │ 转换→输出    │         │
│  │ 生成模板  │    │ 素材包        │    │              │         │
│  └──────────┘    └───────────────┘    └──────────────┘         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  State Machine (orchestrator/)                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  phases.ts — 声明式阶段定义                              │    │
│  │                                                         │    │
│  │  0a → 0b → 1 → 2 → 3 → 4a → 4b → 4c → 4d → 5 → 6 → 7 → 8 → done │
│  │                                                         │    │
│  │  每个 Phase: validate() + execute() + exits[]           │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  state-machine.ts — 确定性状态机                         │    │
│  │                                                         │    │
│  │  tick():                                                │    │
│  │    1. 加载状态                                           │    │
│  │    2. 验证前置条件                                       │    │
│  │    3. 检查退出条件 → 自动推进                            │    │
│  │    4. 执行当前阶段                                       │    │
│  │    5. 返回 action                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│               Dispatcher (dispatcher/)  ← 新增                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  index.ts — Dispatcher                                  │    │
│  │                                                         │    │
│  │  dispatch(action, params):                              │    │
│  │    spawn_writers   → 读素材包 → 生成 prompt → 提交任务  │    │
│  │    spawn_reviewers → 读草稿 → 生成 prompt → 提交任务    │    │
│  │    spawn_fixers    → 读草稿+审阅 → 生成 prompt → 提交   │    │
│  │  processTask(taskId, outcome, result):                  │    │
│  │    标记完成/失败 → 更新章节状态 → 持久化                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│               Writing Pipeline (writing/)                        │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────────┐               │
│  │ orchestrator.ts   │    │ task-executor.ts      │               │
│  │                  │    │                       │               │
│  │ 生成写作任务      │───▶│ 组装 Writer prompt    │               │
│  │ 生成审阅任务      │    │ 组装 Reviewer prompt  │               │
│  │ 生成修复任务      │    │ 组装 Fixer prompt     │               │
│  │ 更新章节状态      │    │ 解析审阅决定          │               │
│  └──────────────────┘    └──────────────────────┘               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│               Scheduler (scheduler/)                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │ token-bucket  │  │ priority-    │  │ retry.ts         │      │
│  │              │  │ queue.ts     │  │                  │      │
│  │ 速率限制      │  │ 最小堆排序   │  │ 指数退避+抖动    │      │
│  │ 10 tokens    │  │ FIFO 保证    │  │ 5s → 10s → 20s  │      │
│  │ 0.5/s 补充   │  │              │  │ max 60s         │      │
│  └──────────────┘  └──────────────┘  └──────────────────┘      │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ index.ts — SubagentScheduler                           │     │
│  │                                                        │     │
│  │ submit(task) → enqueue → getReadyTasks() → dispatch   │     │
│  │ markRunning / markCompleted / markFailed               │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 源文件清单

```
src/
├── index.ts                          # Extension 入口，注册 6 个命令
├── state/
│   ├── schema.ts                     # TypeBox 类型定义 (ProjectState, ChapterState, etc.)
│   └── store.ts                      # 原子化 JSON 持久化 (write-to-temp → rename)
├── scheduler/
│   ├── types.ts                      # Task 类型 (TaskType/TaskStatus 从 schema re-export)
│   ├── token-bucket.ts               # 令牌桶限流器
│   ├── priority-queue.ts             # 最小堆优先级队列
│   ├── retry.ts                      # 指数退避重试引擎
│   ├── index.ts                      # SubagentScheduler 主类 (含 markRunning/markCompleted/markFailed)
│   ├── executor.ts                   # SubagentExecutor 接口 (隔离调度器与执行环境)
│   ├── mock-executor.ts              # MockSubagentExecutor (测试用，写模拟文件)
│   ├── pi-executor.ts                # PiSubagentExecutor (真实 pi SDK 桥接)
│   └── runner.ts                     # SchedulerRunner (执行循环: 就绪→执行→标记)
├── organize/
│   ├── scanner.ts                    # 资料文件扫描 + 自动分类 + 中文关键词提取
│   ├── converter.ts                  # HTML/PDF/DOCX → Markdown 转换 (mammoth + pdf-parse)
│   ├── indexer.ts                    # JSON 索引生成
│   ├── baseline-extractor.ts         # 数据基线提取
│   ├── outline-parser.ts             # 大纲解析 + ch 标记识别
│   ├── chapter-mapper.ts             # 章节-资料映射
│   ├── chapter-syncer.ts             # 大纲→状态自动同步 (G1)
│   └── kit-generator.ts              # 章节素材包生成 (scoped baseline)
├── writing/
│   ├── task-executor.ts              # Prompt 构建 + 审阅结果解析 (JSON + free text fallback)
│   └── orchestrator.ts               # 写作阶段编排器 (lastReviewVerdict 过滤)
├── dispatcher/
│   └── index.ts                      # Dispatcher: action → 读素材 → 生成 prompt → 提交任务 → 处理结果
├── assemble/
│   ├── assembler.ts                  # 章节组装器
│   ├── converter.ts                  # Markdown → HTML/DOCX/PDF 转换 (execFileSync 安全调用)
│   └── finalizer.ts                  # 定稿处理 (统计+一致性检查) (G5)
├── orchestrator/
│   ├── phases.ts                     # 14 个阶段声明式定义
│   └── state-machine.ts              # 确定性状态机
├── commands/
│   ├── init.ts                       # /confwrite:init (ESM 兼容)
│   ├── organize.ts                   # /confwrite:organize
│   └── export.ts                     # /confwrite:export (ESM 兼容)
├── knowledge/
│   └── loader.ts                     # 知识库加载器 (图表规范/选型指南/Writer注入)
└── utils/
    └── paths.ts                      # 路径安全工具 (防遍历 + validateShellSafe)
```

---

## 4. 模块详细设计

### 4.1 状态管理 (state/)

#### 4.1.1 Schema (schema.ts)

使用 TypeBox 定义所有状态的 JSON Schema，保证类型安全和运行时验证。

**核心类型**：

```typescript
// 项目状态（根对象）
ProjectState {
  version: number;              // Schema 版本号，用于迁移
  project: string;              // 项目 slug
  projectDir: string;           // 项目目录绝对路径
  currentPhase: Phase;          // 当前阶段 (0a/0b/1/2/3/4a/4b/4c/4d/5/6/7/8/done)
  status: ProjectStatus;        // 项目状态 (init/organizing/writing/reviewing/done/...)
  chapters: Record<string, ChapterState>;  // 章节状态映射
  round: number;                // 当前写作轮次
  scheduler: SchedulerState;    // 调度器状态（令牌桶等）
  tasks: SubagentTask[];        // 任务列表
  executionLog: LogEntry[];     // 执行日志
}

// 章节状态
ChapterState {
  id: string;                   // ch001, ch002, ...
  title: string;                // 章节标题
  status: ChapterStatus;        // pending → writing → written → reviewing → reviewed → completed
  lastReviewVerdict?: 'accept' | 'revise' | 'reject';  // 审阅结果
  round: number;                // 当前轮次
  attempt: number;              // 尝试次数
  outlineSection?: string;      // 大纲中的章节内容
  parentChapter?: string;       // 父章节 ID
  spawnLevel?: number;          // spawn 粒度层级
}

// 章节状态流转
ChapterStatus:
  pending → writing → written → reviewing → reviewed → fixing → fixed → written → ... → completed
                                                                                      ↘ failed
                                                                                      ↘ skipped
```

**设计决策**：
- 使用 TypeBox 而非手写 interface → 运行时验证 + 自动生成 JSON Schema
- 章节状态用 `Record<string, ChapterState>` 而非数组 → O(1) 查找
- `executionLog` 追加写入 → 完整的审计追踪

#### 4.1.2 Store (store.ts)

```typescript
class ProjectStore {
  constructor(projectDir: string);
  load(): ProjectState | null;    // 读取 project-state.json
  save(state: ProjectState): void; // 原子化写入
}
```

**原子化写入策略**：
```
1. JSON.stringify(state, null, 2)
2. writeFileSync(tempPath, content)     // 写入临时文件
3. renameSync(tempPath, targetPath)     // 原子重命名
```

这保证了即使进程崩溃，也不会出现半写状态。

---

### 4.2 调度器系统 (scheduler/)

#### 4.2.1 令牌桶 (token-bucket.ts)

```
容量: 10 tokens
补充速率: 0.5 tokens/秒 (每 2 秒补充 1 个)

用途: 控制 LLM API 调用频率，避免触发限流

API:
  consume(): boolean          // 尝试消费 1 个 token
  waitForToken(timeout): Promise<void>  // 等待直到有 token
  serialize() / deserialize() // 持久化状态
```

#### 4.2.2 优先级队列 (priority-queue.ts)

```
数据结构: 最小堆 (Min-Heap)
排序规则: priority ASC → sequence ASC (FIFO 保证)

API:
  enqueue(item): void
  dequeue(): T | undefined
  peek(): T | undefined
  size: number
  serialize() / deserialize()
```

#### 4.2.3 重试引擎 (retry.ts)

```
策略: 指数退避 + 随机抖动

delay = min(baseDelay * multiplier^attempt, maxDelay) + jitter
jitter = random(0, delay * 0.5)

默认配置:
  baseDelay: 5000ms
  multiplier: 2
  maxDelay: 60000ms
  maxRetries: 3
  jitter: true

示例延迟序列:
  第 1 次重试: ~5s (5000 ± 2500ms)
  第 2 次重试: ~10s (10000 ± 5000ms)
  第 3 次重试: ~20s (20000 ± 10000ms)
```

#### 4.2.4 调度器主类 (index.ts)

```typescript
class SubagentScheduler {
  submit(task: Task): void;           // 提交任务
  list(): Task[];                      // 列出所有任务
  getReadyTasks(): Task[];             // 获取就绪任务（依赖已满足）
  markRunning(id: string): void;       // 标记为运行中
  markCompleted(id: string, result): void;  // 标记为完成
  markFailed(id: string, error): void;      // 标记为失败
  pause() / resume(): void;            // 暂停/恢复
  serialize() / deserialize(): void;   // 持久化
}
```

**当前实现状态**：
- ✅ 任务提交、队列管理、优先级排序
- ✅ 令牌桶、重试引擎
- ✅ 依赖检查（`getReadyTasks` 检查 `dependencies` 是否全部 completed）
- ✅ 暂停/恢复、序列化/反序列化
- ✅ 生命周期管理（`markRunning` / `markCompleted` / `markFailed`）
- ✅ dispatch 循环由 Dispatcher 层实现（见 §4.7）
- ✅ 与 pi subagent API 的集成由 Dispatcher.processTask() 处理

---

### 4.3 素材组织系统 (organize/)

#### 4.3.1 处理管线

```
reference_material/
        │
        ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Scanner     │────▶│  Converter   │────▶│  Indexer     │
│             │     │              │     │              │
│ 递归扫描     │     │ PDF→MD       │     │ JSON 索引    │
│ 自动分类     │     │ DOCX→MD      │     │ 按分类分组    │
│ 提取元数据   │     │ HTML→MD      │     │ 关键词提取    │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                      ┌─────────────────────────┤
                      ▼                         ▼
              ┌──────────────┐         ┌──────────────┐
              │ Baseline     │         │ Outline      │
              │ Extractor    │         │ Parser       │
              │              │         │              │
              │ 提取指标      │         │ 解析 ch 标记  │
              │ 提取术语      │         │ 构建章节树    │
              │ 提取需求      │         │              │
              └──────┬───────┘         └──────┬───────┘
                     │                        │
                     └────────┬───────────────┘
                              ▼
                     ┌──────────────┐
                     │ Chapter      │
                     │ Mapper       │
                     │              │
                     │ 章节→资料映射 │
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐
                     │ Kit          │
                     │ Generator    │
                     │              │
                     │ 生成素材包    │
                     │ ch001.md     │
                     │ ch002.md     │
                     │ ...          │
                     └──────────────┘
```

#### 4.3.2 各模块职责

| 模块 | 输入 | 输出 | 关键逻辑 |
|------|------|------|----------|
| **Scanner** | `reference_material/` 目录 | `MaterialFile[]` | 递归扫描、按目录/文件名自动分类、提取标题/关键词/摘要 |
| **Converter** | PDF/DOCX/HTML 文件 | Markdown 文件 | 格式转换（当前为桩实现，需集成实际转换库） |
| **Indexer** | `MaterialFile[]` | `IndexData` (JSON) | 按分类分组、提取全局关键词、生成可搜索索引 |
| **BaselineExtractor** | `MaterialFile[]` (读取完整文件) | `DataBaseline` (JSON) | 正则提取百分比/数字/日期/技术术语/需求 |
| **OutlineParser** | `outline.md` 内容 | `OutlineNode` 树 | 解析 Markdown 标题层级、识别 `chXXX` 标记、构建章节树 |
| **ChapterMapper** | `OutlineNode` + `IndexData` | `ChapterMapping[]` | 关键词匹配 + 分类匹配 + fallback 分配 |
| **KitGenerator** | `ChapterMapping[]` + `DataBaseline` | `chXXX.md` 文件 | 生成包含章节信息/相关文件/关键数据/写作提示的素材包（baseline 按章节范围裁剪） |

#### 4.3.3 素材包内容格式

```markdown
# ch001 素材包：系统概述

## 章节信息
- **章节 ID**: ch001
- **标题**: 系统概述
- **相关分类**: 技术, 业务

## 相关文件
共 3 个相关文件：
- **api-spec.md** (技术)
  - 摘要: API 规范文档...

## 关键数据
- **系统可用性**: 99.99%
- **响应时间**: < 100ms

## 技术术语
Kubernetes, PostgreSQL, Redis, RabbitMQ

## 需求要点
- 必须支持多租户架构
- 需要实现细粒度的权限控制

## 写作提示
1. 仔细阅读相关文件
2. 确保使用正确的技术术语
3. 引用关键数据时保持一致性
```

---

### 4.4 写作管线 (writing/)

#### 4.4.1 TaskExecutor (task-executor.ts)

**职责**：为每种类型的 subagent 构建 prompt，并解析 subagent 的输出。

**Writer Prompt 结构**：

```
# 写作任务

你需要撰写章节 **ch001** 的内容。

## 素材包
{chapter-kit-content}          ← 来自 assets/chapter-kits/ch001.md

## 写作要求
1. 严格遵循素材包
2. 数据一致性
3. 术语准确
4. 覆盖需求
5. 结构清晰
6. 引用来源

## 输出格式
将完成的章节内容写入文件：drafts/chapters/ch001.md

## 注意事项
- 不要编造数据
- 信息不足时标注 [需要补充: xxx]
```

**Reviewer Prompt 结构**：

```
# 审阅任务

你需要审阅章节 **ch001** 的内容。

## 章节内容
{chapter-draft-content}        ← 来自 drafts/chapters/ch001.md

## 数据基线
### 关键指标
{metrics from data-baseline.json}
### 技术术语
{terms from data-baseline.json}
### 需求要点
{requirements from data-baseline.json}

## 审阅标准
1. 数据一致性
2. 术语准确性
3. 需求覆盖
4. 内容准确性
5. 结构清晰度
6. 文字质量

## 输出格式
将审阅报告写入文件：review/ch001-review.md

## 决定标准
- accept: 质量达标
- revise: 有小问题，需修改
- reject: 质量问题严重，需重写
```

**审阅结果解析**：

```typescript
parseReviewDecision(reviewOutput: string): ReviewDecision {
  // 从审阅报告中提取:
  // 1. 决定 (accept/reject/revise) — 正则匹配 "**决定**: xxx"
  // 2. 置信度 — 从评分计算 (平均分/10)
  // 3. 原因列表 — 从"问题列表"段落提取
}
```

#### 4.4.2 WritingOrchestrator (orchestrator.ts)

**职责**：协调 write → review → fix 循环。

```typescript
class WritingOrchestrator {
  generateWritingTasks(state): Task[]    // 为 pending 章节生成 writer 任务
  generateReviewTasks(state): Task[]     // 为 written 章节生成 reviewer 任务
  generateFixTasks(state): Task[]        // 仅为 lastReviewVerdict === 'revise' 的章节生成 fixer 任务
  updateChapterStatus(state, task, outcome): void  // 更新章节状态 + lastReviewVerdict
  isWritingPhaseComplete(state): boolean // 所有章节 completed?
  getNextAction(state): NextAction       // 下一步动作
}
```

**Write-Review-Fix 状态流转**：

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
pending ──▶ writing ──▶ written ──▶ reviewing ──▶ reviewed │
                                            │              │
                                    ┌───────┼───────┐      │
                                    ▼       ▼       ▼      │
                                 accept   revise   reject  │
                                    │       │       │      │
                                    ▼       ▼       ▼      │
                                 completed  │    pending ───┘
                                   ✅       │    (round+1)
                                            ▼
                                         fixing ──▶ fixed ──▶ written
                                                                    │
                                                                    ▼
                                                              重新审阅

**lastReviewVerdict 字段**：

ChapterState 新增 `lastReviewVerdict` 字段（可选），记录审阅结果：
- `'accept'` → 章节标记为 completed
- `'revise'` → 章节保持 reviewed，生成 fix 任务
- `'reject'` → 章节重置为 pending，round+1，重新写作
```

---

### 4.5 组装与导出 (assemble/)

#### 4.5.1 ChapterAssembler (assembler.ts)

```typescript
class ChapterAssembler {
  assemble(projectDir, chapterOrder, options?): AssemblyResult
  save(result, outputPath): void
  listChapters(projectDir): string[]
}
```

**功能**：
- 按 `chapterOrder` 顺序读取 `drafts/chapters/chXXX.md`
- 可选添加文档标题、目录 (TOC)、分页符
- 计算统计信息（章节数、字数、字符数）
- 处理缺失章节（生成警告但不中断）

#### 4.5.2 FormatConverter (converter.ts)

```typescript
class FormatConverter {
  convertToHtml(mdPath, options?): HtmlConversionResult
  saveHtml(result, outputPath): void
  generateConversionCommand(input, output, format, options?): string
  checkDependencies(): Record<string, DependencyInfo>
}
```

**内置转换**：Markdown → HTML（自带 CSS 样式）

**外部转换**：Markdown → DOCX/PDF（生成 pandoc 命令）

---

### 4.6 状态机 (orchestrator/)

#### 4.6.1 Phase 定义 (phases.ts)

14 个阶段，每个阶段声明式定义：

```typescript
interface PhaseDefinition {
  id: Phase;                           // '0a', '0b', '1', ...
  name: string;                        // '项目初始化', '素材整理', ...
  validate: (ctx) => ValidationResult; // 前置条件检查
  execute: (ctx) => PhaseResult;       // 阶段逻辑，返回 action
  exits: Transition[];                 // 退出条件 → 目标阶段
}
```

**阶段流转图**：

```
0a ──▶ 0b ──▶ 1 ──▶ 2 ──▶ 3 ──▶ 4a ──┐
(初始化) (整理) (需求) (大纲) (素材) (写作) │
                                         │
                              ┌──────────┘
                              ▼
                    ┌─── 4b ◀───────┐
                    │   (审阅)       │
                    │               │
              ┌─────┼─────┐         │
              ▼     ▼     ▼         │
           accept revise reject     │
              │     │     │         │
              │     ▼     │         │
              │   4d ─────┘         │
              │  (修复)             │
              │     │               │
              │     └──▶ 回到 4b ───┘
              ▼
            4c
          (决策)
              │
              ▼
            5 ──▶ 6 ──▶ 7 ──▶ 8 ──▶ done
          (图表) (组装) (定稿) (导出)
```

**各阶段退出条件**：

| Phase | 退出条件 | 目标 |
|-------|----------|------|
| 0a | status === 'init' | → 0b |
| 0b | 素材已整理 (baseline + index 存在) | → 2 |
| 1 | requirements.md 存在 | → 2 |
| 2 | outline.md 存在 + 素材已整理 | → 4a |
| 2 | outline.md 存在 + 素材未整理 | → 3 |
| 3 | 素材已整理 | → 4a |
| 4a | 所有章节 status ∈ {written, completed, failed, skipped} | → 4b |
| 4b | 所有章节 status ∉ {written, reviewing} | → 4c |
| 4c | 有 revise 章节 (lastReviewVerdict) | → 4d |
| 4c | 有 reject 章节 (lastReviewVerdict) | → 4a |
| 4c | 所有章节 completed/skipped/failed | → 5 |
| 4d | 无需修复的章节 | → 4b |
| 5 | 图表完成 | → 6 |
| 6 | 组装完成 | → 7 |
| 7 | 定稿完成 | → 8 |
| 8 | 导出完成 | → done |

#### 4.6.2 StateMachine (state-machine.ts)

```typescript
class StateMachine {
  constructor(projectDir: string);
  async tick(): Promise<TickResult>;   // 推进一步
  status(): StatusInfo | null;         // 当前状态
  getStore(): ProjectStore;            // 获取 store 实例
}
```

**tick() 核心逻辑**：

```
tick():
  1. state = store.load()
  2. definition = phases.get(state.currentPhase)
  3. validation = definition.validate(ctx)
     if (!validation.ok) → return BlockedResult
  4. for exit of definition.exits:
       if exit.condition(ctx):
         advance(exit.target)
         return StepResult { advanced: true }
  5. result = definition.execute(ctx)
  6. return StepResult { action: result.action, params: result.params }
```

---

### 4.7 命令层 (commands/)

| 命令 | 文件 | 功能 | 实现状态 |
|------|------|------|----------|
| `/confwrite:init` | init.ts | 创建项目结构 + 初始化状态 | ✅ 完整 |
| `/confwrite:organize` | organize.ts | 扫描→索引→基线→映射→素材包 | ✅ 完整 |
| `/confwrite:write` | (index.ts) | 状态机 tick() → Dispatcher dispatch() | ✅ 完整 |
| `/confwrite:status` | (index.ts) | 读取状态并展示 | ✅ 完整 |
| `/confwrite:resume` | (index.ts) | 等同于 write | ✅ 完整 |
| `/confwrite:export` | export.ts | 组装 + 格式转换 | ✅ 完整 |

---

### 4.7 Dispatcher 层 (dispatcher/)

#### 4.7.1 Dispatcher (index.ts)

**职责**：连接状态机 action 与实际 subagent 执行。是写作管线中唯一知道“如何调用 pi subagent”的模块。

```typescript
class Dispatcher {
  constructor(
    projectDir: string,
    store: ProjectStore,
    scheduler: SubagentScheduler,
    taskExecutor: TaskExecutor,
    writingOrchestrator: WritingOrchestrator,
  ) {}

  async dispatch(action: string, params: Record<string, unknown>): Promise<DispatchResult>;
  async processTask(taskId: string, outcome: 'completed' | 'failed', result?: string): Promise<void>;
}
```

**dispatch 流程**：

```
dispatch('spawn_writers', { chapters: ['ch001', 'ch002'] })
    │
    ├─ 1. 读取每个章节的素材包
    │     assets/chapter-kits/ch001-kit.md
    │     assets/chapter-kits/ch002-kit.md
    │
    ├─ 2. 调用 taskExecutor.generateWriterPrompt(task, kitContent)
    │
    ├─ 3. 创建 Task 对象，提交到 scheduler.submit(task)
    │
    ├─ 4. 更新章节状态 → writing
    │
    └─ 5. 返回 DispatchResult { submitted: 2, tasks: [...] }
```

**processTask 流程**：

```
processTask('task-001', 'completed', resultText)
    │
    ├─ 1. scheduler.markCompleted(taskId, result)
    │
    ├─ 2. writingOrchestrator.updateChapterStatus(state, task, { outcome, result })
    │
    └─ 3. store.save(state)
```

**支持的 action**：

| Action | 读取内容 | 生成 Prompt | 提交任务 |
|--------|----------|-------------|----------|
| `spawn_writers` | chapter-kit | Writer prompt | writer task |
| `spawn_reviewers` | chapter draft | Reviewer prompt | reviewer task |
| `spawn_fixers` | chapter draft + review | Fixer prompt | fixer task |
| `generate_diagrams` | 草稿中的 `<!-- diagram-start -->` 块 | Mermaid prompt | diagram task |
| `assemble` | (由 Assembler 处理) | - | - |

#### 4.7.2 与 pi subagent 的集成

Dispatcher 当前实现了任务创建、提交和结果处理的完整逻辑。pi subagent 的实际 spawn 调用需要在 `/confwrite:write` handler 中完成：

```typescript
// 在 handler 中
const tasks = scheduler.getReadyTasks();
for (const task of tasks) {
  scheduler.markRunning(task.id);
  // 调用 pi subagent spawn
  const result = await spawnSubagent(task.prompt);
  await dispatcher.processTask(task.id, 'completed', result);
}
```

---

### 4.8 命令层 (commands/)

| 命令 | 文件 | 功能 | 实现状态 |
|------|------|------|----------|
| `/confwrite:init` | init.ts | 创建项目结构 + 初始化状态 | ✅ 完整 |
| `/confwrite:organize` | organize.ts | 扫描→索引→基线→映射→素材包 | ✅ 完整 |
| `/confwrite:write` | (index.ts) | 状态机 tick() → Dispatcher dispatch() | ✅ 完整 |
| `/confwrite:status` | (index.ts) | 读取状态并展示 | ✅ 完整 |
| `/confwrite:resume` | (index.ts) | 恢复中断项目 | ✅ 完整 |
| `/confwrite:compact` | (index.ts) | 手动压缩上下文 | ✅ 完整 |
| `/confwrite:export` | export.ts | 组装 + 格式转换 | ✅ 完整 |

---

### 4.9 Extension 入口 (index.ts)

注册 7 个命令到 pi Extension API。

**`/confwrite:write` handler 逻辑**：

```typescript
handler: async (args, ctx) => {
  const machine = new StateMachine(projectDir);
  const result = await machine.tick();

  if (result.blocked) {
    ctx.ui.notify(`⛔ ${result.error}`, 'error');
    return;
  }

  ctx.ui.notify(`📝 [${result.phase}] ${result.message}`, 'info');

  // 通过 Dispatcher 执行 action
  const dispatcher = new Dispatcher(projectDir, machine.getStore(), scheduler, taskExecutor, writingOrchestrator);
  await dispatcher.dispatch(result.action, result.params);
}
```

---

## 5. 数据流设计

### 5.1 完整数据流

```
用户操作                    文件系统                      状态变更
─────────────────────────────────────────────────────────────────────

/confwrite:init             projects/slug/                currentPhase: '0a'
                            ├── inputs/                   status: 'init'
                            ├── reference_material/
                            ├── assets/
                            ├── outline.md (模板)
                            └── project-state.json

用户放入资料               reference_material/
                            ├── api-spec.md
                            ├── arch.pdf
                            └── req.docx

/confwrite:organize         assets/
                            ├── indexes/index.json        status: 'organizing'
                            ├── data-baseline.json
                            ├── chapter-kits/ch001.md
                            ├── chapter-kits/ch002.md
                            └── references-index.md

用户编写大纲               outline.md
                            # 技术方案
                            ch001 1.1 概述
                            ch002 1.2 架构
                            ...

/confwrite:organize         assets/chapter-kits/          (重新生成素材包)
                            ├── ch001.md (含映射)
                            └── ch002.md (含映射)

/confwrite:write            (状态机 tick)                 currentPhase: '4a'
                            → action: spawn_writers       status: 'writing'
                            → Dispatcher.dispatch()
                            → 读素材包 → 生成 prompt → 提交任务
                            → pi subagent spawn
                            drafts/chapters/ch001.md      chapters.ch001.status: 'written'
                            drafts/chapters/ch002.md      chapters.ch002.status: 'written'

(审阅流程)
                            Dispatcher.dispatch('spawn_reviewers')
                            → 读草稿 → 生成审阅 prompt → 提交 reviewer 任务
                            review/ch001-review.md        chapters.ch001.lastReviewVerdict: 'accept'
                                                          chapters.ch001.status: 'completed'
                            review/ch002-review.md        chapters.ch002.lastReviewVerdict: 'revise'
                                                          chapters.ch002.status: 'reviewed'

/confwrite:export           output/document.md            currentPhase: 'done'
                            output/document.html
                            output/document.docx
```

### 5.2 素材包数据流

```
reference_material/*.md ──┐
                          ├──▶ Scanner.scan()
reference_material/*.pdf ─┘         │
                                    ▼
                            MaterialFile[]
                            (filename, category, keywords, summary)
                                    │
                          ┌─────────┤
                          ▼         ▼
                    Indexer     BaselineExtractor
                          │         │
                          ▼         ▼
                    IndexData   DataBaseline
                    (分类索引)   (指标/术语/需求)
                          │         │
                          ▼         │
                    OutlineParser   │
                    (outline.md)    │
                          │         │
                          ▼         │
                    ChapterMapper ◀─┘
                    (章节→资料映射)
                          │
                          ▼
                    KitGenerator
                          │
                          ▼
                    assets/chapter-kits/chXXX.md
```

---

## 6. 关键设计决策

### 6.1 确定性状态机 vs LLM 驱动

**决策**：流程控制 100% TypeScript，LLM 仅生成内容。

**理由**：
- LLM 驱动的 flow control 不可靠（可能跳步、遗忘、幻觉）
- 状态机可测试、可预测、可恢复
- 用户随时可以检查 `project-state.json` 了解进度

**代价**：
- 需要为每个 Phase 手写 validate/execute/exits 逻辑
- 灵活性降低（新增阶段需要修改代码）

### 6.2 章节素材包 vs 全局上下文

**决策**：每个章节有独立的素材包文件，而非所有资料放在一个全局索引中。

**理由**：
- 防止上下文溢出（每个 Writer 只看到自己需要的资料）
- 数据一致性（素材包引用基线中的数字）
- 可审计（素材包是 Markdown 文件，人类可读）

**代价**：
- 需要额外的映射步骤（ChapterMapper）
- 素材包可能遗漏相关资料（映射不完美）

### 6.3 JSON 文件存储 vs 数据库

**决策**：使用 JSON 文件存储所有状态。

**理由**：
- 零依赖（不需要 SQLite/Redis）
- 人类可读可编辑（用户可以直接修改 project-state.json）
- Git 友好（可以 diff/merge 状态变更）
- 原子化写入（write-temp → rename）足够安全

**代价**：
- 不适合高并发写入（但本项目不需要）
- 大项目时 JSON 文件可能较大（但通常 < 1MB）

### 6.4 令牌桶 vs 简单限流

**决策**：使用令牌桶算法控制 subagent 调用频率。

**理由**：
- 允许突发（桶满时可以连续调用）
- 平滑限流（不会突然阻塞）
- 可持久化（进程重启后恢复令牌状态）

### 6.5 失败隔离 vs 全局中止

**决策**：单章节失败不阻塞其他章节。

**理由**：
- 长文档写作中，单章问题不应影响全局
- 失败章节可以单独重试
- 用户可以手动干预后继续

---

## 7. 已识别的架构问题

### 7.1 ✅ 已解决：Dispatcher 层已实现

**状态**：Sprint 3.1-3.2 已实现 `src/dispatcher/index.ts`，包含：
- `dispatch(action, params)` — 读取素材包/草稿/审阅报告，生成 prompt，提交任务
- `processTask(taskId, outcome, result)` — 处理 subagent 结果，更新章节状态
- 完整测试覆盖（19 个测试）

### 7.2 ✅ 已解决：类型统一

**状态**：Sprint 2.1 已统一 TaskType/TaskStatus，scheduler/types.ts 从 schema.ts re-export。

### 7.3 ✅ 已解决：写作循环逻辑修复

**状态**：Sprint 2.3-2.4 已修复：
- `generateFixTasks()` 仅处理 `lastReviewVerdict === 'revise'` 的章节
- Phase 4c 使用 `lastReviewVerdict` 判断退出方向
- reject 章节在 4c execute 阶段即被处理（status=pending, round+1）

### 7.4 ✅ 已解决：安全问题修复

**状态**：Sprint 1.3-1.4 已修复：
- `JSON.parse(task.result)` 增加 try-catch + free text fallback
- `execSync(cmd)` 替换为 `execFileSync('pandoc', args[])`
- 新增 `validateShellSafe()` 防止命令注入

### 7.5 ✅ 已解决：Converter 真实转换

**状态**：已集成 `mammoth` (DOCX→HTML→MD) + `pdf-parse` v2 (PDF→text)。10 个测试覆盖。

### 7.6 ✅ 已解决：章节定义自动同步

**状态**：`chapter-syncer.ts` 实现大纲→状态自动同步。在 `/confwrite:organize` 中自动调用。9 个测试覆盖。

### 7.7 🟢 低：HTML 转换器功能有限

**问题描述**：

内置的 Markdown → HTML 转换器是简单正则实现，不支持所有 Markdown 语法。

**建议**：后续可集成 `marked` 或 `markdown-it` 库。

---

## 8. 测试覆盖

### 8.1 测试统计

```
Test Files:  51 passed (51)
Tests:       433 passed (433)
Duration:    ~7s
TypeScript:  ✅ 编译通过 (npx tsc --noEmit)
```

### 8.2 按模块分布

| 模块 | 测试文件 | 测试数 | 覆盖范围 |
|------|----------|--------|----------|
| state/ | store.test.ts | 13 | 加载/保存/原子化/并发 |
| scheduler/ | token-bucket.test.ts | 15 | 消费/等待/超时/序列化 |
| scheduler/ | priority-queue.test.ts | 11 | 入队/出队/优先级/FIFO/序列化 |
| scheduler/ | retry.test.ts | 11 | 重试判断/退避/上限/抖动/等待 |
| scheduler/ | index.test.ts | 13 | 提交/就绪/依赖/暂停/序列化 |
| organize/ | outline-parser.test.ts | 10 | 解析/ch标记/层级/查找 |
| organize/ | scanner.test.ts | 13 | 扫描/分类/元数据/递归 |
| organize/ | converter.test.ts | 10 | HTML/DOCX(mammoth)/PDF(pdf-parse)转换 |
| organize/ | indexer.test.ts | 10 | 索引/分类/关键词/搜索 |
| organize/ | baseline-extractor.test.ts | 10 | 提取指标/术语/需求/验证 |
| organize/ | chapter-mapper.test.ts | 9 | 映射/关键词/分类/摘要 |
| organize/ | kit-generator.test.ts | 10 | 生成/保存/批量/统计 |
| writing/ | task-executor.test.ts | 12 | Writer/Reviewer/Fixer prompt + 解析 |
| writing/ | orchestrator.test.ts | 21 | 任务生成/状态更新/完成判断/动作决策 |
| assemble/ | assembler.test.ts | 12 | 组装/分页/TOC/统计/缺失处理 |
| assemble/ | converter.test.ts | 12 | HTML转换/样式/表格/代码块/pandoc命令 |
| commands/ | init.test.ts | 8 | 创建/初始化/重复/非法slug |
| commands/ | organize.test.ts | 9 | 全流程/空目录/无大纲 |
| commands/ | export.test.ts | 10 | MD/HTML/DOCX/PDF/TOC/统计 |
| e2e/ | organize-pipeline.test.ts | 4 | 端到端流水线 |
| utils/ | paths.test.ts | 16 | slug验证/章节ID/路径安全/shell安全 |
| orchestrator/ | state-machine.test.ts | 11 | tick/推进/阻塞/验证 |
| dispatcher/ | dispatch.test.ts | 11 | action路由/素材包读取/prompt生成 |
| dispatcher/ | subagent-integration.test.ts | 8 | processTask/状态回写/完整写作循环 |
| organize/ | kit-scoped-baseline.test.ts | 5 | baseline范围裁剪 |
| organize/ | chinese-keywords.test.ts | 5 | 中文关键词提取 |
| writing/ | review-parse.test.ts | 10 | JSON+free text解析 |
| commands/ | init-material-copy.test.ts | 4 | 素材复制递归 |
| commands/ | export-esm.test.ts | 4 | ESM兼容性 |
| assemble/ | converter-security.test.ts | 8 | shell安全 |
| types/ | consistency.test.ts | 5 | 类型统一 |
| scheduler/ | mark-lifecycle.test.ts | 7 | markRunning/markCompleted/markFailed |
| writing/ | fix-task-filter.test.ts | 8 | lastReviewVerdict过滤 |
| orchestrator/ | phase4c-mixed.test.ts | 6 | Phase 4c混合场景 |
| orchestrator/ | phase5-exit.test.ts | 4 | Phase 5退出条件 |
| diagrams/ | extractor.test.ts | 7 | mermaid 代码块提取 |
| diagrams/ | pipeline.test.ts | 6 | 完整管线 |
| knowledge/ | loader.test.ts | 11 | 知识库加载/分类/注入 |
| scheduler/ | runner.test.ts | 8 | 执行循环/并发/mock |
| e2e/ | full-pipeline.test.ts | 5 | init→organize→write→review→assemble→export |
| organize/ | chapter-syncer.test.ts | 9 | 大纲→状态同步/新增/移除/保护 |
| assemble/ | finalizer.test.ts | 7 | 定稿统计/一致性检查/报告生成 |
| e2e/ | h5-mock-trial.test.ts | 6 | H5 模拟试用: init→finalize→export |
| e2e/ | h5-full-simulation.test.ts | 6 | H5 全流程: G1/G2/G5 集成验证 |

### 8.3 未覆盖区域

| 区域 | 原因 |
|------|------|
| ~~pi subagent 实际 spawn~~ | ~~已实现 SubagentExecutor 桥接~~ |
| ~~PDF/DOCX 转换~~ | ~~已实现 (mammoth + pdf-parse)~~ |
| ~~Phase 5 图表生成~~ | ~~已实现~~ |
| ~~全量端到端测试~~ | ~~已实现 (init→export)~~ |
| ~~H5 模拟试用~~ | ~~已实现 (12 tests, 含 G1/G2/G5)~~ |

---

## 9. 附录

### 9.1 项目目录结构

```
confidenceWriter/
├── src/                          # 源代码 (35 个 TypeScript 文件)
├── tests/                        # 测试代码 (51 个测试文件, 433 个测试用例)
├── knowledge/diagrams/           # 图表知识库 (15 个 Markdown 文件)
├── examples/                     # 示例项目 + prompt 示例
├── package.json                  # 包配置
├── tsconfig.json                 # TypeScript 配置
├── vitest.config.ts              # Vitest 测试配置
├── README.md                     # 项目说明
├── SKILL.md                      # pi Skill 定义
├── USAGE.md                      # 使用说明
├── DESIGN.md                     # 本文档
├── CHANGELOG.md                  # 变更日志
├── LICENSE                       # MIT 许可证
└── .editorconfig                 # 编辑器配置
```

### 9.2 依赖清单

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@sinclair/typebox` | ^0.32.0 | JSON Schema 类型定义 |
| `mammoth` | ^1.8.0 | DOCX→HTML 转换 |
| `pdf-parse` | ^2.4.0 | PDF 文本提取 |
| `sharp` | ^0.33.0 | 图片处理 (SVG→PNG) |

| 开发依赖 | 版本 | 用途 |
|------|------|------|
| `typescript` | ^5.3.0 | 编译器 |
| `vitest` | ^1.0.0 | 测试框架 |
| `@types/node` | ^20.0.0 | Node.js 类型 |

### 9.3 命令速查

```
/confwrite:init <slug> [material-dir]    初始化项目
/confwrite:organize [project-dir]        整理素材
/confwrite:write [project-dir]           推进写作（含自动 context compaction）
/confwrite:status [project-dir]          查看进度
/confwrite:resume [project-dir]          恢复中断项目
/confwrite:compact                       手动压缩上下文
/confwrite:export <format> [output-path] 导出文档
```

### 9.4 状态文件示例

```json
{
  "version": 1,
  "project": "my-proposal",
  "projectDir": "/path/to/projects/my-proposal",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "lastUpdated": "2025-01-15T14:30:00.000Z",
  "currentPhase": "4a",
  "status": "writing",
  "chapters": {
    "ch001": {
      "id": "ch001",
      "title": "系统概述",
      "status": "completed",
      "round": 1,
      "attempt": 0
    },
    "ch002": {
      "id": "ch002",
      "title": "架构设计",
      "status": "reviewed",
      "lastReviewVerdict": "revise",
      "round": 1,
      "attempt": 0
    }
  },
  "round": 1,
  "scheduler": {
    "tokens": 8,
    "paused": false
  },
  "tasks": [],
  "executionLog": [
    { "time": "2025-01-15T10:00:00.000Z", "phase": "0a", "action": "Phase 0a → 0b" },
    { "time": "2025-01-15T10:05:00.000Z", "phase": "0b", "action": "Phase 0b → 2" },
    { "time": "2025-01-15T14:00:00.000Z", "phase": "4a", "action": "Phase 3 → 4a" }
  ]
}
```

---

> **文档版本**: v0.7.2 | 最后更新: 2025-06