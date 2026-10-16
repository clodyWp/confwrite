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
  // VC-1: Verdict 一致性自动修正
  verdictCorrected?: boolean;
  correctedVerdict?: 'accept' | 'revise' | 'reject';
  correctionReason?: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export const MIN_CHAPTER_CHARS = 8000; // 章节最小字符数（默认值）

/** 超标级别 */
export type OverWordCountLevel = 'mild' | 'moderate' | 'severe' | 'critical';

/** 字数状态 */
export type WordCountStatus = 
  | 'within'
  | 'mild_over' | 'moderate_over' | 'severe_over' | 'critical_over'
  | 'mild_under' | 'moderate_under' | 'severe_under';

/** 结构完整性检查结果 */
export interface StructuralIntegrityResult {
  valid: boolean;
  errors: string[];
}

export class OutputValidator {
  private projectDir: string;
  private config: ConfWriteConfig;

  constructor(projectDir: string, config?: ConfWriteConfig) {
    this.projectDir = projectDir;
    this.config = config ?? DEFAULT_CONFIG;
  }

  /**
   * SM-WC-2: 分类超标级别
   * @param actual 实际字数
   * @param max 字数上限
   * @returns 超标级别
   */
  static classifyOverage(actual: number, max: number): OverWordCountLevel {
    if (actual <= max) return 'mild'; // 未超标
    const ratio = (actual - max) / max;
    if (ratio <= 0.15) return 'mild';
    if (ratio <= 0.30) return 'moderate';
    if (ratio <= 0.50) return 'severe';
    return 'critical';
  }

  /**
   * SM-WC-7: 分类字数状态（含不足）
   * @param actual 实际字数
   * @param min 字数下限
   * @param max 字数上限
   * @returns 字数状态
   */
  static classifyWordCount(actual: number, min: number, max: number): WordCountStatus {
    // 检查超标
    if (actual > max) {
      const overRatio = (actual - max) / max;
      if (overRatio <= 0.15) return 'mild_over';
      if (overRatio <= 0.30) return 'moderate_over';
      if (overRatio <= 0.50) return 'severe_over';
      return 'critical_over';
    }
    // 检查不足
    if (actual < min) {
      const underRatio = (min - actual) / min;
      if (underRatio <= 0.10) return 'mild_under';
      if (underRatio <= 0.25) return 'moderate_under';
      return 'severe_under';
    }
    // 在范围内
    return 'within';
  }

  /**
   * SM-WC-6: 检查内容结构完整性
   * @param content Markdown 内容
   * @returns 完整性检查结果
   */
  static checkStructuralIntegrity(content: string): StructuralIntegrityResult {
    const errors: string[] = [];

    // 1. 检查截断标记
    if (/<!--.*截断.*-->|<!--.*truncat.*-->/i.test(content)) {
      errors.push('检测到截断标记');
    }

    // 2. 检查空 section（标题下无内容或内容 < 50 字）
    const sections = content.split(/^(?=##\s)/m);
    for (const section of sections) {
      if (!section.trim()) continue;
      const match = section.match(/^##\s+(.+)$/m);
      if (match) {
        const title = match[1].trim();
        const bodyContent = section.replace(/^##\s+.+$/m, '').trim();
        if (bodyContent.length < 50) {
          errors.push(`空 section: ${title}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * SM-WC-5: 检查字数是否收敛
   * @param history 字数历史
   * @param min 字数下限
   * @param max 字数上限
   * @returns 是否收敛
   */
  static isConverging(history: number[], min: number, max: number): boolean {
    if (history.length < 2) return true;
    const midpoint = (min + max) / 2;
    const prev = Math.abs(history[history.length - 2] - midpoint);
    const curr = Math.abs(history[history.length - 1] - midpoint);
    return curr < prev; // 当前轮更接近目标
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
        this.validateReviewerOutput(result, task.chapterId!, round, wordBudget);
        break;
      case 'fixer':
        this.validateFixerOutput(result, task.chapterId!, round, wordBudget);
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
      
      // Bug 42 修复：使用 wordBudget.min 而非 softGate（如果提供了 wordBudget）
      const effectiveMin = wordBudget?.min ?? softGate;
      
      // 判断是否通过：达到软门控即可
      const charOk = charCount >= effectiveMin;
      
      result.checks.push({ 
        name: '字数下限', 
        passed: charOk, 
        detail: `${charCount} 字 (min ${effectiveMin})` 
      });
      
      if (!charOk) {
        result.errors.push(`草稿字数不足: ${charCount} 字 < ${effectiveMin} 字`);
      }

      // 3. 字数上限检查（如果提供了 wordBudget）— SM-WC-1: 不截断，只记录
      if (wordBudget && wordBudget.max > 0) {
        const overageLevel = OutputValidator.classifyOverage(charCount, wordBudget.max);
        const upperOk = overageLevel === 'mild' || charCount <= wordBudget.max;
        result.checks.push({ 
          name: '字数上限', 
          passed: upperOk, 
          detail: `${charCount} 字 (上限 ${wordBudget.max}, 级别 ${overageLevel})` 
        });
        if (!upperOk) {
          // SM-WC-2: 渐进式响应，不截断
          result.errors.push(`草稿字数超标: ${charCount} 字 > 上限 ${wordBudget.max} 字 (级别: ${overageLevel})`);
        }
      }

      // 4. 结构完整性检查 — SM-WC-6
      const integrity = OutputValidator.checkStructuralIntegrity(content);
      result.checks.push({
        name: '结构完整性',
        passed: integrity.valid,
        detail: integrity.errors.length > 0 ? integrity.errors.join('; ') : '完整'
      });
      if (!integrity.valid) {
        result.errors.push(`内容结构不完整: ${integrity.errors.join(', ')}`);
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
   * Bug 42 修复：增加独立字数验证和 verdict 一致性检查
   */
  private validateReviewerOutput(result: ValidationResult, chapterId: string, round: number, wordBudget?: { min: number; max: number }): void {
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

    // 5. Bug 42 修复：独立字数验证（不依赖 LLM reviewer 的判断）
    if (wordBudget) {
      const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
      if (existsSync(draftPath)) {
        try {
          const content = readFileSync(draftPath, 'utf-8');
          const charCount = content.length;
          
          // 检查字数上限
          if (charCount > wordBudget.max) {
            result.checks.push({
              name: '字数上限（独立验证）',
              passed: false,
              detail: `${charCount} 字 > 上限 ${wordBudget.max} 字`
            });
            result.errors.push(`章节字数超标: ${charCount} 字 > 上限 ${wordBudget.max} 字`);
          } else {
            result.checks.push({
              name: '字数上限（独立验证）',
              passed: true,
              detail: `${charCount} 字 <= ${wordBudget.max} 字`
            });
          }
          
          // 检查字数下限
          if (charCount < wordBudget.min) {
            result.checks.push({
              name: '字数下限（独立验证）',
              passed: false,
              detail: `${charCount} 字 < 下限 ${wordBudget.min} 字`
            });
            result.errors.push(`章节字数不足: ${charCount} 字 < 下限 ${wordBudget.min} 字`);
          } else {
            result.checks.push({
              name: '字数下限（独立验证）',
              passed: true,
              detail: `${charCount} 字 >= ${wordBudget.min} 字`
            });
          }
        } catch (err) {
          // 读取失败不影响其他检查
          result.checks.push({ name: '独立字数验证', passed: false, detail: `无法读取草稿: ${err}` });
        }
      }
    }

    // 6. Bug 42 修复 + E2E v26 增强：verdict 一致性检查
    // 如果 issues 中提到字数问题但 verdict 是 accept，标记为验证失败
    // 或者如果独立字数验证发现超标但 verdict 是 accept，也标记为验证失败
    if (parsed.verdict === 'accept') {
      // 检查 issues 中是否有字数相关问题
      let hasWordCountIssueInReport = false;
      if (Array.isArray(parsed.issues)) {
        const wordCountIssues = parsed.issues.filter((i: any) => 
          /字数|超标|超出|上限|过多|over.*limit|exceed|too (long|much)/i.test(i.description || i.issue || '')
        );
        hasWordCountIssueInReport = wordCountIssues.length > 0;
      }
      
      // 检查独立字数验证是否发现超标
      let hasWordCountOverLimit = false;
      if (wordBudget) {
        const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
        if (existsSync(draftPath)) {
          try {
            const content = readFileSync(draftPath, 'utf-8');
            const charCount = content.length;
            hasWordCountOverLimit = charCount > wordBudget.max || charCount < wordBudget.min;
          } catch {
            // 读取失败不影响检查
          }
        }
      }
      
      // 如果任一检查发现问题，标记为验证失败
      if (hasWordCountIssueInReport || hasWordCountOverLimit) {
        const reasons = [];
        if (hasWordCountIssueInReport) reasons.push('审阅报告中发现字数问题');
        if (hasWordCountOverLimit) reasons.push('独立验证发现字数超标');
        
        result.checks.push({
          name: 'verdict 一致性',
          passed: false,
          detail: `verdict 为 accept，但${reasons.join('，')}`
        });
        result.errors.push(`verdict 矛盾: verdict 为 accept，但${reasons.join('，')}`);
        
        // VC-1: 自动修正 verdict 为 revise
        result.verdictCorrected = true;
        result.correctedVerdict = 'revise';
        result.correctionReason = reasons.join('; ');
      }
    }
  }

  /**
   * Fixer 输出验证
   * 检查: drafts/chapters/${chapterId}-v${round+1}.md
   */
  private validateFixerOutput(result: ValidationResult, chapterId: string, round: number, wordBudget?: { min: number; max: number }): void {
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
