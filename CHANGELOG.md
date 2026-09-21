# Changelog

All notable changes to ConfWrite will be documented in this file.

## [0.9.0] - 2026-09-21

**主题：全新图表布局引擎（正交路由 + 单页压缩）+ 废弃 mermaid**

### 新增
- **布局引擎** `src/diagrams/layout/`：分层 → 尺寸解算 → 正交路由 → 渲染。
  只出横平竖直的折线（无曲线、无斜线），并把画布压缩到单页可读。
- **结构化图表格式**：写手产出 `containers / nodes / edges` 三段，
  引擎按容器顺序分层、按 `high_weight` 强调关键节点、按 `crosscut` 画贯穿条。
- **布局规划与几何契约测试**：节点不重叠、容器不重叠、连线全正交、
  连线不穿节点、线段不贴节点边框、标签不压节点 —— 在真实数据上逐张校验。

### 修复（本轮实测发现）
- `description` 会吞掉整块 YAML，导致图上只剩字面量为 `id` / `from` 的节点。
- **整块缩进会让图静默失效**：解析是行首敏感的，缩进后解析出 0 个节点、
  `description` 为空 —— 写手照抄提示词示例（本身缩进 4 格）必然踩到。
- 箭头过大：`markerUnits` 默认跟随线宽，10×1.5 = 实际 15px，
  而不少连线总长只有 12~30px。
- 连线贴节点边框：只判「是否进入节点内部」，距边框 2px 的线算"通畅"，
  却没有画出来看 —— 真实数据上 20 张图里有 64 处。
- 写手提示词与知识注入**互相矛盾**（一个"严禁 mermaid"，一个"请直接使用
  mermaid 代码块"），是格式反复横跳的根因。
- `content-validator` 的图表格式检查只查 mermaid 块，对真正在用的结构化
  格式完全没生效。

### 变更（破坏性）
- **废弃 mermaid**：`mermaid-cli` / puppeteer 依赖移除，mermaid 代码块不再
  渲染，并在管线里**明确报错**（不静默少一张图）。
- 旧渲染器 `src/diagrams/generator.ts` 退役。
- 「高宽比 ≤1.5」不再是失败判据 —— 它对窄图过严（236×367 高宽比 1.56
  却轻松放得下一页）。真实约束是页面框：宽 ≤680、高 ≤900。
- 校验失败会**阻塞**进入组装阶段（知识库 layout.md 的阻塞规则）。

### 测试
96 文件 / 916 通过。真实数据回归用 `CONFWRITE_REAL_DRAFTS` 环境变量启用：
```
CONFWRITE_REAL_DRAFTS=/path/to/project/drafts/chapters npm test
```

## [0.8.0] - 2026-09-20

**主题：图表准确 + 导出完整 Word（端到端跑通）**

修复 22 个 bug，新增 70 个测试（全量 735 通过）。真机验证：清空产物后从阶段 5
重跑，流程自行走完 `5 → 6 → 7 → 8 → done`，产出 1.47 MB 的 `final.docx`
（29 张内嵌图 + TOC + 正确标题层级）。

详见 `ITERATION-COMPLETE-v0.8.0.md` 与 `BUGS.md`。

### Added

- **图表分层配色** (`src/diagrams/style.ts`)
  - `DEFAULT_LAYER_PALETTE`：接入蓝/应用绿/支撑橙/数据紫/基础灰
  - 可由 `assets/diagram-style.json` 的 `layerPalette` 覆盖（为"知识库驱动"留接口）
  - 修复前每张图仅 2 个色值，修复后 3~8 个
- **跨平台中文字体** (`src/diagrams/style.ts`)
  - `CJK_FONT_FAMILY` 回退链（Noto Sans CJK SC → Source Han Sans SC → Microsoft YaHei）
  - 修复前硬编码 Windows 字体，Linux 上 0 匹配（含连接线标签的漏网处）
- **图表注入** (`src/diagrams/injector.ts`)
  - 组装时把 `diagram-start` 块替换为图片引用（修复前 29 张图一张都没进文档）
- **图表描述解析器** (`src/diagrams/description-parser.ts`)
  - 兼容中文全角冒号、剥离列表前缀、支持多跳链 `A → B → C → D`
  - `（注解）` 提取为边的 label
- **阶段 `onEnter` 钩子** (`src/orchestrator/phases.ts`)
  - 进入阶段时清理本阶段产物的残件，防止残留文件让阶段跳过自己的工作
- **终态阶段 `done`** — 注册进 phases 表，收尾不再报错
- **`waitPoint.timing`** — `entry`（纯人工确认点）/ `after-execute`（先干活再暂停）
- **phase 8 依赖预检** — 缺 pandoc 时给出 pacman / apt / pandoc.org 安装指引

### Changed

- **Writer/Reviewer/Fixer prompt 篇幅口径改为 ch 级**（`MIN_CHAPTER_CHARS = 8000`）
  - 原先写「每个子节不少于 5000 字」，导致单个 ch 被要求 135,000 字
    （模型单次回答仅能产出约 18,000 字，差 7.5 倍），引发"量字数→补内容→再量"循环
- **章节分隔符 `---` → `***`**
  - `---` 紧跟标题会被 pandoc 识别为 YAML 元数据块，导致导出直接失败（退出码 64）
- **组装产物加文档标题并降级标题层级**
  - 有标题时目录降为 h2、章节内容整体降一级（Heading1 从 17 个降到 1 个）
  - 章节首个标题追加 `{#chXXX}` 锚点，TOC 链接从此可跳转
- **docx 导出传 `cwd`** — pandoc 按**进程 cwd** 解析相对图片路径，
  以前 29 张图全部取不到而被替换成 alt 文字
- **导出未指定 title 时自动解析** — 从 `outline.md` 一级标题取

### Fixed

- 熔断后外层循环不退出的空转（实测刷 12,036 条通知）
- `stoppedReason` 被 `max_ticks` 无条件覆盖，掩盖真实终止原因
- phase 8 的 `export_docx` 动作无人处理，导出从未发生
- waitPoint 跳过 `execute()`，让用户审阅不存在的文件
- `init` 复制 `dist/knowledge`（编译产物）而非真正的知识库
- `checkDependencies()` 是死代码
- **残留产物让阶段跳过自己的工作**（pandoc 报错却报成功，产物是坏文件）
- **图表缓存只比对源哈希、不检查产物是否存在**（清图留 manifest 时 29 张全 skip）
- **到达 `done` 后收尾报 `未知 Phase: done`**，成功运行看起来像失败

---

## [0.7.3] - 2026-09-20

### Added

- **素材包相关文件增加路径信息** (`src/organize/kit-generator.ts`)
  - 输出 `- 路径: <relativePath>`，LLM 无需盲猜文件位置
  - 修复前约 87% 的工具调用因路径猜测失败
- **跨平台 shell 工具选择** (`src/scheduler/pi-executor.ts`)
  - Windows 用 powershell，Linux/macOS 用 bash
- **详细文件日志** (`src/logging/index.ts`)
  - `logs/confwrite-log.json`（任务级）+ `logs/subagent-*.log`（turn/工具级）
- **Writer prompt 声明素材文件位置** — 明确 `reference_material/` 约定

### Fixed

- `package.json` build 脚本改为直接调用 tsc，避免 Windows node_modules shim 在
  Linux 上失败；`scripts/install.sh` / `install.ps1` 补 `npm install`

---

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
