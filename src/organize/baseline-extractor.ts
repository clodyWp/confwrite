import { readFileSync } from 'node:fs';
import type { MaterialFile } from './scanner.js';
import type { LLMCaller } from '../outline/llm-planner.js';

/**
 * 数据基线
 */
export interface DataBaseline {
  /** 源文件数 */
  sourceFiles: number;
  /** 指标数据（如性能、可用性等） */
  metrics: Record<string, string>;
  /** 时间线数据 */
  timeline: Record<string, string>;
  /** 技术术语 */
  technicalTerms: string[];
  /** 需求列表 */
  requirements: string[];
  /** 生成时间 */
  generatedAt: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 基线提取器选项
 */
export interface BaselineExtractorOptions {
  /** 可选的 LLM 调用函数，用于提取中文技术术语 */
  llmCaller?: LLMCaller;
}

/**
 * 数据基线提取器
 */
export class BaselineExtractor {
  private llmCaller?: LLMCaller;

  constructor(options?: BaselineExtractorOptions) {
    this.llmCaller = options?.llmCaller;
  }

  /**
   * 从资料文件提取数据基线
   */
  async extract(files: MaterialFile[]): Promise<DataBaseline> {
    const baseline: DataBaseline = {
      sourceFiles: files.length,
      metrics: {},
      timeline: {},
      technicalTerms: [],
      requirements: [],
      generatedAt: new Date().toISOString(),
    };

    const allContent: string[] = [];

    for (const file of files) {
      // Read the full file content for analysis
      let content = file.summary; // fallback to summary
      
      if (file.format === 'markdown') {
        try {
          content = readFileSync(file.absolutePath, 'utf-8');
        } catch {
          // If we can't read the file, use the summary
        }
      }

      allContent.push(content);
      
      // 提取百分比指标
      this.extractPercentages(content, baseline.metrics);
      
      // 提取数字指标
      this.extractNumbers(content, baseline.metrics);
      
      // 提取时间线
      this.extractTimeline(content, baseline.timeline);
      
      // 提取技术术语
      this.extractTechnicalTerms(content, baseline.technicalTerms);
      
      // 提取需求
      this.extractRequirements(content, baseline.requirements);
    }

    // LLM 中文术语提取
    if (this.llmCaller) {
      const llmTerms = await this.extractChineseTermsWithLLM(allContent.join('\n'));
      baseline.technicalTerms.push(...llmTerms);
    }

    // 去重
    baseline.technicalTerms = Array.from(new Set(baseline.technicalTerms));
    baseline.requirements = Array.from(new Set(baseline.requirements));

    return baseline;
  }

  /**
   * 验证数据基线结构
   */
  validate(baseline: DataBaseline): ValidationResult {
    const errors: string[] = [];

    if (typeof baseline.sourceFiles !== 'number') {
      errors.push('Missing or invalid sourceFiles');
    }

    if (!baseline.metrics || typeof baseline.metrics !== 'object') {
      errors.push('Missing or invalid metrics');
    }

    if (!baseline.timeline || typeof baseline.timeline !== 'object') {
      errors.push('Missing or invalid timeline');
    }

    if (!Array.isArray(baseline.technicalTerms)) {
      errors.push('Missing or invalid technicalTerms');
    }

    if (!Array.isArray(baseline.requirements)) {
      errors.push('Missing or invalid requirements');
    }

    if (!baseline.generatedAt) {
      errors.push('Missing generatedAt');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 提取百分比
   */
  private extractPercentages(content: string, metrics: Record<string, string>): void {
    const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
    let match;

    while ((match = percentageRegex.exec(content)) !== null) {
      const value = match[0];
      // 尝试找到上下文作为键
      const context = this.extractContext(content, match.index, 30);
      const key = context || `百分比_${Object.keys(metrics).length}`;
      metrics[key] = value;
    }
  }

  /**
   * 提取数字指标
   */
  private extractNumbers(content: string, metrics: Record<string, string>): void {
    // 匹配数字 + 单位（如 100ms, 10TB, 1000 并发等）
    const numberRegex = /(\d+(?:\.\d+)?)\s*(ms|TB|GB|MB|KB|秒|分钟|小时|天|个|人|次)/g;
    let match;

    while ((match = numberRegex.exec(content)) !== null) {
      const value = match[0];
      const context = this.extractContext(content, match.index, 30);
      const key = context || `指标_${Object.keys(metrics).length}`;
      metrics[key] = value;
    }
  }

  /**
   * 提取时间线
   */
  private extractTimeline(content: string, timeline: Record<string, string>): void {
    // 匹配日期格式（如 2024年1月, 2024-01, 2024/01/01 等）
    const dateRegex = /(\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?)/g;
    let match;

    while ((match = dateRegex.exec(content)) !== null) {
      const date = match[0];
      const context = this.extractContext(content, match.index, 30);
      const key = context || `时间点_${Object.keys(timeline).length}`;
      timeline[key] = date;
    }
  }

  /**
   * 提取技术术语
   */
  private extractTechnicalTerms(content: string, terms: string[]): void {
    // 匹配英文技术术语（如 Kubernetes, API, RESTful 等）
    const techRegex = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
    let match;

    while ((match = techRegex.exec(content)) !== null) {
      const term = match[1];
      // 过滤常见英文单词
      if (!this.isCommonWord(term)) {
        terms.push(term);
      }
    }
  }

  /**
   * 提取需求
   * 支持强需求（必须/需要）、弱需求（应）、列表格式需求
   */
  private extractRequirements(content: string, requirements: string[]): void {
    // 强需求关键词
    const strongKeywords = /(?:必须|需要|满足|确保|保证|支持|达到|实现|提供)[^\n，。！？；]{2,30}/g;
    let match;

    while ((match = strongKeywords.exec(content)) !== null) {
      requirements.push(match[0].trim());
    }

    // 弱需求："应" (排除"应用"误匹配)
    const weakKeywordRegex = /(?:^|[，,；;\n])\s*\S{0,10}应(?!用)[^\n，。！？；]{2,30}/g;
    while ((match = weakKeywordRegex.exec(content)) !== null) {
      let req = match[0].trim();
      // 移除开头的标点
      req = req.replace(/^[，,；;]\s*/, '');
      if (req.length > 0) {
        requirements.push(req);
      }
    }
  }

  /**
   * 提取上下文（用于生成键名）
   * 策略：行首标签优先（冒号前的内容），其次取当前行前缀
   */
  private extractContext(content: string, index: number, _maxLength: number): string {
    // 找到当前行的行首
    const lineStart = content.lastIndexOf('\n', index);
    const linePrefix = content.slice(lineStart + 1, index);

    // 策略 1：如果行首到 match 之间有冒号，取冒号前的部分作为 key
    const colonMatch = linePrefix.match(/([^\uff1a:\n]+)[\uff1a:]/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      if (label.length > 0) {
        return label.slice(0, 15);
      }
    }

    // 策略 2：取当前行 match 前面的文字（最多 15 字符）
    const currentLinePrefix = linePrefix.trim();
    if (currentLinePrefix.length > 0) {
      return currentLinePrefix.slice(-15);
    }

    // 策略 3：fallback
    return `指标_${index}`;
  }

  /**
   * 使用 LLM 提取中文技术术语
   */
  private async extractChineseTermsWithLLM(allContent: string): Promise<string[]> {
    if (!this.llmCaller) {
      return [];
    }

    // 限制总长度到 10000 字符
    const content = allContent.slice(0, 10000);

    const prompt = `你是技术文档分析专家。请从以下文档中提取所有技术术语。

技术术语定义：
- 软件架构模式（如微服务、单体、SOA）
- 技术组件（如数据库、消息队列、缓存）
- 协议/标准（如 HTTP、REST、OAuth）
- 工具/框架（如 Kubernetes、Docker、Spring）
- 业务领域术语（如 S&OP、MRP、BOM）

输出格式：JSON 数组，每个元素是一个术语字符串。只输出数组，不要其他文字。

文档内容：
${content}`;

    try {
      const response = await this.llmCaller(prompt);

      // 健壮的 JSON 解析
      let parsed = response.trim();
      // 移除代码块标记
      parsed = parsed.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
      // 提取 JSON 数组
      const match = parsed.match(/\[[\s\S]*\]/);
      if (match) {
        const terms = JSON.parse(match[0]);
        return Array.isArray(terms) ? terms.filter((t: unknown) => typeof t === 'string') : [];
      }
      return [];
    } catch {
      // LLM 调用失败，返回空数组
      return [];
    }
  }

  /**
   * 判断是否是常见英文单词
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'The', 'This', 'That', 'These', 'Those',
      'What', 'Which', 'Who', 'Whom', 'Whose',
      'When', 'Where', 'Why', 'How',
      'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Being',
      'Have', 'Has', 'Had', 'Do', 'Does', 'Did',
      'Will', 'Would', 'Could', 'Should', 'May', 'Might', 'Must',
      'Can', 'Cannot', ' able',
      'And', 'But', 'Or', 'Nor', 'For', 'Yet', 'So',
      'With', 'Without', 'About', 'After', 'Before', 'During',
      'To', 'From', 'In', 'On', 'At', 'By', 'Of',
      'If', 'Then', 'Else', 'Than', 'As',
      'Not', 'No', 'Yes', 'All', 'Any', 'Each', 'Every',
      'Some', 'Many', 'Much', 'More', 'Most', 'Less', 'Least',
    ]);
    
    return commonWords.has(word);
  }
}
