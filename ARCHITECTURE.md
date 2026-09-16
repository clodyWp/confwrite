# ConfWrite Architecture

## 设计目标

构建一个嵌入 pi 核心的完整 agent 应用，用于生成 100+ 章节、100 万字级的长文档。

### 核心约束

1. **流程确定性** — 状态机在 TypeScript 中运行，LLM 只做内容生成
2. **最大化自主推进** — 无依赖的任务并行执行，单个失败不阻塞整体
3. **状态持久化** — 每一步都持久化，随时可恢复
4. **知识库与素材分离** — 通用规则 vs 项目专属资料

## 为什么不复用 bailian-agent？

bailian-agent 是一个成熟的 agent 框架，但我们选择独立实现：

1. **流程控制不可靠** — bailian-agent 依赖 LLM 做流程判断（SKILL.md 写指令 → Agent 读指令 → Agent 判断下一步），这导致流程容易出错
2. **状态管理脆弱** — bailian-agent 的状态管理依赖 Agent 自律，容易丢失或损坏
3. **调度器不够灵活** — bailian-agent 的 SubagentManager 不支持令牌桶频率控制、优先级队列等高级特性

ConfWrite 的设计是：**LLM 只做内容生成，流程由代码控制**。

## 系统分层

```
┌──────────────────────────────────────────────────────────┐
│                    pi TUI (主 Agent)                      │
│  用户输入 /confwrite:xxx → pi 调用 Extension 注册的工具    │
└──────────────┬───────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│              ConfWrite Extension (TypeScript)             │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────┐ │
│  │ Commands │  │  Tools   │  │   State   │  │ Subagent│ │
│  │ /init    │  │ spawn    │  │  Machine  │  │Scheduler│ │
│  │ /organize│  │ export   │  │           │  │         │ │
│  │ /write   │  │ status   │  │ phases    │  │ queue   │ │
│  │ /status  │  │          │  │ transitions│ │ retry   │ │
│  │ /resume  │  │          │  │ guards    │  │ recover │ │
│  └─────────┘  └──────────┘  └───────────┘  └─────────┘ │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │   Knowledge Base │  │   Project Materials          │ │
│  │   (通用规则)      │  │   (项目专属)                  │ │
│  │                  │  │                              │ │
│  │ · 写作方法论     │  │ · 参考资料（原始文件）        │ │
│  │ · 审阅标准       │  │ · JSON 索引                  │ │
│  │ · 图表规范       │  │ · 数据基线                   │ │
│  │ · 行业模板       │  │ · 章节素材包 (chapter-kits)  │ │
│  │ · 反模式教训     │  │ · 大纲                       │ │
│  └──────────────────┘  └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────┐
│              Subagent Pool (内容生成)                      │
│  writer × N  │  reviewer × N  │  fixer × N  │  diagram  │
│  (只写内容，不控制流程)                                    │
└──────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 状态机 (orchestrator/)

状态机是整个系统的核心。它决定当前处于哪个 Phase，验证前置条件，执行 Phase 逻辑，检查退出条件并推进到下一个 Phase。

**设计决策**：

- **声明式 Phase 定义** — 每个 Phase 是一个对象，包含 `validate`、`execute`、`exits`，而不是 if/else 链
- **Phase 注册表** — 所有 Phase 注册到一个 Map 中，状态机通过 Map 查找当前 Phase
- **幂等 tick()** — 每次调用 tick() 都是幂等的：从持久化 state 恢复，检查哪些任务已完成，继续推进未完成的

**为什么不用 bailian-agent 的 SKILL.md 方式？**

bailian-agent 的 SKILL.md 写流程指令，Agent 读指令后判断下一步。这种方式的问题是：
- Agent 可能跳过步骤
- Agent 可能误判条件
- Agent 可能丢失状态

ConfWrite 的状态机在 TypeScript 中运行，流程判断是确定性的。

### 2. Subagent 调度器 (scheduler/)

调度器负责管理 subagent 的生命周期：提交、执行、重试、恢复。

**设计决策**：

- **令牌桶频率控制** — 控制提交频率，避免 LLM provider 限流
- **优先级队列** — 按优先级和依赖关系调度
- **自动重试无硬上限** — 失败任务自动重试，指数退避，但不设硬上限
- **失败不阻塞** — 单个任务失败不影响其他任务继续
- **状态持久化** — 调度器状态也持久化，随时可恢复

**为什么不用 bailian-agent 的 SubagentManager？**

bailian-agent 的 SubagentManager 已经实现了并发限制、队列、自动重试等特性，但我们选择重新实现：
- 需要更灵活的令牌桶频率控制
- 需要优先级队列
- 需要失败不阻塞的语义
- 需要状态持久化

### 3. 素材整理 (organize/)

素材整理是 ConfWrite 的核心创新。它先分析需求，再按照大纲规划分章节组织素材包。

**流程**：

```
参考资料目录
    ↓
扫描 + 分类 (scanner.ts)
    ↓
格式转换 (converter.ts) — PDF/Word/HTML → Markdown
    ↓
JSON 索引 (indexer.ts) — 按主题域分区
    ↓
数据基线 (baseline-extractor.ts) — 提取跨章节共享数据
    ↓
章节映射 (chapter-mapper.ts) — 章节 → 索引 → 资料文件
    ↓
素材包生成 (kit-generator.ts) — 每个章节一个素材包
```

**章节素材包结构**：

```markdown
# ch005 素材包：国资委资产管理政策要求

## 章节信息
- 编号：1.1.2.1
- 标题：国资委资产管理政策要求
- 所属：篇1 / 1.1.2 对本项目建设背景的理解
- 索引：IDX-01

## 大纲要点
- 要点1
- 要点2

## 必读文件（使用绝对路径）
1. reference_material/01_政策与背景/01A_xxx.md
2. reference_material/01_政策与背景/01B_xxx.md

## 关键数据（摘自 data-baseline.json）
- 关键数据点1
- 关键数据点2

## 关键内容摘要
### 文件1：01A_xxx.md
- 核心内容：...
- 关键数据点：...

## 写作要点提示
- 特别注意...
```

**为什么需要素材包？**

直接让 writer subagent 读取所有参考资料会导致：
- 上下文窗口溢出
- 信息过载，写作质量下降
- 无法保证数据一致性

素材包为每个章节提供：
- 精确的必读文件列表
- 关键数据摘要
- 写作要点提示

### 4. 知识库 vs 项目素材

**知识库** (knowledge/)：
- 位置：package 内置 / `~/.pi/agent/knowledge/`
- 内容：写作方法论、审阅标准、图表规范、行业模板、反模式教训
- 作用域：跨项目通用
- 用途：给 subagent 注入角色知识

**项目素材** (projects/<slug>/assets/)：
- 位置：`projects/<slug>/assets/`
- 内容：参考资料、JSON 索引、数据基线、章节素材包、大纲
- 作用域：单项目专属
- 用途：给 writer 提供项目上下文

**为什么严格分离？**

知识库是通用的，可以被多个项目共享。项目素材是专属的，只服务于当前项目。

如果混在一起：
- 项目素材会污染知识库
- 知识库更新会影响所有项目
- 无法独立管理

## 状态管理

### 状态结构

```typescript
interface ProjectState {
  // Metadata
  version: number;
  project: string;
  projectDir: string;
  createdAt: string;
  lastUpdated: string;

  // Phase
  currentPhase: Phase;  // '0a' | '0b' | '1' | '2' | ... | 'done'
  status: string;       // 'init' | 'organizing' | 'writing' | ...

  // Chapters
  chapters: Record<string, ChapterState>;
  round: number;

  // Scheduler
  scheduler?: SchedulerState;

  // Tasks
  tasks?: SubagentTask[];

  // Execution log
  executionLog?: ExecutionLogEntry[];
}
```

### 持久化策略

- **原子写入** — 先写 `.tmp` 文件，再 `rename`（Windows 上 rename 是原子的）
- **Windows 兼容** — 如果 rename 失败，fallback 到 copy + delete
- **类型安全** — 使用 TypeBox 定义 schema，编译时检查类型

### 状态迁移

状态结构有 `version` 字段，支持未来迁移：

```typescript
if (state.version === 1) {
  // 迁移到 version 2
  state.version = 2;
  // ...
}
```

## 执行模型

### 调度器工作流

```
tick()
  ↓
从持久化 state 恢复
  ↓
检查哪些任务已完成、哪些还在跑、哪些还没开始
  ↓
找出"就绪"任务（依赖已满足 + 未开始/需重试）
  ↓
按令牌桶节奏 spawn
  ↓
完成的标记完成，失败的自动重试
  ↓
直到没有就绪任务 → 返回阶段结果
```

### 任务状态流转

```
queued → running → completed ✓
              ↓
           failed → retrying → running → ...
              ↓
         多轮失败 → failed（标记，不阻塞）
              ↓
         用户 steering 修正 → queued（重新入队）
```

### 依赖管理

任务之间可以有依赖关系：

```typescript
interface SubagentTask {
  id: string;
  dependencies: string[];  // 依赖的任务 ID 列表
}
```

调度器检查依赖：

```typescript
function areDependenciesMet(task: SubagentTask): boolean {
  return task.dependencies.every(depId => {
    const dep = getTask(depId);
    return dep.status === 'completed' || dep.status === 'skipped';
  });
}
```

**示例**：

- Phase 4a 内部：ch001、ch002、ch003 无依赖，全部独立并行
- Phase 4b 依赖 4a：reviewer-ch001 需要 ch001-v1.md 存在
- 如果 ch003 最终 failed → reviewer-ch003 无法启动 → 标记 blocked
- 但不阻塞 reviewer-ch001/002/004/005/006

## 测试策略

**TDD（测试驱动开发）**：

1. 先写测试（描述期望行为）
2. 运行测试（应该失败）
3. 写实现（让测试通过）
4. 重构（保持测试通过）

**测试覆盖**：

- 状态机：Phase 推进、阻塞、恢复
- 调度器：并发、频率控制、重试、依赖
- 素材整理：扫描、转换、索引、映射、生成
- 路径安全：遍历攻击、合法路径
- 状态持久化：读写、原子性、错误处理

## 安全考虑

### 路径遍历

所有用户输入的路径都经过 `safePath()` 校验：

```typescript
function safePath(basePath: string, userPath: string): string {
  const resolvedBase = resolve(basePath);
  const resolvedPath = isAbsolute(userPath)
    ? resolve(userPath)
    : resolve(resolvedBase, userPath);

  const rel = relative(resolvedBase, resolvedPath);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal detected: "${userPath}" escapes base "${basePath}"`);
  }

  return resolvedPath;
}
```

### 命令注入

所有命令执行都使用参数数组，不拼接字符串：

```typescript
// ❌ 错误
execSync(`node script.js "${userInput}"`);

// ✅ 正确
spawnSync('node', ['script.js', userInput]);
```

### 输入校验

- **Slug** — 必须是字母数字和连字符，不能包含路径分隔符
- **Chapter ID** — 必须匹配 `ch\d+` 模式
- **Phase** — 必须是预定义的枚举值

## 未来扩展

### 插件系统

未来可以支持插件，允许用户自定义：
- Phase 逻辑
- 调度策略
- 素材整理规则

### Web UI

当前通过 pi TUI 交互，未来可以提供 Web UI：
- 可视化进度
- 交互式大纲编辑
- 实时日志

### 多模型支持

当前使用 pi 默认模型，未来可以支持：
- 不同 Phase 使用不同模型
- 不同任务使用不同模型
- 模型故障自动切换
