import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 章节字数统计
 */
export interface ChapterWordStats {
  /** 章节ID */
  chapterId: string;
  /** 实际字数 */
  actualWords: number;
  /** 字数预算 */
  wordBudget?: {
    min: number;
    max: number;
  };
  /** 偏差（实际 - 预算最小值） */
  deviation?: number;
  /** 偏差率 */
  deviationRate?: number;
}

/**
 * 字数分析器
 * 用于统计章节字数并生成报告
 */
export class WordCountAnalyzer {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 分析单个章节的字数
   */
  analyzeChapter(chapterId: string, round: number = 1): ChapterWordStats | null {
    const draftPath = join(
      this.projectDir,
      'drafts',
      'chapters',
      `${chapterId}-v${round}.md`
    );

    if (!existsSync(draftPath)) {
      return null;
    }

    const content = readFileSync(draftPath, 'utf-8');
    const actualWords = content.length;

    return {
      chapterId,
      actualWords,
    };
  }

  /**
   * 分析所有章节的字数
   */
  analyzeAll(
    chapterIds: string[],
    round: number = 1
  ): ChapterWordStats[] {
    const stats: ChapterWordStats[] = [];

    for (const chapterId of chapterIds) {
      const stat = this.analyzeChapter(chapterId, round);
      if (stat) {
        stats.push(stat);
      }
    }

    return stats;
  }

  /**
   * 生成篇幅统计报告
   */
  generateReport(
    chapterConfigs: Array<{
      chapterId: string;
      wordBudget?: { min: number; max: number };
    }>
  ): string {
    const lines: string[] = [];

    lines.push('# 篇幅统计报告\n');

    // 1. 统计所有章节
    const stats = this.analyzeAll(chapterConfigs.map(c => c.chapterId));

    // 2. 计算总字数
    let totalWords = 0;
    let totalMin = 0;
    let totalMax = 0;

    for (const stat of stats) {
      totalWords += stat.actualWords;
      
      const config = chapterConfigs.find(c => c.chapterId === stat.chapterId);
      if (config?.wordBudget) {
        stat.wordBudget = config.wordBudget;
        stat.deviation = stat.actualWords - config.wordBudget.min;
        stat.deviationRate = stat.deviation / config.wordBudget.min;
        
        totalMin += config.wordBudget.min;
        totalMax += config.wordBudget.max;
      }
    }

    // 3. 总体统计
    lines.push('## 总体统计\n');
    lines.push(`- **总字数**: ${totalWords}字`);
    lines.push(`- **预算范围**: ${totalMin}-${totalMax}字`);
    
    if (totalMin > 0) {
      const deviation = totalWords - totalMin;
      const deviationRate = (deviation / totalMin) * 100;
      lines.push(`- **偏差**: ${deviation}字 (${deviationRate.toFixed(1)}%)`);
    }
    lines.push('');

    // 4. 章节详情
    lines.push('## 章节详情\n');
    lines.push('| 章节ID | 实际字数 | 预算范围 | 偏差 | 偏差率 |');
    lines.push('|--------|----------|----------|------|--------|');

    for (const stat of stats) {
      const budgetStr = stat.wordBudget 
        ? `${stat.wordBudget.min}-${stat.wordBudget.max}`
        : '-';
      const deviationStr = stat.deviation !== undefined 
        ? `${stat.deviation}`
        : '-';
      const deviationRateStr = stat.deviationRate !== undefined
        ? `${(stat.deviationRate * 100).toFixed(1)}%`
        : '-';

      lines.push(`| ${stat.chapterId} | ${stat.actualWords} | ${budgetStr} | ${deviationStr} | ${deviationRateStr} |`);
    }
    lines.push('');

    // 5. 建议
    lines.push('## 建议\n');
    
    const belowBudget = stats.filter(s => s.deviationRate !== undefined && s.deviationRate < -0.1);
    const aboveBudget = stats.filter(s => s.deviationRate !== undefined && s.deviationRate > 0.2);

    if (belowBudget.length > 0) {
      lines.push('### 字数不足的章节\n');
      for (const stat of belowBudget) {
        lines.push(`- **${stat.chapterId}**: 当前${stat.actualWords}字，建议增加${Math.abs(stat.deviation!)}字`);
      }
      lines.push('');
    }

    if (aboveBudget.length > 0) {
      lines.push('### 字数过多的章节\n');
      for (const stat of aboveBudget) {
        lines.push(`- **${stat.chapterId}**: 当前${stat.actualWords}字，可以精简${stat.deviation!}字`);
      }
      lines.push('');
    }

    if (belowBudget.length === 0 && aboveBudget.length === 0) {
      lines.push('✅ 所有章节字数均在合理范围内\n');
    }

    return lines.join('\n');
  }
}
