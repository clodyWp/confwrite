/**
 * OutputValidator — 即时验证 subagent 输出
 * 
 * 参考 bailian-agent/doc-chapters-v6 的“Writer 完成后即时验证”模式：
 * - Writer: 检查草稿文件存在、大小 > 1000 字节、可读性
 * - Reviewer: 检查 JSON 存在、可解析、verdict 合法
 * - Fixer: 检查新版本文件存在、大小 > 1000 字节
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../scheduler/types.js';
import type { ConfWriteConfig } from '../config/loader.js';
import { DEFAULT_CONFIG } from '../config/loader.js';

/**
 * 尝试修复常见的 JSON 格式错误
 */
function tryFixJSON(content: string): any {
  // 1. 直接解析（最快路径）
  try {
    return JSON.parse(content);
  } catch (e) {
    // 继续尝试修复
  }

  let fixed = content;

  // 2. 移除注释（// 和 /* */）
  fixed = fixed
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. 尝试解析
  try {
    return JSON.parse(fixed);
  } catch (e) {
    // 继续尝试修复
  }

  // 4. 修复中文引号（"" → 移除）
  fixed = fixed.replace(/\u201c|\u201d/g, '');

  // 5. 尝试解析
  try {
    return JSON.parse(fixed);
  } catch (e) {
    // 继续尝试修复
  }

  // 6. 最终失败
  throw new Error('JSON 格式错误，无法修复');
}

export interface ValidationResult {
  valid: boolean;
  taskType: string;
  chapterId: string;
  checks: ValidationCheck[];
  errors: string[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export const MIN_CHAPTER_CHARS = 8000; // 章节最小字符数（默认值）

export class OutputValidator {
  private projectDir: string;
  private config: ConfWriteConfig;

  constructor(projectDir: string, config?: ConfWriteConfig) {
    this.projectDir = projectDir;
    this.config = config ?? DEFAULT_CONFIG;
  }

  /**
   * 验证任务输出
   */
  validate(task: Task, round: number, wordBudget?: {min: number, max: number}): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      taskType: task.type,
      chapterId: task.chapterId || '',
      checks: [],
      errors: [],
    };

    switch (task.type) {
      case 'writer':
        this.validateWriterOutput(result, task.chapterId!, round, wordBudget);
        break;
      case 'reviewer':
        this.validateReviewerOutput(result, task.chapterId!, round);
        break;
      case 'fixer':
        this.validateFixerOutput(result, task.chapterId!, round);
        break;
    }

    result.valid = result.errors.length === 0;
    return result;
  }

  /**
   * Writer 输出验证
   * 检查: drafts/chapters/${chapterId}-v${round}.md
   */
  private validateWriterOutput(
    result: ValidationResult, 
    chapterId: string, 
    round: number,
    wordBudget?: {min: number, max: number}
  ): void {
    const filePath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    
    // 1. 文件存在性
    const exists = existsSync(filePath);
    result.checks.push({ name: '文件存在', passed: exists, detail: filePath });
    if (!exists) {
      result.errors.push(`草稿文件不存在: ${filePath}`);
      return; // 后续检查无意义
    }

    // 2. 字数统计（使用软门控逻辑）
    try {
      const content = readFileSync(filePath, 'utf-8');
      const charCount = content.length;
      const hardGate = this.config.writing.minChapterChars;
      const tolerance = this.config.writing.minChapterCharsTolerance || 0;
      const softGate = Math.floor(hardGate * (1 - tolerance));
      
      // 判断是否通过：达到软门控即可
      const charOk = charCount >= softGate;
      
      result.checks.push({ 
        name: '字数统计', 
        passed: charOk, 
        detail: `${charCount} 字 (软门控 ${softGate}, 硬门控 ${hardGate})` 
      });
      
      if (!charOk) {
        result.errors.push(`草稿字数不足: ${charCount} 字 < 软门控 ${softGate} 字（容差 ${tolerance * 100}%）`);
      }

      // 3. 字数上限检查（如果提供了 wordBudget）
      if (wordBudget && wordBudget.max > 0) {
        const upperOk = charCount <= wordBudget.max;
        result.checks.push({ 
          name: '字数上限', 
          passed: upperOk, 
          detail: `${charCount} 字 (上限 ${wordBudget.max})` 
        });
        if (!upperOk) {
          result.errors.push(`草稿字数超标: ${charCount} 字 > 上限 ${wordBudget.max} 字`);
        }
      }

      // 4. 可读性（防编码损坏）
      const hasCorruption = /[\uFFFD]/.test(content.substring(0, 500)) || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content.substring(0, 500));
      result.checks.push({ name: '文件可读', passed: !hasCorruption });
      if (hasCorruption) {
        result.errors.push('草稿文件编码损坏（包含替换字符或控制字符）');
      }
    } catch (err) {
      result.checks.push({ name: '文件可读', passed: false, detail: String(err) });
      result.errors.push(`无法读取草稿文件: ${err}`);
    }
  }

  /**
   * Reviewer 输出验证
   * 检查: review/${chapterId}-r${round}.json
   */
  private validateReviewerOutput(result: ValidationResult, chapterId: string, round: number): void {
    const filePath = join(this.projectDir, 'review', `${chapterId}-r${round}.json`);
    
    // 1. 文件存在
    const exists = existsSync(filePath);
    result.checks.push({ name: 'JSON 文件存在', passed: exists, detail: filePath });
    if (!exists) {
      result.errors.push(`审阅报告不存在: ${filePath}`);
      return;
    }

    // 2. 文件大小 > 0
    const stat = statSync(filePath);
    const sizeOk = stat.size > 0;
    result.checks.push({ name: 'JSON 非空', passed: sizeOk });
    if (!sizeOk) {
      result.errors.push(`审阅报告为空: ${filePath}`);
      return;
    }

    // 3. JSON 可解析（带自动修复）
    let parsed: any;
    const rawContent = readFileSync(filePath, 'utf-8');
    try {
      parsed = tryFixJSON(rawContent);
      result.checks.push({ name: 'JSON 格式合法', passed: true });
    } catch (err) {
      result.checks.push({ name: 'JSON 格式合法', passed: false, detail: String(err) });
      result.errors.push(`审阅报告 JSON 格式错误: ${err}`);
      return;
    }

    // 4. verdict 合法
    const validVerdicts = ['accept', 'revise', 'reject'];
    const verdictOk = parsed.verdict && validVerdicts.includes(parsed.verdict);
    result.checks.push({ name: 'verdict 合法', passed: verdictOk, detail: parsed.verdict || 'missing' });
    if (!verdictOk) {
      result.errors.push(`审阅报告 verdict 无效: ${parsed.verdict || 'missing'} (应为 accept/revise/reject)`);
    }
  }

  /**
   * Fixer 输出验证
   * 检查: drafts/chapters/${chapterId}-v${round+1}.md
   */
  private validateFixerOutput(result: ValidationResult, chapterId: string, round: number): void {
    const nextRound = round + 1;
    const filePath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
    
    // 1. 文件存在
    const exists = existsSync(filePath);
    result.checks.push({ name: '新版本文件存在', passed: exists, detail: filePath });
    if (!exists) {
      result.errors.push(`修复后的草稿文件不存在: ${filePath}`);
      return;
    }

    // 2. 字数统计（替代文件大小检查）
    try {
      const content = readFileSync(filePath, 'utf-8');
      const charCount = content.length;
      const minChars = this.config.writing.minChapterChars;
      const charOk = charCount >= minChars;
      result.checks.push({ 
        name: '字数统计', 
        passed: charOk, 
        detail: `${charCount} 字 (min ${minChars})` 
      });
      if (!charOk) {
        result.errors.push(`修复后字数不足: ${charCount} 字 < ${minChars} 字`);
      }

      // 3. 可读性
      const hasCorruption = /[\uFFFD]/.test(content.substring(0, 500));
      result.checks.push({ name: '文件可读', passed: !hasCorruption });
      if (hasCorruption) {
        result.errors.push('修复后文件编码损坏');
      }
    } catch (err) {
      result.checks.push({ name: '文件可读', passed: false, detail: String(err) });
      result.errors.push(`无法读取修复后文件: ${err}`);
    }
  }

  /**
   * 生成验证失败的消息
   */
  static formatErrors(result: ValidationResult): string {
    const lines = [`验证失败 (${result.taskType} ${result.chapterId}):`];
    for (const err of result.errors) {
      lines.push(`  ❌ ${err}`);
    }
    return lines.join('\n');
  }
}
