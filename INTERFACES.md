# ConfWrite 模块接口文档 (Interfaces)

本文档描述了 ConfWrite 各模块之间的数据流和接口协议。

---

## 1. 数据流总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        素材组织管线                                    │
│                                                                     │
│  reference_material/                                                │
│        │                                                            │
│        ▼                                                            │
│  ┌──────────┐    MaterialFile[]    ┌──────────┐    IndexData       │
│  │ Scanner  │ ──────────────────▶  │ Indexer  │ ──────────▶ JSON  │
│  └──────────┘                      └──────────┘                     │
│        │                                │                          │
│        │ MaterialFile[]                 │                          │
│        ▼                                │                          │
│  ┌──────────────────┐   DataBaseline   │                          │
│  │ BaselineExtractor│ ──────────────▶ JSON                        │
│  └──────────────────┘                  │                          │
│                                        │                          │
│  outline.md                            │                          │
│        │                               │                          │
│        ▼                               │                          │
│  ┌────────────────┐   OutlineNode      │                          │
│  │ OutlineParser  │ ───────────┐       │                          │
│  └────────────────┘            │       │                          │
│                                ▼       ▼                          │
│                        ┌──────────────────┐                       │
│                        │ ChapterMapper    │                       │
│                        └────────┬─────────┘                       │
│                                 │ ChapterMapping[]                │
│                                 ▼                                 │
│                        ┌──────────────────┐                       │
│                        │ KitGenerator     │                       │
│                        └────────┬─────────┘                       │
│                                 │                                 │
│                                 ▼                                 │
│                    assets/chapter-kits/chXXX.md                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        写作管线                                       │
│                                                                     │
│  StateMachine.tick()                                                │
│        │                                                            │
│        ▼                                                            │
│  { action: 'spawn_writers', params: { chapters: [...] } }          │
│        │                                                            │
│        ▼ (需要 Dispatcher 实现)                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ Dispatcher                                               │      │
│  │                                                          │      │
│  │  1. 读取素材包                                           │      │
│  │  2. TaskExecutor.generateWriterPrompt(task, kitContent)  │      │
│  │  3. scheduler.submit(task)                               │      │
│  │  4. scheduler.getReadyTasks()                            │      │
│  │  5. pi subagent spawn                                    │      │
│  │  6. 更新章节状态                                          │      │
│  └──────────────────────────────────────────────────────────┘      │
│        │                                                            │
│        ▼                                                            │
│  drafts/chapters/chXXX.md  →  review/chXXX-review.md               │
│        │                              │                            │
│        └──────────────────────────────┘                             │
│                       │                                             │
│                       ▼                                             │
│              Write-Review-Fix 循环                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        导出管线                                       │
│                                                                     │
│  outline.md (读取章节顺序)                                           │
│        │                                                            │
│        ▼                                                            │
│  ┌────────────┐   AssemblyResult   ┌──────────────┐                │
│  │ Assembler  │ ─────────────────▶ │ Converter    │                │
│  └────────────┘                    └──────┬───────┘                │
│                                           │                         │
│                                    ┌──────┴──────┐                 │
│                                    ▼             ▼                 │
│                              output/        pandoc 命令             │
│                           .md / .html     (DOCX/PDF)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心接口定义

### 2.1 MaterialFile

**来源**: `src/organize/scanner.ts`  
**生产者**: `MaterialScanner.scan()`  
**消费者**: `IndexGenerator`, `BaselineExtractor`, `ChapterMapper`

```typescript
interface MaterialFile {
  /** 文件名 (e.g., "api-spec.md") */
  filename: string;
  /** 相对于扫描根目录的路径 */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件格式 */
  format: 'markdown' | 'pdf' | 'docx' | 'html';
  /** 文件大小（字节） */
  size: number;
  /** 标题（从 H1 或文件名提取） */
  title: string;
  /** 关键词（从内容提取） */
  keywords: string[];
  /** 摘要（从首段提取） */
  summary: string;
  /** 分类（从目录名或文件名推断） */
  category: string;
}
```

### 2.2 IndexData

**来源**: `src/organize/indexer.ts`  
**生产者**: `IndexGenerator.generate()`  
**消费者**: `ChapterMapper`, 保存为 `assets/indexes/index.json`

```typescript
interface IndexData {
  /** 总文件数 */
  totalFiles: number;
  /** 所有分类 */
  categories: string[];
  /** 所有关键词（去重） */
  keywords: string[];
  /** 按分类分组的文件 */
  byCategory: Record<string, MaterialFile[]>;
  /** 所有文件 */
  files: MaterialFile[];
  /** 生成时间 (ISO 8601) */
  generatedAt: string;
}
```

### 2.3 DataBaseline

**来源**: `src/organize/baseline-extractor.ts`  
**生产者**: `BaselineExtractor.extract()`  
**消费者**: `KitGenerator`, `TaskExecutor` (Reviewer prompt), 保存为 `assets/data-baseline.json`

```typescript
interface DataBaseline {
  /** 源文件数 */
  sourceFiles: number;
  /** 指标数据 (e.g., {"系统可用性": "99.99%"}) */
  metrics: Record<string, string>;
  /** 时间线数据 */
  timeline: Record<string, string>;
  /** 技术术语列表 */
  technicalTerms: string[];
  /** 需求列表 */
  requirements: string[];
  /** 生成时间 (ISO 8601) */
  generatedAt: string;
}
```

### 2.4 OutlineNode

**来源**: `src/organize/outline-parser.ts`  
**生产者**: `OutlineParser.parse()`  
**消费者**: `ChapterMapper`

```typescript
interface OutlineNode {
  /** 标题层级 (0=根, 1=H1, 2=H2, ...) */
  level: number;
  /** 标题文本 */
  title: string;
  /** 章节 ID (如果有 ch 标记) */
  id?: string;
  /** 是否作为 spawn 粒度 */
  spawnLevel?: boolean;
  /** 子节点 */
  children: OutlineNode[];
  /** 查找指定 ID 的章节 */
  findChapter(id: string): OutlineNode | undefined;
  /** 获取所有带 ID 的章节 */
  getAllChapters(): OutlineNode[];
}
```

### 2.5 ChapterMapping

**来源**: `src/organize/chapter-mapper.ts`  
**生产者**: `ChapterMapper.map()`  
**消费者**: `KitGenerator`

```typescript
interface ChapterMapping {
  /** 章节 ID */
  chapterId: string;
  /** 章节标题 */
  title: string;
  /** 相关文件列表 */
  relatedFiles: MaterialFile[];
  /** 相关分类 */
  relatedCategories: string[];
  /** 相关关键词 */
  relatedKeywords: string[];
}
```

### 2.6 Task

**来源**: `src/scheduler/types.ts`  
**生产者**: `WritingOrchestrator.generateWritingTasks()` 等  
**消费者**: `SubagentScheduler`, `TaskExecutor`, Dispatcher (待实现)

```typescript
interface Task {
  /** 唯一标识 (e.g., "write-ch001-r1") */
  id: string;
  /** 任务类型 */
  type: 'writer' | 'reviewer' | 'fixer' | 'diagram';
  /** 关联的章节 ID */
  chapterId?: string;
  /** 任务状态 */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying' | 'interrupted' | 'blocked' | 'skipped';
  /** 优先级 (数字越小越优先) */
  priority: number;
  /** 插入顺序 (FIFO 保证) */
  sequence: number;
  /** 尝试次数 */
  attempt: number;
  /** subagent 的 prompt */
  prompt: string;
  /** 依赖的其他任务 ID */
  dependencies: string[];
  /** 错误信息 (失败时) */
  error?: string;
  /** 任务结果 */
  result?: string;
  /** 开始时间 (timestamp) */
  startedAt?: number;
  /** 完成时间 (timestamp) */
  completedAt?: number;
}
```

### 2.7 ReviewDecision

**来源**: `src/writing/task-executor.ts`  
**生产者**: `TaskExecutor.parseReviewDecision()`  
**消费者**: `WritingOrchestrator.updateChapterStatus()`

```typescript
interface ReviewDecision {
  /** 审阅决定 */
  decision: 'accept' | 'reject' | 'revise';
  /** 置信度 (0-1) */
  confidence: number;
  /** 原因列表 */
  reasons: string[];
}
```

### 2.8 AssemblyResult

**来源**: `src/assemble/assembler.ts`  
**生产者**: `ChapterAssembler.assemble()`  
**消费者**: `exportDocument()`, `FormatConverter`

```typescript
interface AssemblyResult {
  /** 是否成功 */
  success: boolean;
  /** 组装后的完整文档内容 */
  content: string;
  /** 统计信息 */
  stats: {
    totalChapters: number;
    totalCharacters: number;
    totalWords: number;
  };
  /** 警告信息 (如缺失章节) */
  warnings: string[];
  /** 错误信息 (失败时) */
  error?: string;
}
```

---

## 3. 状态机接口

### 3.1 PhaseContext

**来源**: `src/orchestrator/phases.ts`  
**用途**: 传递给 Phase 的 `validate()` 和 `execute()` 方法

```typescript
interface PhaseContext {
  /** 当前项目状态 */
  state: ProjectState;
  /** 项目目录绝对路径 */
  projectDir: string;
}
```

### 3.2 PhaseResult

**来源**: `src/orchestrator/phases.ts`  
**用途**: Phase 的 `execute()` 方法返回值

```typescript
interface PhaseResult {
  /** 动作类型 (e.g., "spawn_writers", "advance") */
  action: string;
  /** 人类可读的消息 */
  message: string;
  /** 动作参数 */
  params?: Record<string, unknown>;
}
```

### 3.3 TickResult

**来源**: `src/orchestrator/state-machine.ts`  
**用途**: `StateMachine.tick()` 返回值

```typescript
// 正常步骤结果
interface StepResult {
  phase: Phase;
  phaseName: string;
  action: string;
  message: string;
  params?: Record<string, unknown>;
  /** 是否发生了阶段转换 */
  advanced: boolean;
  /** 之前的阶段 (如果发生了转换) */
  previousPhase?: Phase;
}

// 阻塞结果
interface BlockedResult {
  phase: Phase;
  phaseName: string;
  blocked: true;
  error: string;
}

type TickResult = StepResult | BlockedResult;
```

---

## 4. 章节状态流转

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
                                             │    (round+1)
                                             ▼
                                          fixing ──▶ written
                                                       │
                                                       ▼
                                                 重新审阅
```

---

## 5. 文件路径约定

| 路径 | 说明 |
|------|------|
| `projects/<slug>/` | 项目根目录 |
| `projects/<slug>/project-state.json` | 项目状态文件 |
| `projects/<slug>/outline.md` | 大纲文件 |
| `projects/<slug>/inputs/` | 需求文档目录 |
| `projects/<slug>/inputs/agent-instructions.md` | Agent 写作指引 |
| `projects/<slug>/reference_material/` | 原始参考资料 |
| `projects/<slug>/assets/indexes/index.json` | 资料索引 |
| `projects/<slug>/assets/data-baseline.json` | 数据基线 |
| `projects/<slug>/assets/chapter-kits/chXXX.md` | 章节素材包 |
| `projects/<slug>/assets/references-index.md` | 参考资料索引 |
| `projects/<slug>/drafts/chapters/chXXX.md` | 章节草稿 |
| `projects/<slug>/review/chXXX-review.md` | 审阅报告 |
| `projects/<slug>/output/` | 导出文件目录 |

---

## 6. 模块依赖关系

```
commands/
  ├── init.ts
  │     └── imports: state/store, utils/paths
  │
  ├── organize.ts
  │     └── imports: organize/* (scanner, converter, indexer, 
  │                              baseline-extractor, outline-parser,
  │                              chapter-mapper, kit-generator)
  │
  └── export.ts
        └── imports: assemble/* (assembler, converter)

orchestrator/
  ├── state-machine.ts
  │     └── imports: orchestrator/phases, state/store, state/schema
  │
  └── phases.ts
        └── imports: state/schema

writing/
  ├── task-executor.ts
  │     └── imports: scheduler/types
  │
  └── orchestrator.ts
        └── imports: state/schema, scheduler/types, writing/task-executor

scheduler/
  └── index.ts
        └── imports: scheduler/token-bucket, scheduler/priority-queue,
                     scheduler/retry, scheduler/types

organize/
  ├── scanner.ts      (无内部依赖)
  ├── converter.ts    (无内部依赖)
  ├── indexer.ts      └── imports: organize/scanner
  ├── baseline-extractor.ts  └── imports: organize/scanner
  ├── outline-parser.ts      (无内部依赖)
  ├── chapter-mapper.ts      └── imports: organize/outline-parser,
  │                            organize/indexer, organize/scanner
  └── kit-generator.ts       └── imports: organize/chapter-mapper,
                               organize/baseline-extractor

assemble/
  ├── assembler.ts    (无内部依赖)
  └── converter.ts    (无内部依赖)
```
