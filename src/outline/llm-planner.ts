/**
 * LLMPlanner — LLM 驱动的大纲规划器
 *
 * 让 LLM 读需求文档，理解内容结构，规划章节。
 * 支持任意格式的需求文档（Markdown、Word 转换后的中文数字格式等）。
 *
 * 失败时回退到 AdaptiveOutlinePlanner（纯代码逻辑）。
 */

import type { OutlineChapter } from './types.js';

/**
 * LLM 调用函数类型
 * 接受 prompt 字符串，返回 LLM 的文本响应。
 */
export type LLMCaller = (prompt: string) => Promise<string>;

/**
 * LLM 规划器选项
 */
export interface LLMPlannerOptions {
  /** 需求文档内容 */
  requirementsContent: string;
  /** 目标字数 */
  targetWords: number;
  /** 单章字数预算 */
  wordBudget: { min: number; max: number };
  /** 模板名称 */
  templateName: string;
}

/**
 * LLM 返回的章节 JSON 结构
 */
export interface LLMChapterJSON {
  id: string;
  title: string;
  type: string;
  description: string;
  requirementSource?: string[];
}

/**
 * LLM 驱动的大纲规划器
 */
export class LLMPlanner {
  private caller: LLMCaller;

  constructor(caller: LLMCaller) {
    this.caller = caller;
  }

  /**
   * 调用 LLM 生成章节列表
   * @throws 如果 LLM 调用失败或返回无法解析的内容
   */
  async plan(options: LLMPlannerOptions): Promise<OutlineChapter[]> {
    const prompt = this.buildPrompt(options);
    const response = await this.caller(prompt);
    const chapters = this.parseResponse(response, options);
    return chapters;
  }

  /**
   * 构建发送给 LLM 的 prompt
   */
  buildPrompt(options: LLMPlannerOptions): string {
    // Truncate very long requirements to avoid prompt overflow
    const maxContentLen = 30000;
    const content = options.requirementsContent.length > maxContentLen
      ? options.requirementsContent.slice(0, maxContentLen) + '\n\n[... 内容已截断 ...]'
      : options.requirementsContent;

    return `你是一位资深技术文档规划专家。请根据以下需求文档，规划文档的章节结构。

## 需求文档
${content}

## 要求
- 目标总字数：${options.targetWords} 字
- 每章字数预算：${options.wordBudget.min}-${options.wordBudget.max} 字
- 章节数量：根据内容自动规划，确保覆盖所有需求
- 章节类型必须是以下之一：overview, requirements, functional, architecture, implementation, support, appendix

## 输出格式
仅返回 JSON 数组，不要包含任何其他文字。每个元素包含：
- id: 章节ID（如 "ch001"）
- title: 章节标题
- type: 章节类型
- description: 章节描述（100-200字）
- requirementSource: 需求来源章节编号列表（如 ["1", "1.1"]）

示例：
[
  {
    "id": "ch001",
    "title": "项目概述",
    "type": "overview",
    "description": "介绍项目背景、目标和范围...",
    "requirementSource": ["1", "1.1"]
  }
]`;
  }

  /**
   * 解析 LLM 返回的 JSON 响应
   * @throws 如果解析失败或结果为空
   */
  parseResponse(response: string, options: LLMPlannerOptions): OutlineChapter[] {
    // Extract JSON from response (LLM may wrap in markdown code block)
    const jsonStr = this.extractJSON(response);
    if (!jsonStr) {
      throw new Error('LLM response does not contain valid JSON');
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error('LLM response JSON is not an array');
    }

    if (parsed.length === 0) {
      throw new Error('LLM response JSON array is empty');
    }

    // Convert to OutlineChapter[]
    return parsed.map((item: LLMChapterJSON, index: number) => {
      // Validate required fields
      if (!item.title || !item.type) {
        throw new Error(`Chapter at index ${index} missing required fields (title, type)`);
      }

      const id = item.id || `ch${String(index + 1).padStart(3, '0')}`;

      return {
        id,
        title: item.title,
        type: item.type,
        wordBudget: {
          min: options.wordBudget.min,
          max: options.wordBudget.max,
        },
        importance: 3,
        description: item.description || '',
        requirementSource: item.requirementSource
          ? { sections: item.requirementSource, headings: [] }
          : undefined,
      };
    });
  }

  /**
   * 从 LLM 响应中提取 JSON 字符串
   * 支持直接 JSON 和 markdown 代码块包裹的 JSON
   */
  private extractJSON(response: string): string | null {
    const trimmed = response.trim();

    // Try direct JSON (array or object)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      return trimmed;
    }

    // Try extracting from markdown code block: ```json ... ```
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try finding JSON array in the response
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }

    return null;
  }
}
