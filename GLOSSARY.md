# ConfWrite 术语表 (Glossary)

本文档定义了 ConfWrite 项目中使用的所有专业术语。按字母顺序排列。

---

## A

### Action
状态机 `tick()` 返回的操作指令。例如 `spawn_writers`、`organize_materials`、`advance` 等。Dispatcher 负责将 action 转化为实际执行。

### Agent Instructions
`inputs/agent-instructions.md` 文件，包含 Writer/Reviewer subagent 的写作指引和约束。由 `/confwrite:init` 自动生成。

### Assembly
组装阶段（Phase 6），将所有章节草稿按顺序拼接成完整文档。

---

## B

### Baseline
见 **Data Baseline**。

---

## C

### Chapter (章节)
文档的基本组成单元。每个章节有唯一的 ID（如 `ch001`），对应一个素材包文件和一个草稿文件。

### Chapter ID
章节的唯一标识符，格式为 `ch` + 3 位数字（`ch001` ~ `ch999`）。在大纲中用 `ch` 标记定义。

### Chapter Kit (章节素材包)
位于 `assets/chapter-kits/chXXX.md`，包含 Writer subagent 写作所需的全部上下文：
- 章节信息（ID、标题）
- 相关文件列表
- 关键数据（来自基线）
- 技术术语
- 需求要点
- 写作提示

### Chapter Mapper
`src/organize/chapter-mapper.ts` 模块，负责将大纲中的章节与参考资料文件进行关联。

### ch 标记
大纲（`outline.md`）中以 `chXXX` 开头的行，表示该层级启用独立的 subagent 写作。例如：
```markdown
ch001 1.1 系统概述
ch002 1.2 建设目标
```

---

## D

### Data Baseline (数据基线)
位于 `assets/data-baseline.json`，从所有参考资料中提取的共享数据：
- **metrics**: 关键指标（如"系统可用性: 99.99%"）
- **timeline**: 时间线数据
- **technicalTerms**: 技术术语列表
- **requirements**: 需求要点列表

所有 Writer 必须引用基线中的数据，所有 Reviewer 必须核查一致性。

### Dispatcher
**尚未实现**的关键组件。负责将状态机的 action 转化为实际的 subagent 调用。连接状态机 → 调度器 → pi subagent API。详见 `HANDOFF.md §5`。

### DOCX
Microsoft Word 文档格式。导出时需要 Pandoc 工具支持。

---

## E

### E2E (End-to-End)
端到端测试，验证从初始化到导出的完整流程。位于 `tests/e2e/`。

### Execution Log
`project-state.json` 中的 `executionLog` 字段，记录每次阶段转换的时间和动作。用于审计追踪。

---

## F

### Failed Task
执行失败的 subagent 任务。调度器会自动重试（指数退避），超过最大重试次数后标记为 `failed`。

### Fixer
负责修复章节的 subagent 类型。接收原始草稿和审阅反馈，生成修复后的内容。

---

## I

### Index (索引)
位于 `assets/indexes/index.json`，JSON 格式的资料索引，包含：
- 所有文件的元数据
- 按分类分组
- 全局关键词列表

### Init
初始化阶段（Phase 0a），创建项目目录结构和状态文件。

---

## K

### Kit
见 **Chapter Kit**。

---

## M

### Material (资料/素材)
用户提供的参考文档，支持 Markdown、PDF、DOCX、HTML 格式。存放在 `reference_material/` 目录。

### Material File
`MaterialFile` 接口，表示一个扫描后的资料文件，包含文件名、路径、格式、大小、标题、关键词、摘要、分类等信息。

---

## O

### Organize
整理阶段（Phase 0b/3），执行扫描→索引→基线→映射→素材包的完整管线。

### Outline (大纲)
位于 `outline.md`，定义文档的章节结构。使用 Markdown 标题层级 + `ch` 标记。

### Outline Parser
`src/organize/outline-parser.ts` 模块，解析大纲文件，识别 `ch` 标记，构建章节树。

---

## P

### Phase (阶段)
状态机中的一个步骤。ConfWrite 定义了 14 个阶段：

| Phase | 名称 | 说明 |
|-------|------|------|
| `0a` | 项目初始化 | 创建目录结构 |
| `0b` | 素材整理 | 扫描、索引、生成素材包 |
| `1` | 需求分析 | 分析需求文档 |
| `2` | 大纲规划 | 人机协作编写大纲 |
| `3` | 素材准备 | 根据大纲整理素材 |
| `4a` | 写作 | Writer subagent 写章节 |
| `4b` | 审阅 | Reviewer subagent 审阅 |
| `4c` | 决策 | 决定 accept/revise/reject |
| `4d` | 修复 | Fixer subagent 修复 |
| `5` | 图表 | 生成图表 |
| `6` | 组装 | 拼接所有章节 |
| `7` | 定稿 | 最终审校 |
| `8` | 导出 | 生成最终文件 |
| `done` | 完成 | 项目结束 |

### Priority Queue
优先级队列，调度器的核心组件。按优先级排序，相同优先级按 FIFO 顺序执行。

### Project State
`project-state.json` 文件，存储项目的完整状态，包括当前阶段、章节状态、调度器状态、任务列表等。

---

## R

### References Index
`assets/references-index.md`，人类可读的参考资料索引，按分类组织。

### Review
审阅阶段（Phase 4b），Reviewer subagent 检查章节草稿的质量。

### Reviewer
负责审阅章节的 subagent 类型。检查数据一致性、术语准确性、需求覆盖等。

### Review Decision
审阅结果，三种之一：
- **accept**: 质量达标，章节标记为 `completed`
- **revise**: 有小问题，进入修复阶段
- **reject**: 质量问题严重，回到写作阶段（轮次+1）

### Retry
重试机制。失败的任务使用指数退避策略自动重试。默认配置：基础延迟 5s，倍数 2x，最大延迟 60s，最多重试 3 次。

### Round (轮次)
写作轮次，记录在 `project-state.json` 的 `round` 字段。每次 Reviewer 给出 `reject` 决定时，轮次+1。

---

## S

### Scanner
`src/organize/scanner.ts` 模块，递归扫描 `reference_material/` 目录，提取文件元数据并自动分类。

### Scheduler
调度器系统（`src/scheduler/`），管理 subagent 任务的执行：
- 令牌桶限流
- 优先级队列排序
- 依赖管理
- 自动重试

### Slug
项目标识符，只能包含小写字母、数字和连字符（`[a-z0-9-]`）。用于创建项目目录名。

### Spawn
创建 subagent 的过程。Dispatcher 调用 pi subagent API 来 spawn Writer/Reviewer/Fixer。

### Spawn Level
大纲中启用 subagent 的层级。默认 level 3（`###` 标题层级）。可以在大纲中通过 `spawnLevel` 配置。

### State Machine
确定性状态机（`src/orchestrator/state-machine.ts`），控制整个写作流程。LLM 不参与流程决策。

### Subagent
由 pi 调度的独立 AI agent。ConfWrite 使用 subagent 来执行写作、审阅、修复等任务。

---

## T

### Task (任务)
调度器中的工作单元。每个任务有：
- `id`: 唯一标识
- `type`: writer/reviewer/fixer/diagram
- `chapterId`: 关联的章节
- `status`: queued/running/completed/failed/retrying
- `priority`: 优先级
- `prompt`: subagent 的提示词
- `dependencies`: 依赖的其他任务

### Task Executor
`src/writing/task-executor.ts` 模块，负责构建 subagent 的 prompt 并解析输出。

### Tick
状态机的"推进一步"操作。每次 `/confwrite:write` 调用都会执行一次 `tick()`。

### Token Bucket (令牌桶)
速率限制机制，控制 subagent 调用频率。默认配置：桶容量 10，补充速率 0.5 token/s（每 2 秒补充 1 个）。

---

## W

### Writer
负责写作章节的 subagent 类型。接收素材包，生成章节草稿。

### Write-Review-Fix Loop
写作管线的核心循环：
```
Writer 写 → Reviewer 审阅 → accept → 完成
                            → revise → Fixer 修复 → 重新审阅
                            → reject → Writer 重写（轮次+1）
```

---

## 缩写对照表

| 缩写 | 全称 |
|------|------|
| E2E | End-to-End |
| MD | Markdown |
| DOCX | Microsoft Word Document |
| PDF | Portable Document Format |
| HTML | HyperText Markup Language |
| API | Application Programming Interface |
| TDD | Test-Driven Development |
| FIFO | First In, First Out |
