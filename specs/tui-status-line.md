# Spec: TUI 状态行 (Status Line)

> **版本**: 1.0  
> **日期**: 2026-10-12  
> **源码**: `src/logging/logger.ts`, `src/logging/index.ts`, `src/logging/stats.ts`  
> **Issue**: #73  
> **状态**: 草案

---

## 1. 职责

TUI 状态行是 ConfWrite 运行时向用户展示**当前进度**的唯一紧凑视图。

当前问题：日志系统通过 `notify()` 输出多行格式化消息（树形 `├─`/`└─`），在 pi TUI 中被后续输出覆盖，用户无法同时看到：
- 当前处于哪个 Phase
- 正在执行什么任务
- 运行了多久
- 最近发生了什么

目标：**合成单行状态摘要**，在每次 `notify()` 调用时附带当前上下文，让用户一眼掌握全局。

---

## 2. 状态行格式

### 2.1 格式定义

状态行是一个**单行字符串**，由 `StatusLineRenderer.render()` 生成，附加在每次 `notify()` 输出的**前缀**位置。

```
[Phase] PhaseName | 任务描述 | 时间 | 最新日志
```

各段定义：

| 段 | 内容 | 最大宽度 | 溢出策略 |
|----|------|---------|---------|
| Phase | `{phase}` — 当前 Phase ID | 4 字符 | 固定宽度，左对齐 |
| PhaseName | `{phaseName}` — Phase 中文名 | 6 字符 | 截断 + `…` |
| 任务描述 | 当前活跃任务的简短描述 | 20 字符 | 截断 + `…` |
| 时间 | `{elapsed}` — 运行时长 | 8 字符 | `H:MM:SS` 或 `M:SS` |
| 最新日志 | 最近一条日志的首行（去除 emoji 前缀） | 剩余宽度 | 截断 + `…` |

分隔符：` │ `（Unicode box-drawing light vertical，U+2502）

### 2.2 示例

```
[4a ] 写作   │ 🚀 ch-03 writer     │ 0:03:27 │ ch-03 开始写作 (并发 2/4)
[4b ] 审阅   │ 📝 ch-01 reviewer   │ 0:12:05 │ ch-01 审阅完成 (45.2s)
[5  ] 图表生成│ 🎨 fig-02           │ 0:18:33 │ fig-02 (flowchart) 生成完成
[2  ] 大纲规划│ ⏳ 等待用户确认      │ 0:01:12 │ 大纲已生成，请确认后继续
```

### 2.3 Phase 显示名映射

| Phase | 显示名 | 截断后 |
|-------|--------|--------|
| 0a | 初始化 | 初始化 |
| 0b | 素材整理 | 素材整理 |
| 1 | 需求分析 | 需求分析 |
| 2 | 大纲规划 | 大纲规划 |
| 3 | 素材准备 | 素材准备 |
| 4a | 写作 | 写作 |
| 4b | 审阅 | 审阅 |
| 4c | 决策 | 决策 |
| 4d | 修复 | 修复 |
| 5 | 图表生成 | 图表生成 |
| 6 | 组装 | 组装 |
| 7 | 定稿 | 定稿 |
| 8 | 导出 | 导出 |
| done | 完成 | 完成 |

---

## 3. 行为不变量

### INV-TUI-1: 状态行必须单行

`StatusLineRenderer.render()` 返回值**不得包含换行符** (`\n`)。

**验证**：`render()` 输出的 `split('\n').length === 1`。

### INV-TUI-2: 状态行必须包含当前 Phase

每次 `render()` 输出必须包含当前 Phase ID（如 `4a`）。如果 Phase 未知或为空，显示 `[--]`。

**验证**：正则匹配 `/\[.{2,4}\]/`。

### INV-TUI-3: 状态行必须包含运行时长

每次 `render()` 输出必须包含格式化的运行时长。时长从 `LoggingSystem` 启动时开始计算。

**验证**：正则匹配 `/\d+:\d{2}(:\d{2})?/`。

### INV-TUI-4: 最新日志不得包含多行内容

如果最新日志事件格式化后包含多行（如 `phase.transition` 的树形输出），状态行只取**第一行**。

**验证**：日志缓冲区存储的 `lastMessage` 不含 `\n`。

### INV-TUI-5: 状态行长度不超过终端宽度

`render()` 输出的总长度不得超过配置的 `maxWidth`（默认 120 字符）。超出时从右向左截断各段（最新日志优先截断，Phase 最后截断）。

**验证**：`render().length <= maxWidth`。

### INV-TUI-6: 状态行不阻塞事件处理

`render()` 必须是**纯计算函数**，不产生 I/O、不修改状态、不抛出异常。

**验证**：单元测试中调用 `render()` 10000 次无异常，无副作用。

### INV-TUI-7: 任务描述在无活跃任务时显示等待状态

当没有正在执行的任务时（`running === 0`），任务描述段显示：
- 等待点：`⏳ {waitPointReason 首行}`
- Phase 间过渡：`⏳ 等待推进`
- 已完成：`✅ 完成`

### INV-TUI-8: notify 输出保留原有格式

状态行是**附加信息**，不改变现有 `notify()` 的消息格式。状态行通过独立方法 `render()` 提供，由调用方决定是否拼接。

**验证**：`Logger.format()` 的输出不受 `StatusLineRenderer` 影响。

### INV-TUI-9: 任务开始消息必须区分任务类型

`Logger.formatTaskStart()` 生成的消息必须根据 `taskType` 使用不同的动作词：
- `writer` → "开始写作"
- `reviewer` → "开始审阅"
- `fixer` → "开始修复"
- 其他类型 → "开始处理"（默认）

**验证**：单元测试覆盖所有任务类型，消息中包含正确的动作词。

---

## 4. 日志缓冲规则

### 4.1 缓冲区结构

```typescript
interface LogBuffer {
  lastMessage: string;      // 最近一条格式化日志的首行
  lastLevel: NotifyLevel;   // 最近一条日志的级别
  lastTimestamp: number;     // 最近一条日志的时间戳 (Date.now())
  lastEventType: string;     // 最近一条事件的类型
}
```

### 4.2 缓冲更新规则

| ID | 规则 |
|----|------|
| BUF-1 | 每次 `handleEvent()` 处理非 diag 事件时，更新 `lastMessage` 为 `Logger.format(event).message` 的首行 |
| BUF-2 | diag 事件**不更新**日志缓冲（与现有 TUI 输出规则一致） |
| BUF-3 | `lastMessage` 去除所有 `\n` 及后续行，仅保留首行 |
| BUF-4 | `lastMessage` 去除开头的 emoji 前缀（用于状态行内部，避免 emoji 重复） |

### 4.3 缓冲初始状态

```typescript
{
  lastMessage: '等待启动...',
  lastLevel: 'info',
  lastTimestamp: Date.now(),
  lastEventType: ''
}
```

---

## 5. 任务描述生成规则

### 5.1 活跃任务追踪

`StatusLineRenderer` 通过订阅 EventBus 追踪活跃任务：

| 事件 | 动作 |
|------|------|
| `task.start` | 添加到活跃任务集合 |
| `task.complete` | 从活跃任务集合移除 |
| `task.fail` | 从活跃任务集合移除（除非 `willRetry`） |

### 5.2 任务描述格式

活跃任务描述格式：`{emoji} {chapterId} {taskType}`

示例：
- `🚀 ch-03 writer`
- `📝 ch-01 reviewer`
- `🔧 ch-05 fixer`

多个活跃任务时，显示**最近启动**的一个。

### 5.3 无活跃任务时的描述

| 条件 | 描述 |
|------|------|
| 处于等待点 | `⏳ {waitPointReason 首行}` |
| Phase 刚转换 | `⏳ 进入 {phaseName}` |
| 所有任务完成 | `✅ 本轮完成` |
| 无特殊状态 | `⏳ 等待推进` |

---

## 6. 更新频率

### 6.1 事件驱动更新

状态行**不**使用定时器轮询。每次以下事件发生时，内部状态更新：

| 事件 | 更新内容 |
|------|---------|
| `task.start` | 活跃任务集合、任务描述 |
| `task.complete` / `task.fail` | 活跃任务集合、任务描述 |
| `phase.transition` | Phase ID、Phase 名称 |
| 任意非 diag 事件 | 最新日志 |

### 6.2 render() 调用时机

`render()` 是按需调用的纯函数。调用方（如 `LoggingSystem.handleEvent()` 或 `index.ts` 的 tick 循环）决定何时调用。

推荐调用点：
1. `LoggingSystem.handleEvent()` — 每次非 diag 事件处理后
2. `index.ts` tick 循环 — 每次 `step` 结果输出前

---

## 7. 时间格式化

### 7.1 运行时长格式

| 范围 | 格式 | 示例 |
|------|------|------|
| < 1 分钟 | `M:SS` | `0:42` |
| < 1 小时 | `M:SS` | `12:05` |
| >= 1 小时 | `H:MM:SS` | `1:03:27` |

### 7.2 计算方式

```
elapsed = Date.now() - startTime
```

`startTime` 在 `LoggingSystem` 构造时记录。

---

## 8. 模块设计

### 8.1 StatusLineRenderer

```typescript
// src/logging/status-line.ts

export interface StatusLineState {
  phase: string;
  phaseName: string;
  startTime: number;
  activeTasks: ActiveTask[];
  logBuffer: LogBuffer;
  waitPoint?: { reason: string };
  maxWidth: number;
}

export interface ActiveTask {
  taskId: string;
  taskType: 'writer' | 'reviewer' | 'fixer';
  chapterId: string;
  startedAt: number;
}

export class StatusLineRenderer {
  private state: StatusLineState;

  constructor(opts?: { maxWidth?: number });

  /** 更新 Phase */
  setPhase(phase: string, phaseName: string): void;

  /** 设置等待点 */
  setWaitPoint(reason: string | undefined): void;

  /** 记录活跃任务 */
  addTask(task: ActiveTask): void;
  removeTask(taskId: string): void;

  /** 更新最新日志 */
  updateLastLog(message: string, level: NotifyLevel, eventType: string): void;

  /** 渲染状态行（纯函数，无副作用） */
  render(): string;
}
```

### 8.2 与 LoggingSystem 集成

`LoggingSystem` 持有 `StatusLineRenderer` 实例：

```typescript
class LoggingSystem {
  public statusLine: StatusLineRenderer;
  
  constructor(...) {
    this.statusLine = new StatusLineRenderer();
    // 订阅事件更新 statusLine 内部状态
    this.eventBus.subscribe('task.start', (e) => this.statusLine.addTask(...));
    this.eventBus.subscribe('task.complete', (e) => this.statusLine.removeTask(...));
    this.eventBus.subscribe('task.fail', (e) => { if (!e.willRetry) this.statusLine.removeTask(...); });
    this.eventBus.subscribe('phase.transition', (e) => this.statusLine.setPhase(e.to, e.phaseName));
  }
}
```

### 8.3 调用方集成

`index.ts` 的 tick 循环中，在 `notify()` 前调用 `render()` 获取状态行：

```typescript
const statusLine = loggingSystem.statusLine.render();
notify(`${statusLine}\n${result.message}`, result.level);
```

或作为独立命令 `/confwrite:status` 输出。

---

## 9. 测试设计

### 9.1 单元测试：StatusLineRenderer

| 测试 ID | 用例 | 验证不变量 |
|---------|------|-----------|
| TUI-TEST-1 | 初始状态渲染包含 `[--]` 和 `0:00` | INV-TUI-2, INV-TUI-3 |
| TUI-TEST-2 | 设置 Phase `4a`/`写作` 后渲染包含 `[4a]` 和 `写作` | INV-TUI-2 |
| TUI-TEST-3 | 渲染输出不含 `\n` | INV-TUI-1 |
| TUI-TEST-4 | 渲染输出长度 <= maxWidth (120) | INV-TUI-5 |
| TUI-TEST-5 | maxWidth=40 时输出仍合法（截断后） | INV-TUI-5 |
| TUI-TEST-6 | 添加活跃任务后渲染包含任务描述 | INV-TUI-2 |
| TUI-TEST-7 | 移除所有任务后显示等待状态 | INV-TUI-7 |
| TUI-TEST-8 | 多行日志只取首行 | INV-TUI-4 |
| TUI-TEST-9 | 运行 65 秒显示 `1:05` | INV-TUI-3 |
| TUI-TEST-10 | 运行 3727 秒显示 `1:02:07` | INV-TUI-3 |
| TUI-TEST-11 | render() 调用 10000 次无异常 | INV-TUI-6 |
| TUI-TEST-12 | 等待点设置后显示等待原因 | INV-TUI-7 |
| TUI-TEST-13 | Phase 名超长时截断 + `…` | INV-TUI-5 |

### 9.2 集成测试：LoggingSystem + StatusLineRenderer

| 测试 ID | 用例 | 验证不变量 |
|---------|------|-----------|
| TUI-INT-1 | emit `task.start` 后 statusLine 反映活跃任务 | INV-TUI-2, INV-TUI-7 |
| TUI-INT-2 | emit `phase.transition` 后 statusLine 反映新 Phase | INV-TUI-2 |
| TUI-INT-3 | emit diag 事件不更新 logBuffer | BUF-2 |
| TUI-INT-4 | emit 多行格式化事件后 logBuffer 只有首行 | BUF-3, INV-TUI-4 |
| TUI-INT-5 | `Logger.format()` 输出不受 statusLine 影响 | INV-TUI-8 |

### 9.3 边界情况

| 场景 | 预期行为 |
|------|---------|
| Phase 为空字符串 | 显示 `[--]` |
| 无活跃任务 + 无等待点 | 显示 `⏳ 等待推进` |
| 10+ 并发任务 | 只显示最近启动的 1 个 |
| maxWidth=20（极窄终端） | 至少显示 Phase + 时间，其余截断 |
| 日志消息为空字符串 | 显示占位 `...` |
| 任务类型未知 | 使用默认 emoji `⚙️` |

---

## 10. 实现要点

### 10.1 需要修改的文件

| 文件 | 变更 |
|------|------|
| `src/logging/status-line.ts` | **新增** — `StatusLineRenderer` 类 |
| `src/logging/index.ts` | 集成 — 持有 renderer 实例，事件订阅转发 |
| `src/logging/types.ts` | 无变更 — 复用现有事件类型 |
| `src/logging/logger.ts` | 无变更 — `Logger.format()` 保持不变 |
| `src/index.ts` | 可选 — 在 tick 循环中调用 `render()` 拼接输出 |
| `tests/logging/status-line.test.ts` | **新增** — 单元测试 |
| `tests/logging/status-line-integration.test.ts` | **新增** — 集成测试 |

### 10.2 状态行格式实现

```typescript
render(): string {
  const phase = this.formatPhase();       // [4a ]
  const name = this.formatPhaseName();    // 写作
  const task = this.formatTask();         // 🚀 ch-03 writer
  const time = this.formatElapsed();      // 0:03:27
  const log = this.formatLastLog();       // ch-03 开始写作 (并发 2/4)
  
  const segments = [phase, name, task, time, log];
  return this.fitToWidth(segments, this.state.maxWidth);
}
```

### 10.3 截断策略

从右向左截断（最新日志优先截断）：

1. 计算所有段的总长度（含分隔符）
2. 如果超出 maxWidth：
   a. 截断 `log` 段到剩余空间
   b. 如果仍超出，截断 `task` 段
   c. 如果仍超出，截断 `name` 段
   d. `phase` 和 `time` 不截断（核心信息）

### 10.4 日志缓冲的 emoji 去除

```typescript
private stripLeadingEmoji(text: string): string {
  // 去除开头的 emoji（Unicode emoji range）+ 空格
  return text.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]\s*/u, '');
}
```

---

## 11. 非目标

以下不在本 spec 范围内：

- **多行 TUI 面板**：本 spec 只定义单行状态行
- **颜色/ANSI 转义码**：由调用方（pi TUI）处理
- **持久化**：状态行是运行时视图，不写入磁盘
- **自定义格式**：不支持用户自定义状态行模板（v1）
- **进度条**：不在状态行中显示 ASCII 进度条

---

## 12. 与现有 Spec 的关系

| 关联 Spec | 关系 |
|-----------|------|
| `specs/state-machine.md` | 状态行读取 Phase 信息，不修改状态机 |
| `specs/module-contracts.md` | LOG-4（diag 事件不输出 TUI）同样适用于状态行的 logBuffer |
| `specs/module-contracts.md` | MC-1（不直接修改 currentPhase）— 状态行只读 Phase |
