/**
 * ConfigurableMockExecutor - 可配置的 Mock 执行器
 * 
 * 用于创建可复现的 bug 测试用例
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SubagentExecutor, ExecutorResult } from './executor.js';
import type { Task } from './types.js';

export interface MockConfig {
  writer?: {
    wordCount?: number; // 生成的字数
    behavior?: 'normal' | 'exceeds_limit' | 'below_minimum';
  };
  reviewer?: {
    verdict?: 'accept' | 'revise';
    wordCountReported?: number; // 报告的字数（可能与实际不符）
    issues?: string[];
    contradictory?: boolean; // 是否产生矛盾（verdict=accept 但有字数问题）
  };
  fixer?: {
    wordCount?: number;
    behavior?: 'normal' | 'exceeds_limit' | 'over_compensate';
  };
}

export class ConfigurableMockExecutor implements SubagentExecutor {
  private projectDir: string;
  private config: MockConfig;

  constructor(projectDir: string, config: MockConfig = {}) {
    this.projectDir = projectDir;
    this.config = config;
  }

  async execute(task: Task): Promise<ExecutorResult> {
    const start = Date.now();
    const round = this.extractRound(task.id);

    switch (task.type) {
      case 'writer':
        this.writeDraft(task, round);
        break;
      case 'reviewer':
        this.writeReview(task, round);
        break;
      case 'fixer':
        this.writeFix(task, round);
        break;
    }

    return {
      success: true,
      output: task.result || `mock: ${task.type} completed`,
      durationMs: Date.now() - start,
    };
  }

  private extractRound(taskId: string): number {
    const match = taskId.match(/-r(\d+)$/);
    return match ? parseInt(match[1]) : 1;
  }

  private writeDraft(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    // 根据配置生成不同长度的内容
    const targetWordCount = this.config.writer?.wordCount || 6000;
    const behavior = this.config.writer?.behavior || 'normal';

    let content: string;
    if (behavior === 'exceeds_limit') {
      // 生成超标内容（例如 12000 字，上限 8000）
      content = this.generateContent(targetWordCount);
    } else if (behavior === 'below_minimum') {
      // 生成不足内容（例如 3000 字，下限 5000）
      content = this.generateContent(targetWordCount);
    } else {
      // 正常内容
      content = this.generateContent(targetWordCount);
    }

    writeFileSync(draftPath, content, 'utf-8');
    task.result = content;
  }

  private writeReview(task: Task, round: number): void {
    const chapterId = task.chapterId || 'unknown';
    const reviewDir = join(this.projectDir, 'review');
    mkdirSync(reviewDir, { recursive: true });

    const verdict = this.config.reviewer?.verdict || 'accept';
    const contradictory = this.config.reviewer?.contradictory || false;
    const issues = this.config.reviewer?.issues || [];

    // 如果配置了矛盾，生成 verdict=accept 但有字数问题的审阅报告
    if (contradictory) {
      issues.push('字数超标 50%，需要压缩');
    }

    const review = {
      chapterId,
      round,
      verdict,
      scores: {
        accuracy: 8,
        consistency: 9,
        clarity: 8,
        depth: 7,
        quality: 8,
      },
      issues,
      summary: contradictory ? '内容质量达标，但字数超标' : '内容质量达标',
    };

    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf-8');

    task.result = JSON.stringify({
      decision: verdict,
      confidence: 0.85,
      reasons: contradictory ? ['内容质量达标', '字数超标'] : ['内容质量达标'],
    });
  }

  private writeFix(task: Task, currentRound: number): void {
    const chapterId = task.chapterId || 'unknown';
    const nextRound = currentRound + 1;
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}-v${nextRound}.md`);
    mkdirSync(dirname(draftPath), { recursive: true });

    const targetWordCount = this.config.fixer?.wordCount || 8000;
    const behavior = this.config.fixer?.behavior || 'normal';

    let content: string;
    if (behavior === 'over_compensate') {
      // Fixer 过度补偿，生成严重超标内容
      content = this.generateContent(targetWordCount * 1.8); // 超标 80%
    } else {
      content = this.generateContent(targetWordCount);
    }

    writeFileSync(draftPath, content, 'utf-8');
    task.result = content;
  }

  private generateContent(wordCount: number): string {
    // 生成指定字数的内容
    const para = '本段落描述了系统的架构设计，包括核心组件、交互模式和数据流向。系统采用现代化的微服务架构，支持高并发、高可用的业务需求。';
    const paraLength = para.length;
    const repeatCount = Math.ceil(wordCount / paraLength);
    
    let content = '# 系统架构设计\n\n';
    for (let i = 0; i < repeatCount; i++) {
      content += para;
    }
    
    // 截断到目标字数
    return content.substring(0, wordCount);
  }
}
