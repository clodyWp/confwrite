# ConfWrite 使用说明

> **ConfWrite** 是一个 pi 原生扩展包，用于生成 10+ 章节、百万字级长文档（技术方案、白皮书、手册等）。  
> 核心特性：确定性状态机控制流程、素材包体系保证数据一致性、Write-Review-Fix 自动循环、多格式导出。

---

## 目录

- [1. 安装](#1-安装)
- [2. 快速开始](#2-快速开始)
- [3. 命令详解](#3-命令详解)
  - [3.1 /confwrite:init](#31-confwriteinit)
  - [3.2 /confwrite:organize](#32-confwriteorganize)
  - [3.3 /confwrite:write](#33-confwritewrite)
  - [3.4 /confwrite:status](#34-confwritestatus)
  - [3.5 /confwrite:resume](#35-confwriteresume)
  - [3.6 /confwrite:export](#36-confwriteexport)
- [4. 完整工作流](#4-完整工作流)
  - [Step 1: 初始化项目](#step-1-初始化项目)
  - [Step 2: 导入参考资料](#step-2-导入参考资料)
  - [Step 3: 整理素材](#step-3-整理素材)
  - [Step 4: 编写大纲](#step-4-编写大纲)
  - [Step 5: 启动写作](#step-5-启动写作)
  - [Step 6: 监控进度](#step-6-监控进度)
  - [Step 7: 导出文档](#step-7-导出文档)
- [5. 大纲格式规范](#5-大纲格式规范)
- [6. 素材包体系](#6-素材包体系)
  - [6.1 章节素材包 (Chapter Kit)](#61-章节素材包-chapter-kit)
  - [6.2 数据基线 (Data Baseline)](#62-数据基线-data-baseline)
  - [6.3 参考资料索引](#63-参考资料索引)
- [7. 写作管线](#7-写作管线)
  - [7.1 状态机阶段](#71-状态机阶段)
  - [7.2 Write-Review-Fix 循环](#72-write-review-fix-循环)
  - [7.3 调度器](#73-调度器)
- [8. 项目目录结构](#8-项目目录结构)
- [9. 导出格式](#9-导出格式)
- [10. 常见问题](#10-常见问题)
- [11. 高级用法](#11-高级用法)

---

## 1. 安装

### 前置条件

- Node.js >= 18
- pi coding agent (已安装)
- [可选] Pandoc >= 2.19（导出 DOCX/PDF 时需要）

### 安装步骤

```bash
# 1. 进入项目目录
cd confidenceWriter

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 打包
npm pack

# 5. 安装到 pi
pi install confwrite-0.1.0.tgz
```

安装完成后，pi 中可以使用 `/confwrite:*` 系列命令。

### 验证安装

在 pi 中输入 `/confwrite:` 应能看到所有可用命令的自动补全。

---

## 2. 快速开始

以下是一个完整的端到端示例，从零开始生成一份技术方案文档：

```bash
# 1. 初始化项目
/confwrite:init my-proposal

# 2. 将参考资料复制到项目目录
#    （手动将文件放入 projects/my-proposal/reference_material/）

# 3. 整理素材
/confwrite:organize

# 4. 编写大纲（手动编辑 outline.md）

# 5. 再次整理素材（此时会根据大纲生成章节素材包）
/confwrite:organize

# 6. 启动写作流程
/confwrite:write

# 7. 查看进度
/confwrite:status

# 8. 导出最终文档
/confwrite:export md
/confwrite:export html
/confwrite:export docx
```

---

## 3. 命令详解

### 3.1 /confwrite:init

**功能**：初始化 ConfWrite 项目，创建完整的目录结构和状态文件。

**语法**：
```
/confwrite:init <slug> [material-dir]
```

**参数**：
| 参数 | 必填 | 说明 |
|------|------|------|
| `slug` | 是 | 项目标识符（仅允许字母、数字、连字符） |
| `material-dir` | 否 | 现有资料目录路径，会自动复制到项目中 |

**示例**：
```bash
# 基本用法
/confwrite:init my-proposal

# 带现有资料目录
/confwrite:init my-proposal ./existing-docs

# 带需求文档
/confwrite:init my-proposal ./docs --requirements ./requirements.md
```

**创建的项目结构**：
```
projects/my-proposal/
├── inputs/                    # 需求文档
│   ├── agent-instructions.md  # Agent 写作指引（自动生成）
│   └── feedback/              # 反馈收集
├── reference_material/        # 原始参考资料
├── assets/
│   ├── indexes/               # JSON 索引
│   ├── chapter-kits/          # 章节素材包
│   ├── excerpts/              # 摘录
│   └── generated/             # 生成的中间产物
├── drafts/
│   └── chapters/              # 章节草稿
├── review/                    # 审阅结果
├── figures/                   # 图表
├── assembly/                  # 组装产物
├── output/                    # 最终定稿
├── outline.md                 # 大纲（模板）
└── project-state.json         # 项目状态
```

**注意事项**：
- `slug` 只能包含 `[a-z0-9-]`，不能包含空格或特殊字符
- 如果项目已存在，会返回错误提示
- 项目创建在 `<workspace>/projects/<slug>/` 路径下

---

### 3.2 /confwrite:organize

**功能**：整理项目素材——扫描参考资料、格式转换、生成索引、提取数据基线、生成章节素材包。

**语法**：
```
/confwrite:organize [project-dir]
```

**参数**：
| 参数 | 必填 | 说明 |
|------|------|------|
| `project-dir` | 否 | 项目目录路径（默认当前目录） |

**执行流程**：
1. **扫描资料** — 递归扫描 `reference_material/` 下所有文档文件
2. **格式转换** — 将 PDF/Word/HTML 转换为 Markdown
3. **生成索引** — 创建 JSON 格式的索引文件（`assets/indexes/index.json`）
4. **提取数据基线** — 从资料中提取关键指标、时间线、技术术语、需求
5. **解析大纲** — 解析 `outline.md` 中的章节结构
6. **章节映射** — 将每个章节与相关资料文件关联
7. **生成素材包** — 为每个章节生成独立的素材包文件

**输出示例**：
```
素材整理完成！
扫描: 15 个文件
转换: 12/15 成功
索引: 12 个文件, 5 个分类
基线: 23 个指标
映射: 12 个章节
素材包: 12/12 生成成功
```

**支持的资料格式**：
| 格式 | 扩展名 | 说明 |
|------|--------|------|
| Markdown | `.md` | 直接使用 |
| PDF | `.pdf` | 需要转换为 MD |
| Word | `.docx` | 需要转换为 MD |
| HTML | `.html`, `.htm` | 需要转换为 MD |

**自动分类规则**：
- 目录名包含关键词 → 按目录分类
- 文件名包含关键词 → 按文件名分类
- 默认分类为「未分类」

**注意事项**：
- 如果 `outline.md` 不存在，跳过章节映射和素材包生成
- 可以多次运行（例如先导入资料运行一次，写完大纲再运行一次）
- 每次运行会覆盖之前的索引和素材包

---

### 3.3 /confwrite:write

**功能**：推进写作流程。执行状态机一步，自动判断当前应执行的操作。

**语法**：
```
/confwrite:write [project-dir]
```

**参数**：
| 参数 | 必填 | 说明 |
|------|------|------|
| `project-dir` | 否 | 项目目录路径（默认当前目录） |

**状态机行为**：
- 检查当前阶段的前置条件
- 判断是否满足退出条件 → 自动进入下一阶段
- 执行当前阶段的操作
- 返回下一步待执行的动作

**输出示例**：
```
⏩ 2 → 3 (素材准备)
📝 [3] 素材准备: Phase 3: 素材准备
待执行:
{
  "action": "prepare_materials",
  "params": { "projectDir": "/path/to/project" }
}
```

**注意事项**：
- 每次调用只推进一步
- 如果前置条件不满足，会返回阻塞错误
- 阶段转换是确定性的（TypeScript 状态机控制），不依赖 LLM 判断

---

### 3.4 /confwrite:status

**功能**：查看项目当前进度。

**语法**：
```
/confwrite:status [project-dir]
```

**输出示例**：
```
📊 项目: my-proposal
阶段: 4a (写作)
状态: writing
章节: 8/12 完成, 2 失败, 2 进行中
轮次: 1
```

**字段说明**：
| 字段 | 说明 |
|------|------|
| 项目 | 项目 slug |
| 阶段 | 当前 Phase ID 和名称 |
| 状态 | 项目状态（init/organizing/writing/done 等） |
| 章节 | 完成数/总数，以及失败和进行中的数量 |
| 轮次 | 当前写作轮次（每次 Review 不通过会递增） |

---

### 3.5 /confwrite:resume

**功能**：恢复中断的项目。功能等同于 `/confwrite:write`，但会先显示当前状态。

**语法**：
```
/confwrite:resume [project-dir]
```

**使用场景**：
- 中断后重新启动写作流程
- 检查当前状态并继续执行

---

### 3.6 /confwrite:export

**功能**：将所有章节组装并导出为指定格式。

**语法**：
```
/confwrite:export <format> [output-path]
```

**参数**：
| 参数 | 必填 | 说明 |
|------|------|------|
| `format` | 是 | 导出格式：`md`、`html`、`docx`、`pdf` |
| `output-path` | 否 | 输出文件路径（默认 `output/document.<format>`） |

**示例**：
```bash
# 导出为 Markdown
/confwrite:export md

# 导出为 HTML（指定路径）
/confwrite:export html output/my-doc.html

# 导出为 Word（需要 Pandoc）
/confwrite:export docx

# 导出为 PDF（需要 Pandoc + LaTeX）
/confwrite:export pdf
```

**输出示例**：
```
✅ 导出成功！
输出: /path/to/project/output/document.md
章节: 12
字数: 45230
字符: 68421
```

**格式说明**：
| 格式 | 依赖 | 说明 |
|------|------|------|
| `md` | 无 | 直接拼接所有章节 Markdown |
| `html` | 无 | 内置 Markdown→HTML 转换器，包含样式 |
| `docx` | Pandoc | 通过 Pandoc 转换，支持模板 |
| `pdf` | Pandoc + LaTeX | 通过 Pandoc 转换 |

**注意事项**：
- 导出顺序由 `outline.md` 中 `ch` 标记的顺序决定
- 自动在章节之间添加分页符
- 可选生成目录（TOC）
- DOCX/PDF 导出需要安装 Pandoc

---

## 4. 完整工作流

### Step 1: 初始化项目

```bash
/confwrite:init tech-proposal
```

这会创建 `projects/tech-proposal/` 及其完整子目录。

### Step 2: 导入参考资料

将你的参考资料文件放入 `reference_material/` 目录：

```bash
# 手动复制文件
cp ~/docs/api-spec.md projects/tech-proposal/reference_material/
cp ~/docs/architecture.pdf projects/tech-proposal/reference_material/
cp ~/docs/requirements.docx projects/tech-proposal/reference_material/
```

**或者**在初始化时指定资料目录：

```bash
/confwrite:init tech-proposal ~/existing-docs
```

**支持的资料类型**：
- 技术文档（API 规范、架构设计、数据库设计等）
- 需求文档（PRD、用户需求等）
- 业务文档（业务流程、行业报告等）
- 任何 Markdown、PDF、Word、HTML 文件

### Step 3: 整理素材

```bash
/confwrite:organize
```

这一步会：
- 扫描所有资料文件
- 转换非 Markdown 格式
- 生成 JSON 索引
- 提取数据基线（性能指标、时间线、技术术语等）

> **提示**：此时还没有大纲，所以不会生成章节素材包。这是正常的。

### Step 4: 编写大纲

编辑 `projects/tech-proposal/outline.md`，按照[大纲格式规范](#5-大纲格式规范)编写：

```markdown
# 技术方案

## 1. 项目概述
ch001 1.1 项目背景
ch002 1.2 建设目标
ch003 1.3 系统范围

## 2. 架构设计
ch004 2.1 整体架构
ch005 2.2 微服务划分
ch006 2.3 技术选型

## 3. 详细设计
ch007 3.1 用户服务
ch008 3.2 数据服务
ch009 3.3 通知服务

## 4. 部署方案
ch010 4.1 部署架构
ch011 4.2 监控告警

## 5. 安全设计
ch012 5.1 认证授权
ch013 5.2 数据安全
```

### Step 5: 再次整理素材

大纲写完后，**再次运行** organize 来生成章节素材包：

```bash
/confwrite:organize
```

这次会额外执行：
- 解析大纲中的 `ch` 标记
- 将每个章节与相关资料文件映射
- 为每个章节生成素材包（`assets/chapter-kits/ch001.md` ... `ch013.md`）

### Step 6: 启动写作

```bash
/confwrite:write
```

状态机会自动推进：
1. 检测到 `outline.md` 存在 → 进入素材准备阶段
2. 检测到素材包已生成 → 进入写作阶段 (4a)
3. 为每个待写章节生成 Writer subagent
4. Writer 完成后自动进入审阅阶段 (4b)
5. Reviewer 给出 accept/revise/reject 决定
6. 需要修改的章节进入修复阶段 (4c)
7. 所有章节通过后进入图表阶段 (5)
8. 最终进入组装阶段 (6)

每次 `/confwrite:write` 推进一步。持续调用直到完成。

### Step 7: 监控进度

随时查看项目状态：

```bash
/confwrite:status
```

### Step 8: 导出文档

所有章节完成后，导出最终文档：

```bash
# 导出 Markdown
/confwrite:export md

# 导出 HTML（带样式）
/confwrite:export html

# 导出 Word（需要 Pandoc）
/confwrite:export docx

# 导出 PDF（需要 Pandoc + LaTeX）
/confwrite:export pdf
```

---

## 5. 大纲格式规范

大纲文件 `outline.md` 是 ConfWrite 的核心输入之一，它决定了文档的结构和 subagent 的调度粒度。

### 基本格式

```markdown
# 文档标题

## 篇/卷 标题（可选）
### 1. 章标题
ch001 1.1 节标题
ch002 1.2 节标题

### 2. 章标题
ch003 2.1 节标题
```

### 关键规则

1. **`ch` 前缀标记**：只有带 `ch` 前缀的行才会被识别为独立的写作单元
2. **编号格式**：`ch` 后面跟 3 位数字（`ch001` ~ `ch999`），最多支持 999 章
3. **顺序决定导出顺序**：导出时按 `ch` 编号顺序组装
4. **编号必须唯一**：每个 `ch` 编号只能出现一次

### 粒度控制

```markdown
# 方案 A: 每节一个 subagent（推荐）
ch001 1.1 项目背景
ch002 1.2 建设目标

# 方案 B: 合并为更大的章节
ch001 1. 项目概述（包含背景、目标、范围）
```

**建议**：
- 每章 2000~5000 字为宜
- 过大的章节拆分为多个 `ch`
- 过小的章节可以合并
- 10~30 章是合理的范围

### 层级结构

大纲的 Markdown 标题层级（`#`、`##`、`###`）用于组织文档结构，但不影响 subagent 调度。只有 `ch` 标记的行才是调度单元。

```markdown
## 1. 概述
### 1.1 背景
ch001 项目背景与目标      ← 这是一个调度单元
### 1.2 范围
ch002 系统范围与边界      ← 这是另一个调度单元
```

---

## 6. 素材包体系

ConfWrite 的核心创新是**章节素材包 (Chapter Kit)** 模式，确保每个 Writer subagent 都能获得精确、完整的上下文。

### 6.1 章节素材包 (Chapter Kit)

每个章节对应一个素材包文件，位于 `assets/chapter-kits/chXXX.md`。

**素材包内容示例**：

```markdown
# ch001 素材包：系统概述

## 章节信息
- **章节 ID**: ch001
- **标题**: 系统概述
- **相关分类**: 技术, 业务

## 相关文件
共 3 个相关文件：

- **api-spec.md** (技术)
  - 摘要: API 规范文档，定义了系统的接口标准...
- **architecture.md** (技术)
  - 摘要: 系统架构设计文档，描述了微服务架构...
- **requirements.md** (业务)
  - 摘要: 业务需求文档，包含用户角色和业务流程...

## 关键数据
以下是从资料中提取的关键指标：

- **系统可用性**: 99.99%
- **响应时间**: < 100ms
- **并发用户数**: 10000

## 技术术语
确保在写作中正确使用以下术语：

Kubernetes, PostgreSQL, Redis, RabbitMQ, RESTful, OAuth2

## 需求要点
写作时需要覆盖以下需求：

- 必须支持多租户架构
- 需要实现细粒度的权限控制
- 必须支持实时数据同步

## 写作提示
1. 仔细阅读相关文件，理解上下文
2. 确保使用正确的技术术语
3. 引用关键数据时保持一致性
4. 覆盖所有需求要点
5. 保持与整体文档风格一致
```

**Writer subagent 的工作流程**：
1. 阅读自己的素材包
2. 根据"相关文件"列表，用 `read` 工具读取具体资料
3. 根据"大纲要点"组织章节结构
4. 确保引用来源、数据与基线一致

### 6.2 数据基线 (Data Baseline)

数据基线文件 `assets/data-baseline.json` 包含从所有参考资料中提取的共享数据：

```json
{
  "sourceFiles": 15,
  "metrics": {
    "系统可用性": "99.99%",
    "响应时间": "< 100ms",
    "并发用户数": "10000",
    "数据存储容量": "10TB"
  },
  "timeline": {
    "项目启动": "2024年1月",
    "预计完成": "2024年12月"
  },
  "technicalTerms": [
    "Kubernetes", "PostgreSQL", "Redis", "RabbitMQ",
    "RESTful", "OAuth2", "Microservice"
  ],
  "requirements": [
    "必须支持多租户架构",
    "需要实现细粒度的权限控制",
    "必须支持实时数据同步"
  ],
  "generatedAt": "2024-01-15T10:30:00.000Z"
}
```

**所有 Writer 必须引用数据基线中的数字，不得编造数据。**  
**所有 Reviewer 必须核查章节内容是否与基线一致。**

### 6.3 参考资料索引

`assets/references-index.md` 是人类可读的资料清单，按分类组织：

```markdown
# 参考资料索引

共 15 个参考资料文件。

## 技术 (8 个文件)

### API 规范文档
- **文件**: api-spec.md
- **大小**: 45.2 KB
- **摘要**: 本文档定义了系统的 API 接口规范...
- **关键词**: api, 接口, restful, 规范

## 业务 (4 个文件)
...
```

---

## 7. 写作管线

### 7.1 状态机阶段

ConfWrite 使用确定性状态机控制整个写作流程。LLM 只负责内容生成，不参与流程决策。

| Phase | 名称 | 说明 | 前置条件 |
|-------|------|------|----------|
| `0a` | 项目初始化 | 创建项目结构 | 无 |
| `0b` | 素材整理 | 扫描、索引、生成素材包 | 项目已初始化 |
| `1` | 需求分析 | 分析需求文档 | 需求文档存在 |
| `2` | 大纲规划 | 人机协作编写大纲 | 需求已分析 |
| `3` | 素材准备 | 根据大纲整理素材 | 大纲已编写 |
| `4a` | 写作 | Writer subagent 写章节 | 大纲和素材就绪 |
| `4b` | 审阅 | Reviewer subagent 审阅 | 章节已写完 |
| `4c` | 修复 | Fixer subagent 修复问题 | 审阅要求修改 |
| `5` | 图表 | 生成图表 | 所有章节通过审阅 |
| `6` | 组装 | 拼接所有章节 | 图表完成 |
| `7` | 定稿 | 最终审校 | 组装完成 |
| `8` | 导出 | 生成最终文件 | 定稿完成 |

### 7.2 Write-Review-Fix 循环

```
          ┌─────────┐
          │  写作    │ ← Phase 4a: Writer subagent
          │ (write) │
          └────┬────┘
               │ 完成
               ▼
          ┌─────────┐
          │  审阅    │ ← Phase 4b: Reviewer subagent
          │(review) │
          └────┬────┘
               │
       ┌───────┼───────┐
       │       │       │
       ▼       ▼       ▼
    accept   revise   reject
       │       │       │
       ▼       ▼       ▼
    完成   ┌─────────┐  回到写作
           │  修复    │  (轮次+1)
           │  (fix)  │
           └────┬────┘
                │ 修复完成
                ▼
             回到审阅
```

**审阅决定**：
- **accept** — 质量达标，章节标记为 `completed`
- **revise** — 有小问题，进入修复阶段
- **reject** — 质量问题严重，回到写作阶段（轮次+1）

**失败隔离**：单个章节的失败不会阻塞其他章节的写作。调度器会继续处理其他章节。

### 7.3 调度器

调度器负责管理 subagent 的执行：

**令牌桶 (Token Bucket)**：
- 控制 API 调用速率，避免触发 LLM 提供商的限流
- 默认配置：桶大小 10，补充速率 0.5 token/秒
- 每次 subagent 调用消耗 1 个令牌

**优先级队列**：
- 按优先级排序（章节编号越小优先级越高）
- 相同优先级按 FIFO 顺序执行

**重试引擎**：
- 指数退避 + 随机抖动
- 基础延迟 5 秒，倍数 2x，最大延迟 60 秒
- 无硬性重试上限

---

## 8. 项目目录结构

```
projects/<slug>/
│
├── inputs/                        # 输入文档
│   ├── requirements.md            # 需求文档
│   ├── agent-instructions.md      # Agent 写作指引（自动生成）
│   └── feedback/                  # 人工反馈
│
├── reference_material/            # 原始参考资料
│   ├── api-spec.md                # 支持 MD/PDF/DOCX/HTML
│   ├── architecture.pdf
│   └── requirements.docx
│
├── assets/                        # 整理后的资产
│   ├── indexes/
│   │   └── index.json             # JSON 格式的资料索引
│   ├── chapter-kits/
│   │   ├── ch001.md               # 第 1 章素材包
│   │   ├── ch002.md               # 第 2 章素材包
│   │   └── ...
│   ├── data-baseline.json         # 数据基线（跨章节共享数据）
│   └── references-index.md        # 参考资料索引（人类可读）
│
├── outline.md                     # 大纲（含 ch 标记）
├── project-state.json             # 项目状态（状态机使用）
│
├── drafts/
│   └── chapters/
│       ├── ch001.md               # 第 1 章草稿
│       ├── ch002.md               # 第 2 章草稿
│       └── ...
│
├── review/
│   ├── ch001-review.md            # 第 1 章审阅报告
│   ├── ch002-review.md            # 第 2 章审阅报告
│   └── ...
│
├── figures/                       # 图表文件
├── assembly/                      # 组装中间产物
└── output/                        # 最终导出文件
    ├── document.md
    ├── document.html
    └── document.docx
```

---

## 9. 导出格式

### Markdown (md)

- 直接拼接所有章节
- 章节之间添加分页符 (`---`)
- 可选生成目录
- 无外部依赖

### HTML (html)

- 内置 Markdown → HTML 转换器
- 包含完整的 CSS 样式
- 支持代码高亮、表格、列表
- 可自定义标题
- 无外部依赖

### Word (docx)

- 需要安装 [Pandoc](https://pandoc.org/)
- 支持自定义模板（`--reference-doc`）
- 支持自动生成目录
- 命令示例：
  ```bash
  pandoc input.md -t docx -o output.docx --toc
  ```

### PDF (pdf)

- 需要安装 Pandoc + LaTeX 引擎
- 支持中文字体（需要配置 CJK 字体）
- 命令示例：
  ```bash
  pandoc input.md -t pdf -o output.pdf --toc --pdf-engine=xelatex
  ```

---

## 10. 常见问题

### Q: 项目初始化后找不到目录？

A: 项目创建在 `<workspace>/projects/<slug>/` 下，不是 `<workspace>/<slug>/`。

### Q: organize 报告 "0 个文件"？

A: 确保资料文件已放入 `reference_material/` 目录（不是项目根目录）。

### Q: 写完后导出顺序不对？

A: 导出顺序由 `outline.md` 中 `ch` 标记的出现顺序决定。检查大纲中的编号是否正确。

### Q: 某个章节一直被 revise？

A: 查看 `review/chXXX-review.md` 了解具体问题。可以：
1. 手动编辑 `drafts/chapters/chXXX.md` 修复问题
2. 修改素材包 `assets/chapter-kits/chXXX.md` 提供更多上下文
3. 补充 `reference_material/` 中的资料后重新 organize

### Q: DOCX/PDF 导出失败？

A: 检查是否安装了 Pandoc：
```bash
pandoc --version
```
如未安装，参考 [Pandoc 安装指南](https://pandoc.org/installing.html)。

### Q: 如何修改已生成的素材包？

A: 直接编辑 `assets/chapter-kits/chXXX.md`。修改后不需要重新运行 organize（除非你修改了参考资料或大纲）。

### Q: 如何重新开始某个章节的写作？

A: 编辑 `project-state.json`，将对应章节的 `status` 改为 `pending`，然后运行 `/confwrite:write`。

### Q: 最多支持多少章？

A: 理论上最多 999 章（`ch001` ~ `ch999`）。实际建议 10~30 章，每章 2000~5000 字。

### Q: 可以并行写作多个章节吗？

A: 可以。调度器支持并行执行，受令牌桶速率限制。默认最大并发数为 3。

---

## 11. 高级用法

### 手动编辑状态

`project-state.json` 记录了项目的完整状态。高级用户可以直接编辑它：

```json
{
  "currentPhase": "4a",
  "status": "writing",
  "chapters": {
    "ch001": {
      "id": "ch001",
      "title": "系统概述",
      "status": "completed",
      "round": 1,
      "attempt": 0
    }
  },
  "round": 1
}
```

**章节状态值**：
| 状态 | 说明 |
|------|------|
| `pending` | 待写作 |
| `writing` | 写作中 |
| `written` | 已写完，待审阅 |
| `reviewing` | 审阅中 |
| `reviewed` | 已审阅，待修复 |
| `fixing` | 修复中 |
| `fixed` | 已修复 |
| `completed` | 完成（审阅通过） |
| `failed` | 失败 |
| `skipped` | 跳过 |

### 自定义 Agent 指令

编辑 `inputs/agent-instructions.md` 可以自定义 Writer/Reviewer 的行为指引。

### 批量重新整理素材

当参考资料有更新时：

```bash
# 1. 更新 reference_material/ 中的文件
# 2. 重新整理
/confwrite:organize
```

这会重新生成索引、基线和素材包，但不会覆盖已写好的章节草稿。

### 多轮迭代

如果审阅发现系统性问题（如数据基线错误），可以：

```bash
# 1. 修正参考资料
# 2. 重新整理素材
/confwrite:organize
# 3. 重置需要重写的章节状态
# 4. 继续写作
/confwrite:write
```

---

## 附录 A: 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    ConfWrite Extension               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  State   │  │ Scheduler│  │   Orchestrator   │  │
│  │ Machine  │  │          │  │                  │  │
│  │          │  │ Token    │  │  Writing         │  │
│  │ Phase    │◄─┤ Bucket   │  │  Orchestrator    │  │
│  │ Flow     │  │          │  │                  │  │
│  │          │  │ Priority │  │  Task Executor   │  │
│  │          │  │ Queue    │  │                  │  │
│  │          │  │          │  │                  │  │
│  │          │  │ Retry    │  │                  │  │
│  │          │  │ Engine   │  │                  │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            Material Organization              │   │
│  │                                               │   │
│  │  Scanner → Converter → Indexer → Baseline    │   │
│  │                                    ↓          │   │
│  │  OutlineParser → ChapterMapper → KitGenerator│   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            Assembly & Export                  │   │
│  │                                               │   │
│  │  Assembler → FormatConverter → Export        │   │
│  │              (MD/HTML/DOCX/PDF)               │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 附录 B: 测试统计

```
Test Files:  22 passed (22)
Tests:       247 passed (247)
Duration:    ~3.2s

Phase A: 状态管理 & 基础设施    48 tests
Phase B: 调度器系统             50 tests
Phase C: 素材组织系统           78 tests
Phase D: 写作管线               33 tests
Phase E: 组装与导出             34 tests
```

---

*ConfWrite v0.1.0 — 确定性长文档生成引擎*
