# ConfWrite 项目交接文档 (Handoff)

> **日期**: 2025-01-15  
> **项目路径**: `C:\Users\wenhao01\pi_proj\confidenceWriter`  
> **版本**: v0.1.0-draft  
> **状态**: Phase A-E 完成，Phase F (Dispatcher) 待实现

---

## 1. 一句话概括

ConfWrite 是一个 pi 原生扩展包，用于生成 10+ 章节长文档。核心代码（25 个源文件、4663 行）已全部通过 TDD 开发（22 个测试文件、247 个测试用例），**但写作管线的"最后一公里"——Dispatcher 层——尚未实现，导致 `/confwrite:write` 无法真正驱动 subagent 写作。**

---

## 2. 当前状态一览

| 维度 | 状态 | 说明 |
|------|------|------|
| 源码 | ✅ 25 文件 / 4663 行 | TypeScript，ESM |
| 测试 | ✅ 22 文件 / 247 tests / 全部通过 | Vitest |
| TS 编译 | ✅ `npx tsc --noEmit` 通过 | 零错误 |
| 构建产物 | ❌ `dist/` 不存在 | 尚未执行 `npm run build` |
| Git | ❌ 未初始化 | 未 `git init` |
| npm pack | ❌ 未打包 | 未执行 `npm pack` |
| pi 安装 | ❌ 未安装到 pi | 需要先 build + pack + install |
| Dispatcher | ❌ 未实现 | **阻塞性问题**，见 §5 |
| 端到端可用 | ❌ 不可用 | 因 Dispatcher 缺失 |

---

## 3. 已完成的工作

### 3.1 Phase A: 状态管理 & 基础设施 ✅

| 文件 | 行数 | 功能 | 测试 |
|------|------|------|------|
| `src/state/schema.ts` | 197 | TypeBox 类型定义 (ProjectState, ChapterState, Phase, Task) | — |
| `src/state/store.ts` | 105 | 原子化 JSON 持久化 (write-temp → rename) | 13 tests |
| `src/utils/paths.ts` | 82 | 路径安全 (防遍历、slug 验证) | 16 tests |
| `src/orchestrator/phases.ts` | 408 | 14 个阶段的声明式定义 | — |
| `src/orchestrator/state-machine.ts` | 175 | 确定性状态机 (tick/advance/status) | 11 tests |
| `src/commands/init.ts` | 180 | `/confwrite:init` 命令 | 8 tests |

### 3.2 Phase B: 调度器系统 ✅

| 文件 | 行数 | 功能 | 测试 |
|------|------|------|------|
| `src/scheduler/types.ts` | 52 | Task/SchedulerConfig 类型 | — |
| `src/scheduler/token-bucket.ts` | 127 | 令牌桶限流 (10 tokens, 0.5/s) | 15 tests |
| `src/scheduler/priority-queue.ts` | 133 | 最小堆优先级队列 (FIFO 保证) | 11 tests |
| `src/scheduler/retry.ts` | 65 | 指数退避重试 (5s→10s→20s, max 60s) | 11 tests |
| `src/scheduler/index.ts` | 211 | SubagentScheduler 主类 | 13 tests |

### 3.3 Phase C: 素材组织系统 ✅

| 文件 | 行数 | 功能 | 测试 |
|------|------|------|------|
| `src/organize/outline-parser.ts` | 131 | 大纲解析 + ch 标记识别 | 10 tests |
| `src/organize/scanner.ts` | 259 | 资料扫描 + 自动分类 | 13 tests |
| `src/organize/converter.ts` | 220 | HTML→MD (PDF/DOCX 为桩实现) | 7 tests |
| `src/organize/indexer.ts` | 135 | JSON 索引生成 | 10 tests |
| `src/organize/baseline-extractor.ts` | 239 | 数据基线提取 (指标/术语/需求) | 10 tests |
| `src/organize/chapter-mapper.ts` | 141 | 章节→资料映射 | 9 tests |
| `src/organize/kit-generator.ts` | 158 | 章节素材包生成 | 10 tests |
| `src/commands/organize.ts` | 183 | `/confwrite:organize` 命令 | 9 tests |
| `tests/e2e/organize-pipeline.test.ts` | 279 | 端到端集成测试 | 4 tests |

### 3.4 Phase D: 写作管线 ✅ (组件级)

| 文件 | 行数 | 功能 | 测试 |
|------|------|------|------|
| `src/writing/task-executor.ts` | 231 | Prompt 构建 + 审阅结果解析 | 12 tests |
| `src/writing/orchestrator.ts` | 199 | 写作阶段编排 (write→review→fix 循环) | 21 tests |

### 3.5 Phase E: 组装与导出 ✅

| 文件 | 行数 | 功能 | 测试 |
|------|------|------|------|
| `src/assemble/assembler.ts` | 175 | 章节组装 (排序/分页/TOC/统计) | 12 tests |
| `src/assemble/converter.ts` | 371 | MD→HTML (内置) + pandoc 命令生成 (DOCX/PDF) | 12 tests |
| `src/commands/export.ts` | 266 | `/confwrite:export` 命令 | 10 tests |

### 3.6 Extension 入口 ✅

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/index.ts` | 220 | 注册 6 个 pi 命令 |

### 3.7 文档 ✅

| 文件 | 行数 | 内容 |
|------|------|------|
| `README.md` | 226 | 项目说明 + 快速开始 |
| `ARCHITECTURE.md` | 384 | 架构设计文档 |
| `USAGE.md` | 1004 | 详细使用说明 |
| `DESIGN.md` | 1170 | 详细设计文档（含架构问题识别） |
| `SKILL.md` | 65 | pi Skill 定义 |

---

## 4. 各命令的完成度

| 命令 | 状态 | 能做什么 | 不能做什么 |
|------|------|----------|------------|
| `/confwrite:init` | ✅ **完整可用** | 创建项目结构、初始化状态、生成模板 | — |
| `/confwrite:organize` | ✅ **完整可用** | 扫描→索引→基线→映射→素材包 | PDF/DOCX 转换为桩实现 |
| `/confwrite:write` | ⚠️ **仅展示 action** | 调用状态机 tick()，显示当前阶段和待执行 action | **不能实际执行 action**（Dispatcher 缺失） |
| `/confwrite:status` | ✅ **完整可用** | 读取状态并展示进度 | — |
| `/confwrite:resume` | ⚠️ **同 write** | 等同于 write | 同 write |
| `/confwrite:export` | ✅ **完整可用** | 组装章节→导出 MD/HTML/DOCX/PDF | 需要有已写好的章节草稿 |

---

## 5. 🔴 阻塞性问题：Dispatcher 缺失

### 5.1 问题描述

状态机返回 `action: 'spawn_writers'` 后，**没有代码实际执行这个 action**。

当前 `/confwrite:write` 的 handler 只做了：
```typescript
const result = await machine.tick();
ctx.ui.notify(`待执行:\n${JSON.stringify(result)}`, 'info');
// ❌ 到此结束，没有后续
```

### 5.2 断裂的链路

```
StateMachine.tick()
  → { action: 'spawn_writers', params: { chapters: ['ch001', 'ch002', ...] } }
    → ❌ 没有代码读取素材包 (assets/chapter-kits/ch001.md)
    → ❌ 没有代码调用 TaskExecutor.generateWriterPrompt(task, kitContent)
    → ❌ 没有代码调用 SubagentScheduler.submit(task)
    → ❌ 没有代码调用 pi subagent spawn
    → ❌ 没有代码处理 subagent 完成后的状态更新
```

### 5.3 需要实现的组件

**新文件**: `src/dispatcher/index.ts` (~400 行)

核心职责：
1. 接收状态机的 action + params
2. 读取素材包文件
3. 调用 `TaskExecutor.generateWriterPrompt()` 组装 prompt
4. 创建 Task 对象并提交到 `SubagentScheduler`
5. 从调度器取就绪任务
6. 调用 pi subagent API 实际 spawn subagent
7. 注册完成回调：读取输出 → 更新章节状态 → 标记任务完成

**同时需要修改**: `src/index.ts` 中 `/confwrite:write` handler，集成 Dispatcher

### 5.4 参考实现思路

```typescript
// src/dispatcher/index.ts
class Dispatcher {
  async dispatch(action: string, params: Record<string, unknown>): Promise<void> {
    switch (action) {
      case 'spawn_writers':
        for (const chapterId of params.chapters) {
          const kitContent = readFileSync(`assets/chapter-kits/${chapterId}.md`, 'utf-8');
          const task = { id: `write-${chapterId}`, type: 'writer', chapterId, ... };
          task.prompt = this.taskExecutor.generateWriterPrompt(task, kitContent);
          this.scheduler.submit(task);
        }
        await this.runReadyTasks();
        break;
      case 'spawn_reviewers':
        // 类似：读取草稿 + 基线 → 生成 reviewer prompt → submit → run
        break;
      case 'spawn_fixers':
        // 类似：读取草稿 + 审阅报告 → 生成 fixer prompt → submit → run
        break;
    }
  }

  private async runReadyTasks(): Promise<void> {
    const ready = this.scheduler.getReadyTasks();
    for (const task of ready) {
      await this.scheduler.tokenBucket.waitForToken();
      // 调用 pi subagent API
      const result = await subagent({ agent: task.type, task: task.prompt, ... });
      this.scheduler.markCompleted(task.id, result);
      this.writingOrchestrator.updateChapterStatus(state, task, 'success');
    }
  }
}
```

### 5.5 预估工作量

| 子任务 | 行数 | 测试 |
|--------|------|------|
| Dispatcher 核心逻辑 | ~200 行 | ~100 行 |
| pi subagent 集成 | ~80 行 | 需 mock |
| 完成回调 + 状态更新 | ~100 行 | ~50 行 |
| 修改 index.ts handler | ~30 行 | — |
| **合计** | **~410 行** | **~150 行** |

---

## 6. 其他已知问题

### 6.1 🟡 Converter 桩实现

`src/organize/converter.ts` 中 PDF/DOCX → Markdown 转换为桩实现。

**影响**: 只有 Markdown 和 HTML 资料能被正确处理。  
**解决方案**: 集成 `mammoth` (DOCX) + `pdf-parse` (PDF)，或调用外部 `pandoc`。  
**预估**: ~100 行 + ~30 行测试

### 6.2 🟡 章节定义未自动同步

`outline.md` 中的 `ch` 标记不会自动同步到 `project-state.json` 的 `chapters` 字段。

**影响**: 用户修改大纲后需要手动更新状态。  
**解决方案**: 在 organize 或 write 时自动解析 outline.md 并同步。  
**预估**: ~80 行 + ~40 行测试

### 6.3 🟢 HTML 转换器功能有限

内置 MD→HTML 是简单正则实现，不支持嵌套列表、脚注等。

**影响**: 导出的 HTML 可能格式不完美。  
**解决方案**: 集成 `marked` 或 `markdown-it`（package.json 已声明 `marked` 依赖但未使用）。  
**预估**: ~50 行改动

---

## 7. 待实现清单（按优先级）

### P0: 阻塞性（必须实现才能使用）

| 编号 | 任务 | 文件 | 预估 |
|------|------|------|------|
| **F1** | 实现 Dispatcher 核心 | `src/dispatcher/index.ts` (新建) | 200 行 |
| **F2** | pi subagent spawn 集成 | 同上 | 80 行 |
| **F3** | 完成回调 + 状态更新 | 同上 | 100 行 |
| **F4** | 修改 /confwrite:write handler | `src/index.ts` (修改) | 30 行 |
| **F5** | Dispatcher 测试 | `tests/dispatcher/index.test.ts` (新建) | 150 行 |

### P1: 重要（影响可用性）

| 编号 | 任务 | 预估 |
|------|------|------|
| G1 | 大纲→状态自动同步 | 80 行 + 40 行测试 |
| G2 | 真实 PDF/DOCX 转换 | 100 行 + 30 行测试 |
| G3 | Phase 4c (决策) 完整逻辑 | 60 行 |
| G4 | 端到端集成测试 (含 Dispatcher) | 200 行 |

### P2: 增强（锦上添花）

| 编号 | 任务 | 预估 |
|------|------|------|
| H1 | Phase 5 (图表) 基本逻辑 | 100 行 |
| H2 | Phase 7 (定稿) 完整逻辑 | 60 行 |
| H3 | 集成 marked 库替换内置 HTML 转换 | 50 行改动 |
| H4 | `git init` + 初始提交 | — |
| H5 | `npm run build` + `npm pack` + `pi install` | — |
| H6 | 实际项目试用 + 修复问题 | — |

---

## 8. 快速上手指南

### 8.1 环境确认

```bash
cd C:\Users\wenhao01\pi_proj\confidenceWriter
node --version          # 需要 >= 18
npm test                # 应该看到 247 passed
npx tsc --noEmit        # 应该无输出（零错误）
```

### 8.2 继续开发 Dispatcher

```bash
# 1. 先写测试（TDD）
# 新建 tests/dispatcher/index.test.ts

# 2. 实现 Dispatcher
# 新建 src/dispatcher/index.ts

# 3. 修改 index.ts 集成
# 修改 /confwrite:write handler

# 4. 运行测试
npm test

# 5. 构建 + 打包
npm run build
npm pack

# 6. 安装到 pi
pi install confwrite-0.1.0.tgz

# 7. 实际测试
cd /path/to/workspace
/confwrite:init test-project
# 放入资料...
/confwrite:organize
# 编写大纲...
/confwrite:organize
/confwrite:write    # 这次应该能真正 spawn subagent 了
```

### 8.3 关键文件阅读顺序

```
1. src/state/schema.ts          ← 理解数据模型
2. src/orchestrator/phases.ts   ← 理解阶段流转
3. src/orchestrator/state-machine.ts  ← 理解 tick() 逻辑
4. src/writing/task-executor.ts       ← 理解 prompt 如何构建
5. src/writing/orchestrator.ts        ← 理解写作循环
6. src/scheduler/index.ts             ← 理解调度器 API
7. src/index.ts                       ← 理解命令注册和当前 handler
8. DESIGN.md §7                       ← 理解架构问题
```

---

## 9. 关键设计约束（接手后不要打破）

| 约束 | 原因 |
|------|------|
| **LLM 不参与流程决策** | 状态机是确定性的，LLM 只生成内容。这是核心设计哲学。 |
| **状态存储只用 JSON 文件** | 零依赖、人类可读、Git 友好。不要引入数据库。 |
| **原子化写入** | `write-temp → rename` 模式，防止崩溃导致半写状态。 |
| **失败隔离** | 单章节失败不阻塞其他章节。不要改成全局中止。 |
| **TDD** | 所有新功能先写测试再写实现。当前 247 tests 全部通过。 |
| **素材包模式** | 每个 Writer subagent 只看自己的素材包，不看全局。防止上下文溢出。 |
| **数据基线唯一来源** | 跨章节数据只从 `data-baseline.json` 引用，不编造。 |

---

## 10. 文件索引

### 源码 (src/)

```
src/
├── index.ts                          # Extension 入口，注册 6 个命令
├── state/
│   ├── schema.ts                     # TypeBox 类型 (ProjectState 等)
│   └── store.ts                      # 原子化 JSON 持久化
├── scheduler/
│   ├── types.ts                      # Task, SchedulerConfig
│   ├── token-bucket.ts               # 令牌桶限流
│   ├── priority-queue.ts             # 最小堆优先级队列
│   ├── retry.ts                      # 指数退避重试
│   └── index.ts                      # SubagentScheduler 主类
├── organize/
│   ├── scanner.ts                    # 资料扫描 + 自动分类
│   ├── converter.ts                  # HTML/PDF/DOCX → MD (部分桩实现)
│   ├── indexer.ts                    # JSON 索引生成
│   ├── baseline-extractor.ts         # 数据基线提取
│   ├── outline-parser.ts             # 大纲解析 + ch 标记
│   ├── chapter-mapper.ts             # 章节→资料映射
│   └── kit-generator.ts              # 素材包生成
├── writing/
│   ├── task-executor.ts              # Prompt 构建 + 审阅解析
│   └── orchestrator.ts               # 写作阶段编排
├── assemble/
│   ├── assembler.ts                  # 章节组装
│   └── converter.ts                  # MD→HTML/DOCX/PDF
├── orchestrator/
│   ├── phases.ts                     # 14 个阶段定义
│   └── state-machine.ts              # 确定性状态机
├── commands/
│   ├── init.ts                       # /confwrite:init
│   ├── organize.ts                   # /confwrite:organize
│   └── export.ts                     # /confwrite:export
└── utils/
    └── paths.ts                      # 路径安全工具
```

### 测试 (tests/)

```
tests/
├── state/store.test.ts               # 13 tests
├── scheduler/
│   ├── token-bucket.test.ts          # 15 tests
│   ├── priority-queue.test.ts        # 11 tests
│   ├── retry.test.ts                 # 11 tests
│   └── index.test.ts                 # 13 tests
├── organize/
│   ├── outline-parser.test.ts        # 10 tests
│   ├── scanner.test.ts               # 13 tests
│   ├── converter.test.ts             #  7 tests
│   ├── indexer.test.ts               # 10 tests
│   ├── baseline-extractor.test.ts    # 10 tests
│   ├── chapter-mapper.test.ts        #  9 tests
│   └── kit-generator.test.ts         # 10 tests
├── writing/
│   ├── task-executor.test.ts         # 12 tests
│   └── orchestrator.test.ts          # 21 tests
├── assemble/
│   ├── assembler.test.ts             # 12 tests
│   └── converter.test.ts             # 12 tests
├── commands/
│   ├── init.test.ts                  #  8 tests
│   ├── organize.test.ts              #  9 tests
│   └── export.test.ts                # 10 tests
├── orchestrator/
│   └── state-machine.test.ts         # 11 tests
├── e2e/
│   └── organize-pipeline.test.ts     #  4 tests
└── utils/
    └── paths.test.ts                 # 16 tests
```

### 文档

```
README.md          # 项目说明 + 快速开始 (226 行)
ARCHITECTURE.md    # 架构设计 (384 行)
USAGE.md           # 详细使用说明 (1004 行)
DESIGN.md          # 详细设计文档 (1170 行)
SKILL.md           # pi Skill 定义 (65 行)
HANDOFF.md         # 本文档
```

---

## 11. 联系与备注

- **开发方式**: 全程 TDD，使用 pi coding agent 辅助开发
- **参考项目**: 
  - `C:\Users\wenhao01\pi_proj\eastele\projects\eastele-am-proposal` — 素材包模式的灵感来源
  - `C:\Users\wenhao01\pi_proj\bailian-agent` — 架构参考（仅参考，未复用代码）
- **旧版代码**: 项目根目录下 `confwrite/` 是 v1 脚本版，已废弃，测试中已排除
- **package.json 中的额外依赖**: `marked`, `docx`, `sharp` 已声明但代码中未使用，为后续实现预留

---

> **接手后的第一件事**: 实现 Dispatcher（§5），然后 `npm run build && npm pack && pi install`，用一个真实项目测试完整流程。
