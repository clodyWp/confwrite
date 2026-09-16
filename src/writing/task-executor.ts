import type { Task } from '../scheduler/types.js';

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
 * 负责生成 subagent 的 prompt 并解析输出
 */
export class TaskExecutor {
  /**
   * 生成 Writer subagent 的 prompt
   */
  generateWriterPrompt(task: Task, kitContent: string): string {
    return `# 写作任务

你需要撰写章节 **${task.chapterId}** 的内容。

## 素材包

${kitContent}

## 写作要求

1. **严格遵循素材包**：使用素材包中提供的文件、数据和术语
2. **数据一致性**：所有数字、指标必须与素材包中的"关键数据"一致
3. **术语准确**：使用素材包中列出的技术术语
4. **覆盖需求**：确保覆盖素材包中提到的所有需求要点
5. **结构清晰**：使用合适的标题层级（##、###、####）
6. **引用来源**：在引用具体数据或概念时，注明来自哪个文件

## 输出格式

将完成的章节内容写入文件：**drafts/chapters/${task.chapterId}.md**

文件格式：
\`\`\`markdown
# ${task.chapterId} 章节标题

## 概述
简要介绍本章节内容...

## 主要内容
...

## 小结
总结本章节要点...
\`\`\`

## 注意事项

- 不要编造素材包中没有的数据
- 如果素材包信息不足，在文末标注"[需要补充: xxx]"
- 保持与整体文档风格一致
- 字数要求：根据章节复杂度，通常 2000-5000 字
`;
  }

  /**
   * 生成 Reviewer subagent 的 prompt
   */
  generateReviewerPrompt(
    task: Task,
    chapterContent: string,
    baseline: ReviewBaseline
  ): string {
    const metricsList = Object.entries(baseline.metrics)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const termsList = baseline.technicalTerms.join(', ');
    const requirementsList = baseline.requirements.map(r => `- ${r}`).join('\n');

    return `# 审阅任务

你需要审阅章节 **${task.chapterId}** 的内容。

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

## 审阅标准

1. **数据一致性**：检查所有数字、指标是否与基线一致
2. **术语准确性**：检查技术术语使用是否正确
3. **需求覆盖**：检查是否覆盖了所有需求要点
4. **内容准确性**：检查技术内容是否准确
5. **结构清晰度**：检查章节结构是否合理
6. **文字质量**：检查语法、拼写、表达是否清晰

## 输出格式

将审阅报告写入文件：**review/${task.chapterId}-review.md**

文件格式：
\`\`\`markdown
# ${task.chapterId} 审阅报告

## 结论
**决定**: accept | reject | revise

## 评分
- 内容准确性: X/10
- 数据一致性: X/10
- 结构清晰度: X/10
- 文字质量: X/10

## 问题列表
1. [严重程度: 高/中/低] 问题描述
   - 位置: 具体段落或句子
   - 建议: 修改建议

## 优点
- 列出章节的优点

## 总结
总体评价和改进建议
\`\`\`

## 决定标准

- **accept**: 质量达标，可以直接使用
- **revise**: 有小问题，需要修改后重新审阅
- **reject**: 质量问题严重，需要重写
`;
  }

  /**
   * 生成 Fix subagent 的 prompt
   */
  generateFixPrompt(
    task: Task,
    chapterContent: string,
    reviewContent: string
  ): string {
    return `# 修复任务

你需要根据审阅反馈修复章节 **${task.chapterId}** 的内容。

## 原始章节内容

${chapterContent}

## 审阅反馈

${reviewContent}

## 修复要求

1. **解决所有问题**：逐一解决审阅报告中列出的所有问题
2. **保持结构**：除非审阅报告明确要求，不要大幅改变章节结构
3. **数据准确**：确保所有数据与基线一致
4. **改进质量**：根据审阅建议改进文字质量

## 输出格式

将修复后的章节内容写入文件：**drafts/chapters/${task.chapterId}.md**

注意：完全覆盖原文件，不要保留原始内容。
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

    // 提取决定
    const decisionMatch = reviewOutput.match(/\*\*决定\*\*:\s*(accept|reject|revise)/i);
    if (decisionMatch) {
      decision.decision = decisionMatch[1].toLowerCase() as 'accept' | 'reject' | 'revise';
    }

    // 提取评分（用于计算置信度）
    const scoreMatches = reviewOutput.matchAll(/(\d+)\/10/g);
    const scores: number[] = [];
    for (const match of scoreMatches) {
      scores.push(parseInt(match[1]));
    }

    if (scores.length > 0) {
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      decision.confidence = avgScore / 10;
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
