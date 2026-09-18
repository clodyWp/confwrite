# Changelog

All notable changes to ConfWrite will be documented in this file.

## [0.7.2] - 2025-01-16

### Added
- **上下文压缩功能** (`src/index.ts`)
  - 自动检测上下文大小，超过阈值时触发压缩
  - 配置：`compactThresholdTokens`（默认 0 = 禁用）
  - 压缩失败时重试 1 次
  - 重试仍失败时暂停执行，通知用户手动处理
  - 新增 `/confwrite:compact` 命令手动压缩上下文
  - 5 个测试覆盖

### Fixed
- 修复 `h5-selftest.test.ts` 传参错误（直接传 executor 而非 options 对象）

## [0.7.1] - 2025-01-16

### Changed
- **Subagent Prompt 改进** (`src/writing/task-executor.ts`)
  - Writer: 增加角色身份（资深技术写作者）+ 写作品味提示
  - Reviewer: 增加角色身份（资深技术审阅专家）+ 内容密度检查 + 评分锚定
  - Fixer: 角色改为资深技术写作者（非修复专家）+ 加深内容指导
  - 三个 prompt 统一反注水约束："不要通过重复、废话、空洞论述凑字数"
  - 强制字数要求：子节 ≥ 5000 字、段落 ≥ 300 字、图表前后说明 ≥ 300 字
  - 不允许降级：素材不足时仍需保证篇幅

## [0.7.0] - 2025-01-16

### Added
- **窗口配额限流** (`src/scheduler/window-limiter.ts`)
  - 滑动窗口限流器：例如"每5分钟最多3个subagent"
  - 配置：`rateLimitWindowMs`（窗口大小）+ `rateLimitMaxTasks`（最大任务数）
  - 默认禁用（值为 0），可按需开启
  - 集成到 `SchedulerRunner`，执行前等待配额
  - 14 个测试覆盖（11 单元测试 + 3 集成测试）

- **内容深度验证器** (`src/writing/content-validator.ts`)
  - 验证 Writer 输出是否符合深度要求
  - 检查子节长度 ≥ 5000 字
  - 检查段落长度 ≥ 300 字
  - 检查图表前后有描述/总结段落
  - 8 个单元测试 + 1 个 E2E 测试

### Changed
- `SchedulerConfig` 新增 `rateLimitWindowMs` 和 `rateLimitMaxTasks` 字段
- `runWriteLoop` 接受可选 `configOverride` 参数
- `SchedulerRunner` 构造函数新增限流参数
- `MockSubagentExecutor` 生成符合深度要求的长内容（74KB）

### Writer/Reviewer 深度要求更新
- **Writer prompt**：
  - 每个子节整体 ≥ **5000 字**（之前是 2000 字）
  - 每个独立段落 ≥ **300 字**
  - 图表格式：**描述 → 画图 → 总结**（图表前后必须有独立段落）
- **Reviewer prompt**：
  - 新增检查：子节是否 ≥ 5000 字
  - 新增检查：图表前后是否有文字说明
  - 不符合则标记为 revise 并指出需要扩充的部分

## [0.6.0] - 2025-01-16

### Added
- **版本化文件设计**（参考 bailian-agent/doc-chapters-v6）
  - Writer 输出：`drafts/chapters/${chapterId}-v${round}.md`
  - Reviewer 输出：`review/${chapterId}-r${round}.json`
  - Fixer 输出新版本 `v${round+1}.md`，不覆盖旧版本
  - Assembler 自动选择每个章节的最新版本
  - 向后兼容：支持非版本化文件 `ch001.md`

- **runWriteLoop 执行循环** (`src/index.ts`)
  - 完整执行链：`tick() → dispatch → execute → processTask → 循环推进`
  - 支持 executor 注入（测试用 Mock，生产用 PiSubagentExecutor）
  - 返回 `WriteLoopResult` 统计信息

- **Writer 深度 prompt**（参考 bailian-agent chapter-template.md）
  - 5 层深度结构（概念→原理→多维度→实践→进阶）
  - 强制篇幅要求（每子节≥300字，总计≥2000字）
  - 内容质量要求（论断有解释、表格对比、代码示例）

### Fixed
- **P0: Subagent 执行层缺失**
  - `/confwrite:write` 现在完整执行写作流程，不再只返回 action
  - 新增 `runWriteLoop()` 函数串联状态机和执行器

- **P0: PiSubagentExecutor 无法 spawn 子会话**
  - 添加 `ModelRuntime.create()` 处理认证和模型解析
  - 正确处理 `stopReason`：`'stop'` 和 `'toolUse'` 都是成功
  - 任务内容写入文件让 sub-agent 用 read 工具读取（避免 prompt 过大）

- **P1: 素材包文件名不匹配**
  - Dispatcher 统一读取 `${chapterId}.md`（与 KitGenerator 输出一致）

- **P1: init 未复制知识库**
  - `/confwrite:init` 现在自动复制 `knowledge/` 到项目目录

### Changed
- `task-executor.ts`：支持 round 参数，生成版本化文件路径
- `dispatcher/index.ts`：传递 round 参数，读取版本化文件
- `assembler.ts`：自动检测并选择最新版本
- `mock-executor.ts`：从 task.id 提取 round，生成版本化文件
- `pi-executor.ts`：重写，参考 pi-subagents SDK 文档

### Verified
- 真实 LLM E2E 测试：子会话成功写草稿（3212字）
- 405 tests pass, TSC clean

## [0.5.0] - 2025-01-16

### Added
- **G1: 大纲→状态自动同步** (`src/organize/chapter-syncer.ts`)
  - 在 `/confwrite:organize` 时自动从 `outline.md` 同步章节定义到 `project-state.json`
  - 新增章节自动添加为 `pending` 状态
  - 删除章节时保护进行中的章节（writing/written/reviewing 等）
  - 标题变更自动更新
  - 9 个测试覆盖

- **G2: 真实文档转换** (mammoth + pdf-parse v2)
  - DOCX → HTML → Markdown (via mammoth)
  - PDF → 文本 → Markdown (via pdf-parse v2 class API)
  - 复用 HTML→MD 转换逻辑
  - 3 个新增测试覆盖

- **G5: Phase 7 定稿处理** (`src/assemble/finalizer.ts`)
  - 文档统计（章节数、字数、标题、表格、代码块、图表、图片、链接）
  - 数据基线一致性检查（指标出现/缺失）
  - 术语一致性检查
  - 生成 `output/finalization.json` 报告
  - 7 个测试覆盖

- **H5: 模拟项目试用** (12 E2E tests)
  - `h5-mock-trial.test.ts`: 完整流程 init→organize→write→review→assemble→finalize→export
  - `h5-full-simulation.test.ts`: G1/G2/G5 集成验证
  - 使用 MockSubagentExecutor 模拟 LLM 输出

### Changed
- `organizeMaterials()` 集成 `syncChaptersFromOutline()`
- Phase 7 从 "wait_user_review" 改为实际执行 `finalize()`
- `finalizer.ts` 使用 `Record<string, string>` 格式的 metrics（与 baseline-extractor 一致）
- 依赖新增: `mammoth@^1.12.3`, `pdf-parse@^2.4.5`

### Stats
- Source files: 35
- Test files: 45
- Tests: 403
- TSC: clean

## [0.4.0] - 2025-01-16

### Added
- **SubagentExecutor 桥接** (`src/scheduler/executor.ts`)
  - 隔离调度器与执行环境
  - `MockSubagentExecutor` 用于测试
  - `PiSubagentExecutor` 用于生产（pi SDK）

- **SchedulerRunner** (`src/scheduler/runner.ts`)
  - 执行循环: 就绪任务 → 执行 → 标记
  - 支持并发控制

- **全量 E2E 测试** (`tests/e2e/full-pipeline.test.ts`)
  - init → organize → write → review → assemble → export
  - 5 个测试覆盖

### Stats
- Source files: 33
- Test files: 41
- Tests: 372

## [0.3.0] - 2025-01-16

### Added
- **Phase 5 图表管线** (`src/diagrams/`)
  - 提取 mermaid 代码块
  - 渲染 SVG (mmdc) → 转换 PNG (sharp)
  - 替换草稿中的 mermaid 为图片引用
  - 生成 `figures/manifest.json`

- **知识库加载器** (`src/knowledge/loader.ts`)
  - 加载 `knowledge/diagrams/` 下的 15 个 Markdown 文件
  - 注入 Writer prompt

### Changed
- Phase 5 重构: Writer 直接写 mermaid，Phase 5 只做提取+渲染
- 删除硬编码模板生成器

## [0.2.0] - 2025-01-15

### Added
- **Phase 3 写作** (`src/writing/task-executor.ts`)
  - Writer/Reviewer/Fixer prompt 构建
  - 审阅结果解析（JSON + free text fallback）

- **Phase 4 审阅循环** (`src/writing/orchestrator.ts`)
  - Write → Review → Fix 状态流转
  - `lastReviewVerdict` 字段控制流程

- **调度器系统** (`src/scheduler/`)
  - 令牌桶限流
  - 优先级队列
  - 指数退避重试

## [0.1.0] - 2025-01-15

### Added
- 项目初始化
- 状态机框架 (14 phases)
- 素材整理管线 (扫描→转换→索引→基线→映射→素材包)
- 组装与导出 (MD/HTML/DOCX)
- 6 个 pi 命令
- 160 个测试
