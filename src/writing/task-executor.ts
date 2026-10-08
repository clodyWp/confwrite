/**
 * TaskExecutor — 生成 subagent prompt 并解析输出
 * 
 * 文件版本化设计（参考 bailian-agent/doc-chapters-v6）：
 * - Writer: drafts/chapters/${chapterId}-v${round}.md
 * - Reviewer: review/${chapterId}-r${round}.json
 * - Fixer: 读取上一版本，输出新版本 drafts/chapters/${chapterId}-v${round+1}.md
 */
import type { Task } from '../scheduler/types.js';
import { join } from 'node:path';
import type { ConfWriteConfig } from '../config/loader.js';
import { DEFAULT_CONFIG } from '../config/loader.js';

/**
 * 审阅决定
 */
export interface ReviewDecision {
  decision: 'accept' | 'reject' | 'revise';
  confidence: number;
  reasons: string[];
}

/**
 * 数据基线（简化版，用于审阅）
 */
export interface ReviewBaseline {
  metrics: Record<string, string>;
  technicalTerms: string[];
  requirements: string[];
}

/**
 * 任务执行器
 */
/**
 * 单节（ch）正文合计字数下限（默认值）。
 *
 * 度量层级为 **ch**，不是 ch 内部的小节。
 * 历史事故：曾写「每个子节 ≥ 5000 字」，一个 ch 约 27 个小节，
 * 等于要求单次写 135,000 字（模型单次只能产出约 18,000 字），
 * 导致「量字数→补内容→再量」循环吃掉 50% 运行时间。
 */
export const MIN_CHAPTER_CHARS = 8000;

export class TaskExecutor {
  private config: ConfWriteConfig;

  constructor(config?: ConfWriteConfig) {
    this.config = config ?? DEFAULT_CONFIG;
  }
  /**
   * 生成 Writer subagent 的 prompt
   * 
   * 输出版本化文件: drafts/chapters/${chapterId}-v${round}.md
   */
  generateWriterPrompt(
    task: Task,
    kitContent: string,
    round: number = 1,
    wordBudget?: { min: number; max: number; expected: number }
  ): string {
    const outputFile = `drafts/chapters/${task.chapterId}-v${round}.md`;
    
    // 字数预算参考部分
    const wordBudgetSection = wordBudget ? `
## 字数预算参考（仅供参考，不是强制要求）

本章的字数预算为 **${wordBudget.min}-${wordBudget.max} 字**，期望值 **${wordBudget.expected} 字**。

**重要说明**：
- 字数预算是**规划参考**，帮助你了解本章应该写多详细
- **强制要求**是最低 **${this.config.writing.minChapterChars} 字**（必须达到）
- 如果预算高于门控，尽量接近预算；如果预算低于门控，以门控为准
- 不要因为预算而牺牲内容质量

---
` : '';
    
    return `# 写作任务

## 你的身份

你是一位**资深技术写作者**，拥有 10 年以上技术文档写作经验。你的写作风格：

- **专业严谨**：用词准确，逻辑清晰，避免口语化表达
- **深入浅出**：复杂概念用简单语言解释，配合具体示例
- **结构清晰**：层次分明，善用标题、列表、表格组织内容
- **注重细节**：每个论点都有论据支撑，避免空洞论述
- **追求品质**：宁可多花时间写清楚，也不敷衍了事

**写作品味**：
- 避免"正确的废话"——每句话都要有信息量
- 避免重复论述——一个观点说清楚即可
- 避免过度修饰——简洁优于华丽
- 避免堆砌术语——必要时解释，首次出现给定义
- 追求"读完就能用"——读者看完能理解原理、掌握方法、解决问题

---

你正在撰写文档的章节：**${task.chapterId}**（第 ${round} 轮）
${wordBudgetSection}
## 素材文件位置

所有素材文件都位于 **reference_material/** 目录下。素材包中列出的文件路径都是相对于这个目录的。

例如，素材包中显示 招标技术要求.md，实际路径是 reference_material/招标技术要求.md。

## 素材包

${kitContent}

---

## 深度要求（强制执行，不可降级）

### 1. 篇幅要求（强制，按 ch 级衡量）
- **本次任务产出的整个章节（本 ch）正文合计不少于 ${this.config.writing.minChapterChars} 字**
- 字数按**整节合计**衡量，**不按**内部小节（## 或 ###）分别计算
- **图表前后必须有独立段落说明**（见第 3 条）
- 宁可写得详细充分，不要写得简略空洞
- 达到 ${this.config.writing.minChapterChars} 字通常需要多个段落、多个示例、多个分析维度
- **不允许通过重复、废话、空洞论述凑字数**——每句话都要有信息量

**职责分工**：写完本章后**直接结束任务**，不要检查字数、不要反复编辑补充。
篇幅是否达标由**审阅阶段**负责测量 —— 你的任务是一次把内容写到位。

### 2. 结构层次（根据主题选择适用层次）

**Layer 1 — 概念与定义**
- 核心术语的准确定义
- 概念的边界：它是什么，不是什么
- 历史背景或演进脉络

**Layer 2 — 原理与机制**
- 底层工作原理
- 关键设计决策及其原因
- 技术细节：流程、算法、架构、数据流
- 涉及流程/架构时，使用图表描述标记

**Layer 3 — 多维度分析**
- 对比分析（用表格展示）
- 优缺点、适用场景
- 权衡取舍分析

**Layer 4 — 实践与应用**
- 具体示例、案例、配置片段
- 最佳实践
- 常见问题与解决方案

**Layer 5 — 进阶与前沿**（如适用）
- 高级用法
- 局限性和未来方向
- 生态和趋势

### 3. 图表要求（描述→画图→总结，强制）

涉及流程、架构、关系、状态时，使用图表描述标记。

**图表格式**（必须使用 diagram-start 标记，内部是 containers / nodes / edges 三段）：

\`\`\`
<!-- diagram-start
type: <architecture|flow|concept|relation|timeline|diagram>
title: <图表标题>
description: |
  <一段话说明这张图要表达什么；给审阅者看，不会画进图里>
containers:
  - id: <英文id>
    label: <分组名，≤8 字>
    nodes: [<节点id>, <节点id>]
nodes:
  - id: <英文id>
    label: <节点文字，≤12 字，需要编号就写 ①②③>
    container: <所属容器的 id>
    high_weight: true        # 仅当它是全图最关键的 ≤3 个节点之一时才写
    owner: <责任人>          # 不画进图，仅供正文引用
    timing: <时限>           # 同上
    detail: <详细说明>       # 同上
edges:
  - from: <节点id>
    to: <节点id>
    label: <箭头上的短标签，≤10 字，可省略>
    direction: forward       # forward | backward | bidirectional
    style: solid             # solid | dashed | dotted
diagram-end -->
\`\`\`

**布局铁律**（违反会被校验打回，必须逐条遵守）：

1. **一张图装下全部内容**。不要写「详见下一张图」，也不要把一个流程拆成几张。
   引擎会把图压缩到 ≤1 页：宽度 ≤680px、高宽比 ≤1.5。
2. **containers 按流程顺序列**（顺序就是层的先后），每组 ≤4 个节点，组数 ≤5。
3. **节点标签 ≤12 字**。长说明放正文，不要塞进节点。
4. **high_weight 全图最多 3 个**。
5. **横平竖直**：不要用 ASCII 画线，也不要描述箭头走向 —— 连线由引擎按正交折线自动生成。
6. **节点总数 ≤24**，连线总数 ≤28。

**严禁使用 mermaid 代码块**（代码块形式的图不会被渲染，等于这一章少了图）。

**图表类型**：
- **architecture**: 系统架构、模块划分、分层结构
- **flow**: 业务流程、操作步骤、决策分支
- **concept**: 概念关系、知识体系
- **relation**: 实体关系、数据关联
- **timeline**: 时间线、演进历程
- **diagram**: 其他类型图表

**限制**：每章最多 3 个图表标记。

**图表前后必须有文字说明**，格式：

1. **先描述**：用独立段落（至少 2-3 句话）说明图表要表达的内容、背景、关键要素
2. **再画图**：插入 diagram-start 标记
3. **再总结**：用独立段落（至少 2-3 句话）总结图表的关键要点、启示、注意事项

示例格式：

    ### 系统架构

    本系统采用分层架构设计，主要分为客户端层、网关层、服务层和数据层。各层职责明确，通过标准化接口通信...（这里是对架构图的描述，说明设计背景和各层定位）

    <!-- diagram-start
    type: architecture
    title: 系统整体架构
    description: |
      系统分为客户端、网关、服务、数据四层，各层职责单一、通过标准接口通信。
    containers:
      - id: client
        label: 客户端
        nodes: [web, app]
      - id: gateway
        label: 网关层
        nodes: [gw]
      - id: service
        label: 服务层
        nodes: [user_svc, order_svc]
      - id: data
        label: 数据层
        nodes: [mysql, redis]
    nodes:
      - id: web
        label: Web 浏览器
        container: client
      - id: app
        label: 移动端 App
        container: client
      - id: gw
        label: API 网关
        container: gateway
        high_weight: true
        owner: 平台组
        timing: P99 < 50ms
      - id: user_svc
        label: 用户服务
        container: service
      - id: order_svc
        label: 订单服务
        container: service
      - id: mysql
        label: MySQL 主从
        container: data
      - id: redis
        label: Redis 集群
        container: data
    edges:
      - from: web
        to: gw
        label: HTTPS
      - from: app
        to: gw
        label: HTTPS
      - from: gw
        to: user_svc
        label: gRPC
      - from: gw
        to: order_svc
        label: gRPC
      - from: user_svc
        to: mysql
        style: dashed
      - from: order_svc
        to: redis
        style: dashed
    diagram-end -->

    从架构图可以看出，API 网关承担了路由、鉴权、限流等职责，有效隔离了客户端与后端服务的直接耦合。这种设计使得服务可以独立部署和扩展...（这里是对架构图的总结，提炼关键要点和设计优势）

### 4. 内容质量
- 每个论断有解释或论据支撑
- 使用具体数据、版本号（如素材包中有）
- 用表格对比关键维度
- 用代码/配置示例说明操作
- 专业术语首次出现时给出解释
- **不要写"正确的废话"**——每句话都要有信息量
- **不要重复论述**——一个观点说清楚即可
- **不要堆砌术语**——必要时解释

### 5. 数据一致性
- 所有数字、指标必须与素材包中的"关键数据"一致
- 使用素材包中列出的技术术语
- 不要编造素材包中没有的数据
- 如果素材包信息不足，在对应位置标注"[需要补充: xxx]"，**但仍然要保证篇幅要求**

---

## 输出格式

使用 write 工具将完成的章节内容写入新文件：**${outputFile}**

文件格式：
\`\`\`markdown
# 章节标题

## 概述
简要介绍本章节内容...

## 主要内容
### 子主题1
充分展开的内容（多段落、多示例）...

### 子主题2
充分展开的内容（多段落、多示例）...

## 小结
总结本章节要点...
\`\`\`

---

## 写作规范
- Markdown 格式，层次分明
- 章节可独立阅读
- 不重复其他章节内容
- 不加过渡语（“本章小结”“下一章”等）
- **只输出本章内容** — 不要在文件末尾附加大纲、目录或其他非本章内容

---

## 重要提示

- **使用 write 工具**：将完整内容写入新文件，不要用 edit 工具
- **写完就结束**：不要检查字数、不要检查格式、不要反复编辑
- **你的职责是生成内容**：验证由 reviewer 负责
- **一次写完**：不要分多次编辑，一次性完成整个章节
- **质量优先**：每句话都要有信息量，避免重复、废话、空洞论述
`;
  }

  /**
   * 生成 Reviewer subagent 的 prompt
   * 
   * 输入版本化文件: drafts/chapters/${chapterId}-v${round}.md
   */
  generateReviewerPrompt(
    task: Task,
    chapterContent: string,
    baseline: ReviewBaseline,
    round: number = 1,
    knowledgeContent: string = '',
    projectDir?: string,
    wordBudget?: { min: number; max: number }
  ): string {
    const metricsList = Object.entries(baseline.metrics)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const termsList = baseline.technicalTerms.join(', ');
    const requirementsList = baseline.requirements.map(r => `- ${r}`).join('\n');

    // 字数预算检查部分（Bug M 修复）
    const wordBudgetSection = wordBudget ? `

### 7. 字数预算检查（重要）

本章的字数预算为 **${wordBudget.min}-${wordBudget.max} 字**。

**容差规则**（±30%）：
- 实际字数在 ${Math.round(wordBudget.min * 0.7)}-${Math.round(wordBudget.max * 1.3)} 字范围内 → 通过
- 实际字数 > ${Math.round(wordBudget.max * 1.3)} 字 → revise（要求精简）
- 实际字数 < ${Math.round(wordBudget.min * 0.7)} 字 → revise（要求补充）

请统计本章实际字数，并根据容差规则判断是否通过。
` : '';

    return `# 审阅任务

## 你的身份

你是一位**资深技术审阅专家**，拥有 10 年以上技术文档审阅经验。你的审阅风格：

- **严谨细致**：逐段检查，不放过任何细节
- **标准明确**：按标准评分，不凭主观感觉
- **建设性反馈**：指出问题的同时给出改进建议
- **关注质量**：不仅看字数，更看内容密度和信息量
- **追求完美**：宁可严格要求，也不降低标准

---

你需要审阅章节 **${task.chapterId}**（第 ${round} 轮）的内容。

## 章节内容

${chapterContent}

## 数据基线

以下是跨章节共享的数据，必须确保章节内容与基线一致：

### 关键指标
${metricsList || '无'}

### 技术术语
${termsList || '无'}

### 需求要点
${requirementsList || '无'}

## 反馈限制

- **最多 5 个问题**：只关注最重要的问题，不要列举所有小问题
- **优先级**：
  1. 字数是否达标（≥ ${this.config.writing.minChapterChars} 字符）
  2. 图表是否规范（diagram-start 格式、前后说明）
  3. 数据是否与基线一致
  4. 内容深度是否足够
- **不要关注**：JSON 格式细节、引号转义、重复检查（这些由代码处理）

## 审阅标准

### 1. 数据一致性（必须通过）
- 检查所有数字、指标是否与基线一致
- 检查技术术语使用是否正确

### 2. 需求覆盖（必须通过）
- 检查是否覆盖了所有需求要点

### 3. 内容深度（重点检查）

**篇幅检查**（Reviewer 核心职责）：
- **本节（整个章节）正文合计是否 ≥ ${this.config.writing.minChapterChars} 字** —— 按整节合计衡量，**不按**内部小节（## 或 ###）分别计算
- 如果整节合计不足，必须标记为 revise，并给出**实际字数与差额**，明确指出**需要扩充多少字**
- 示例："本节当前约 5000 字，距下限还差约 3000 字，可补充采集流程、技术选型、性能优化等内容"
  （注意：**按整节合计判断**，不要把「某个小节没写够」当作不达标的理由）

**内容密度检查**（重要）：
- 是否存在重复段落或重复论述
- 是否存在"正确的废话"（没有信息量的句子）
- 是否存在空洞论述（看似很长但没有实质内容）
- 如果发现注水内容，即使字数达标也要标记为 revise

### 4. 图表规范（强制）
- 图表前是否有独立段落说明（至少 2-3 句话，不能只有标题没有正文）
- 图表后是否有独立段落总结（至少 2-3 句话）
- 如果图表前后缺少文字说明，必须标记为 revise
- **图表必须是 diagram-start 结构化格式**（containers / nodes / edges 三段）。
  发现 mermaid 代码块时必须标记为 revise，并要求改写为结构化格式。
- **绝对不要要求作者把图表转换成 mermaid / PlantUML 等图形语法**，
  也不要要求「拆成多张图」—— 引擎会把内容压缩到一张可读的图里，
  图表质量由渲染后的几何校验负责，不靠增加图的数量。

### 5. 结构清晰度
- 检查章节结构是否合理
- 检查层次是否分明

### 6. 文字质量
- 检查语法、拼写、表达是否清晰
- 检查是否有口语化表达
- 检查术语使用是否一致

## 评分标准

| 维度 | 5分 | 7分 | 9分 |
|------|-----|-----|-----|
| accuracy（准确性） | 有明显错误 | 基本准确，有小问题 | 完全准确 |
| consistency（一致性） | 与基线不一致 | 基本一致 | 完全一致 |
| clarity（清晰度） | 难以理解 | 基本清晰 | 非常清晰，逻辑严密 |
| depth（深度） | 只有概念定义 | 有原理+示例 | 有多维度分析+实践案例+对比表格 |
| quality（质量） | 有大量废话 | 内容扎实 | 每句话都有信息量 |

## 输出格式（极其重要）

将审阅报告写入文件：**${projectDir ? join(projectDir, 'review', `${task.chapterId}-r${round}.json`) : `review/${task.chapterId}-r${round}.json`}**

**必须严格遵守以下 JSON 格式规则**：
1. 使用严格的 JSON 格式（不要添加注释）
2. 所有字符串使用双引号（不要使用单引号）
3. **字符串中的引号必须转义为 \"**（例如：\"示例\"）
4. **字符串中的换行必须转义为 \n**（不要直接换行）
5. 确保所有括号、逗号都正确配对
6. **不要使用中文引号 "" 或 ''**，必须使用转义的英文引号 \"

JSON 格式示例：
\`\`\`json
{
  "chapterId": "${task.chapterId}",
  "round": ${round},
  "verdict": "accept",
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [
    {
      "severity": "medium",
      "description": "第2段内容不足，需要扩充。注意：引号必须转义为 \"示例\"",
      "location": "section-2.1",
      "suggestion": "补充具体案例和对比分析"
    }
  ],
  "summary": "总体评价"
}
\`\`\`

## 决定标准

- **accept**: 无 high 问题，且 medium ≤ 3 条。low 级问题不影响 accept。
- **revise**: 有 high 问题，或 medium > 3 条。
- **reject**: 大量 high 问题（≥3），或内容严重注水/错误、结构混乱。

**严重度与裁决的关系**：
- high = 内容错误、数据与基线矛盾、关键需求遗漏 → 必须 revise 或 reject
- medium = 内容不够深入、结构可优化、图表说明不足 → 累计 > 3 条时 revise
- low = 措辞可改进、格式小问题 → 不影响裁决，可忽略
${knowledgeContent ? `
## 图表质量对抗性检查（必须执行）

${knowledgeContent}
` : ''}${wordBudgetSection}`;
  }

  /**
   * 生成 Fix subagent 的 prompt
   * 
   * 输入上一版本: drafts/chapters/${chapterId}-v${round}.md
   * 输出新版本: drafts/chapters/${chapterId}-v${round+1}.md
   */
  generateFixPrompt(
    task: Task,
    chapterContent: string,
    reviewContent: string,
    currentRound: number
  ): string {
    const nextRound = currentRound + 1;
    const outputFile = `drafts/chapters/${task.chapterId}-v${nextRound}.md`;
    
    return `# 修复任务

## 你的身份

你是一位**资深技术写作者**，擅长根据审阅反馈改进文档质量。你的修复风格：

- **精准修复**：针对性解决审阅报告中的每个问题
- **保持深度**：确保修复后内容仍然达到深度要求
- **保护优点**：不要破坏原有好的内容
- **追求完美**：宁可多花时间修复，也不敷衍了事

**写作品味**：
- 避免"正确的废话"——每句话都要有信息量
- 避免重复论述——一个观点说清楚即可
- 避免过度修饰——简洁优于华丽
- 避免堆砌术语——必要时解释，首次出现给定义

---

你需要根据审阅反馈修复章节 **${task.chapterId}** 的内容。

## 当前版本
- 输入文件: drafts/chapters/${task.chapterId}-v${currentRound}.md
- 输出文件: **${outputFile}**（新版本）

## 原始章节内容（v${currentRound}）

${chapterContent}

## 审阅反馈

${reviewContent}

## 修复要求

### 1. 解决所有问题
- 逐一解决审阅报告中列出的所有问题
- 每个问题都要有明确的修复措施

### 2. 保持深度（强制）
- 本节（整个章节）正文合计 ≥ ${MIN_CHAPTER_CHARS} 字
- 图表前后有独立段落说明
- 不允许降低深度要求

### 3. 如何加深内容
**根据审阅报告中指出的「本 ch 字数不足」，通过以下方式扩充**：
- **加示例**：补充具体案例、代码片段、配置示例
- **加对比**：用表格对比不同方案、技术、方法的优缺点
- **加原理**：深入解释底层原理、设计决策、工作机制
- **加实践**：补充最佳实践、常见问题、解决方案
- **加分析**：多维度分析，包括适用场景、局限性、权衡取舍

**示例**：如果审阅报告指出"### 数据采集方案 当前约 1500 字，建议扩充至 3000 字"，则：
1. 阅读当前内容，理解已有论述
2. 选择 2-3 个扩充方向（如：采集流程、技术选型、性能优化）
3. 每个方向补充 500-800 字的具体内容
4. 确保新增内容与原有内容逻辑连贯

### 4. 保护优点
- 不要大幅改变章节结构（除非审阅报告明确要求）
- 不要删除原有的好内容
- 在原有基础上改进，而不是重写

### 5. 数据准确
- 确保所有数据与基线一致
- 不要编造数据

### 6. 改进质量
- 根据审阅建议改进文字质量
- 消除重复、废话、空洞论述
- 确保每句话都有信息量

## 输出格式

使用 **write 工具**将修复后的完整章节内容写入新文件：**${outputFile}**

**重要**：
- 必须使用 write 工具创建新文件，不要使用 edit 工具
- 这是新版本文件，不要覆盖原文件（v${currentRound}）
- 写入完整的修复后内容，不是只写入修改的部分

## 重要提示

- **使用 write 工具**：将修复后的完整内容写入新文件，不要用 edit 工具
- **修复完就结束**：不要检查字数、不要检查格式、不要反复编辑
- **你的职责是修复问题**：验证由 reviewer 负责
- **一次性修复**：不要分多次编辑，一次性完成所有修复
- **质量优先**：每句话都要有信息量，避免重复、废话、空洞论述
`;
  }

  /**
   * 解析 Reviewer 的输出，提取决定
   */
  parseReviewDecision(reviewOutput: string): ReviewDecision {
    const decision: ReviewDecision = {
      decision: 'revise', // 默认
      confidence: 0.5,
      reasons: [],
    };

    // 尝试解析 JSON 格式
    try {
      const jsonMatch = reviewOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.verdict) {
          decision.decision = parsed.verdict.toLowerCase() as 'accept' | 'reject' | 'revise';
        }
        if (parsed.scores) {
          const scores = Object.values(parsed.scores).filter((s): s is number => typeof s === 'number');
          if (scores.length > 0) {
            decision.confidence = scores.reduce((a, b) => a + b, 0) / scores.length / 10;
          }
        }
        if (parsed.issues && Array.isArray(parsed.issues)) {
          decision.reasons = parsed.issues.map((i: any) => i.description || i).slice(0, 5);
        }
        return decision;
      }
    } catch {
      // JSON 解析失败，尝试文本格式
    }

    // 文本格式 fallback
    const decisionMatch = reviewOutput.match(/\*\*决定\*\*:\s*(accept|reject|revise)/i) ||
                          reviewOutput.match(/verdict["\s:]+(accept|reject|revise)/i);
    if (decisionMatch) {
      decision.decision = decisionMatch[1].toLowerCase() as 'accept' | 'reject' | 'revise';
    }

    // 提取评分
    const scoreMatches = reviewOutput.matchAll(/(\d+)\/10/g);
    const scores: number[] = [];
    for (const match of scoreMatches) {
      scores.push(parseInt(match[1]));
    }
    if (scores.length > 0) {
      decision.confidence = scores.reduce((a, b) => a + b, 0) / scores.length / 10;
    }

    // 提取问题列表
    const problemSection = reviewOutput.match(/## 问题列表\n([\s\S]*?)(?=\n## |$)/);
    if (problemSection) {
      const problems = problemSection[1].match(/\d+\.\s+(.+)/g);
      if (problems) {
        decision.reasons = problems.map(p => p.replace(/^\d+\.\s+/, ''));
      }
    }

    return decision;
  }
}
