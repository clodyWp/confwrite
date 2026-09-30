# 迭代规划 — 2026-09-30 讨论记录

> 来源：eastE 项目端到端验证后的功能讨论
> 状态：功能 1+2 已完成，功能 3 待排期

---

## 一、已完成功能

### ✅ 功能 1：配置系统

**实现内容**：
- 新增 `src/config/loader.ts` — 配置加载器
- 支持 `confwrite.config.json` 配置文件
- TypeBox schema 验证，fail-fast
- 集成到 `TaskExecutor` 和 `OutputValidator`

**可配置参数**：
```json
{
  "writing": { "minChapterChars": 5000, "maxRounds": 5 },
  "review": { "acceptMediumMax": 3, "rejectHighMin": 3 },
  "scheduler": { "maxConcurrency": 3, "maxTurnsPerTask": 40 },
  "rateLimit": { "baseDelayMs": 60000, "phase1Retries": 2 },
  "tokenBucket": { "size": 10, "refillRate": 0.5 }
}
```

**测试**：9 个配置加载测试通过

### ✅ 功能 2+4：素材包写作指令增强

**实现内容**：
- 新增 `knowledge/writing-styles/` 知识库目录
- 5 种风格指南：概述型、功能描述型、承诺型、列表型、流程型
- 扩展 `KnowledgeLoader` 支持写作风格匹配
- `KitGenerator` 自动注入风格指南到素材包

**匹配规则**：
- 优先按 `matchCategories` 匹配素材分类
- 其次按 `tags` 匹配章节标题关键词

**测试**：11 个写作风格测试通过

---

## 二、待实现功能

### 功能 3：大纲生成工具（待排期）

**问题**：Phase 2 只是 waitPoint，用户需手动创建 outline.md。

**方案**：待定。三种可能路径：
1. LLM 分析输入文档自动生成
2. 从招标条款 [T-xxx] 规则映射
3. 预定义模板 + 用户调整

**状态**：方案未定，估时不可靠，建议单独设计讨论后再排期。

---

## 三、已验证的系统能力

通过 eastE 项目（151 章，东方电气资产管理平台技术方案）完成端到端验证：

| 能力 | 结果 |
|------|------|
| 完整写作流程 Phase 0a→8→done | ✅ 151 章全部完成 |
| 图表生成 | ✅ 143 张图表，全部嵌入 DOCX |
| 审阅-修复循环 | ✅ Phase 4b/4c/4d 正常收敛 |
| 最终导出 | ✅ final.md (4.6MB) + final.docx (7.9MB) |
| Prompt 注入 subagent | ✅ 数据收集→构建→写文件→subagent 读取执行 |

---

## 二、待实现功能

### 功能 1：配置系统（优先级 🔴）

**问题**：用户无法修改硬编码参数（如 MIN_CHAPTER_CHARS），必须改源码重编译。

**方案**（已通过 Council 讨论，oracle 高置信度）：
- 启动时加载 `confwrite.config.json`
- 三级优先级：`DEFAULT < config.json < 代码 override`
- 不实现热重载（状态机一致性）
- TypeBox schema 验证，fail-fast

**可配置参数（15 项）**：

| 分类 | 参数 | 当前值 |
|------|------|--------|
| 写作 | minChapterChars | 8000 |
| 写作 | maxRounds | 5 |
| 审阅 | acceptMediumMax | 3 |
| 审阅 | rejectHighMin | 3 |
| 调度 | maxConcurrency | 1 |
| 调度 | maxTurnsPerTask | 40 |
| 调度 | taskTimeoutMs | 600000 |
| 调度 | maxTaskRetries | 1 |
| 调度 | maxIterations | 100 |
| 限流 | rateLimitDelayMs | 60000 |
| 限流 | phase1Retries | 2 |
| 限流 | phase1Multiplier | 2 |
| 限流 | phase2Multiplier | 12 |
| 令牌桶 | tokenBucketSize | 10 |
| 令牌桶 | tokenRefillRate | 0.5 |

**配置文件格式**：
```json
{
  "writing": { "minChapterChars": 5000, "maxRounds": 5 },
  "review": { "acceptMediumMax": 3, "rejectHighMin": 3 },
  "scheduler": { "maxConcurrency": 3, "maxTurnsPerTask": 40 },
  "rateLimit": { "baseDelayMs": 60000, "phase1Retries": 2 },
  "tokenBucket": { "size": 10, "refillRate": 0.5 }
}
```

**涉及文件**：
- 新增：`src/config/schema.ts`（TypeBox 定义）
- 新增：`src/config/loader.ts`（加载+验证）
- 修改：`src/index.ts`（runWriteLoop 加载配置）
- 修改：`src/writing/task-executor.ts`（替换 MIN_CHAPTER_CHARS 硬编码）
- 修改：`src/writing/orchestrator.ts`（替换 maxRounds 硬编码）
- 修改：`src/scheduler/runner.ts`（替换 429 退避硬编码）

---

### 功能 2：章节风格分类（优先级 🟡）

**问题**：所有章节使用相同的写作提示，无法区分概述型/功能型/承诺型。

**方案**：在 KitGenerator 中加风格分类器，按类型注入不同写作指令。

**分类规则**（基于标题关键词 + 素材分类，不需要 LLM）：

| 风格 | 标题特征 | 写作指令要点 |
|------|----------|-------------|
| 概述型 | 概述/背景/总论/简介/理解 | 宏观→细节，总-分结构 |
| 功能描述型 | 功能/模块/方案/设计/架构 | 按模块描述，多用表格+图表 |
| 承诺型 | 承诺/保障/计划/服务/运维 | 明确承诺，SLA 指标 |
| 列表型 | 清单/交付/列表 | 条目清晰，分类明确 |
| 流程型 | 方法/流程/步骤/实施 | 步骤明确，流程图 |

**涉及文件**：
- 修改：`src/organize/kit-generator.ts`（加 classifyStyle + 风格化写作指令）

---

### 功能 3：大纲生成工具（优先级 🟡）

**问题**：Phase 2 只是 waitPoint，用户需手动创建 outline.md。

**方案**：待定。三种可能路径：
1. LLM 分析输入文档自动生成
2. 从招标条款 [T-xxx] 规则映射
3. 预定义模板 + 用户调整

**涉及文件**：
- 新增：`src/commands/outline.ts`
- 新增：`src/organize/outline-generator.ts`
- 修改：`src/index.ts`（注册 /confwrite:outline 命令）
- 修改：`src/orchestrator/phases.ts`（Phase 2 execute 逻辑）

---

### 功能 4：行文风格配置（优先级 🟢，配合功能 1）

**问题**：无法全局控制文档行文风格。

**方案**：配置文件中指定风格指南文件路径，KitGenerator 读取后注入所有素材包。

```json
// confwrite.config.json
{ "writing": { "styleGuide": "assets/style-guide.md" } }
```

**涉及文件**：
- 修改：`src/config/schema.ts`（加 styleGuide 字段）
- 修改：`src/organize/kit-generator.ts`（读取并注入风格指南）

---

## 三、用户意图总结

| 意图 | 证据 |
|------|------|
| 减少手动操作 | 询问大纲生成工具 |
| 提高可控性 | 要求配置系统，不想改源码 |
| 提升写作质量 | 关注章节风格分类、行文风格 |
| 系统智能化 | 自动识别章节类型 |

---

## 四、建议实现顺序

1. **配置系统**（1-2 天）— 解决当前痛点，为后续功能提供基础
2. **章节风格分类**（1 天）— 改动小，收益明显
3. **行文风格配置**（0.5 天）— 配合配置系统
4. **大纲生成工具**（2-3 天）— 复杂度高，需要设计讨论

---

## 五、技术备忘

### Prompt 注入流程（完整链路）
```
StateMachine.tick() → Phase action → Dispatcher.dispatch()
  → 读取素材包/草稿/审阅报告
  → TaskExecutor 构建 prompt 文本
  → Task { id, type, prompt } → Scheduler 入队
  → Runner.runAll() → PiSubagentExecutor.execute()
    → 写 prompt 到 .confwrite-tasks/{id}.md
    → createAgentSession() 创建子会话
    → session.prompt("Read the task file...")
```

### 素材包生成流程（9 步）
```
/organize → Scanner → Converter → Indexer → BaselineExtractor
  → OutlineParser → ChapterMapper → KitGenerator → 保存 chapter-kits/
```

### 素材包内容结构
```
# {ch} 素材包：{title}
## 章节信息（ID、标题、分类）
## 章节描述（来自大纲）
## 相关文件（匹配到的素材文件列表）
## 关键数据（作用域过滤后的 baseline metrics）
## 技术术语（作用域过滤后的 terms）
## 需求要点（作用域过滤后的 requirements）
## 写作提示（当前硬编码通用模板）
## 图表知识库（从 knowledge/ 注入）
```

### 远程机器状态
- water-ali: confwrite 已安装，eastE 项目已完成（done）
- MIN_CHAPTER_CHARS 已改为 5000（dist 直接修改）
- 扩展路径：~/.pi/agent/extensions/confwrite → /home/water/confwrite
