import { readFileSync } from 'node:fs';
import type { MaterialFile } from './scanner.js';

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
 * 数据基线提取器
 */
export class BaselineExtractor {
  /**
   * 从资料文件提取数据基线
   */
  extract(files: MaterialFile[]): DataBaseline {
    const baseline: DataBaseline = {
      sourceFiles: files.length,
      metrics: {},
      timeline: {},
      technicalTerms: [],
      requirements: [],
      generatedAt: new Date().toISOString(),
    };

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
   */
  private extractRequirements(content: string, requirements: string[]): void {
    // 匹配需求关键词（如 必须、需要、支持、达到等）
    const requirementRegex = /(必须|需要|支持|达到|满足|确保|保证)[^，。！？]{5,30}/g;
    let match;

    while ((match = requirementRegex.exec(content)) !== null) {
      requirements.push(match[0].trim());
    }
  }

  /**
   * 提取上下文（用于生成键名）
   */
  private extractContext(content: string, index: number, maxLength: number): string {
    const start = Math.max(0, index - maxLength);
    const end = Math.min(content.length, index + maxLength);
    let context = content.slice(start, end).trim();
    
    // 清理上下文
    context = context.replace(/\s+/g, ' ');
    context = context.replace(/[，。！？；：]/g, '');
    
    // 限制长度
    if (context.length > 20) {
      context = context.slice(0, 20);
    }
    
    return context;
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
