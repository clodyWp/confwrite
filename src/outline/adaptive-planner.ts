/**
 * AdaptiveOutlinePlanner — 自适应大纲规划器
 *
 * 核心策略（修正版）：
 * 1. 先展开到所有叶子节点
 * 2. 如果总字数 > 目标，向上合并叶子（同父优先）
 * 3. 根据最终章节数计算每章预算 = targetWords / chapterCount
 *
 * 这样保证：章节数 × 每章预算 ≈ targetWords
 */

import type { HeadingNode } from './heading-tree.js';
import type { OutlineChapter } from './types.js';

export interface PlanOptions {
  /** 目标总字数 */
  targetWords: number;
  /** 单章字数预算（初始值，会根据 targetWords 调整） */
  wordBudget: { min: number; max: number };
  /** 偏差容忍度（默认 0.2 = 20%） */
  tolerance: number;
}

interface PlannedChapter {
  title: string;
  number?: string;
  estimatedWords: number;
  description: string;
  sourceNodes: HeadingNode[];
}

export class AdaptiveOutlinePlanner {
  /**
   * 根据标题树和选项生成章节列表
   */
  plan(root: HeadingNode, options: PlanOptions): OutlineChapter[] {
    const { targetWords, wordBudget, tolerance } = options;

    // Step 1: 展开到所有叶子节点（跳过 h1）
    const leafNodes = this.collectLeafNodes(root);
    
    if (leafNodes.length === 0) {
      return [];
    }

    // Step 2: 将叶子节点转换为 PlannedChapter
    let chapters: PlannedChapter[] = leafNodes.map(node => ({
      title: node.title,
      number: node.number,
      estimatedWords: node.charCount,
      description: this.buildDescription(node),
      sourceNodes: [node],
    }));

    // Step 3: 计算目标章节数
    // 目标：每章 5000-8000 字，总字数达到 targetWords
    // 章节数 = targetWords / wordBudget.max（向下取整，确保每章字数充足）
    const targetChapterCount = Math.max(1, Math.floor(targetWords / wordBudget.max));

    // Step 4: 如果叶子数 > 目标章节数，合并到目标数量
    if (chapters.length > targetChapterCount) {
      chapters = this.mergeToTargetCount(chapters, targetChapterCount);
    }

    // Step 5: 根据最终章节数计算每章预算
    // 容差向上：保证最少达到 targetWords
    const chapterCount = chapters.length;
    const targetPerChapter = Math.floor(targetWords / chapterCount);
    
    // 每章预算：targetPerChapter - targetPerChapter * 1.3
    // 最少：targetPerChapter（保证总字数达到 targetWords）
    // 最多：targetPerChapter * 1.3（容差向上 30%）
    const adjustedMin = Math.max(wordBudget.min, targetPerChapter);
    const adjustedMax = Math.max(wordBudget.max, Math.floor(targetPerChapter * 1.3));

    // Step 6: 分配 chapter ID
    return chapters.map((ch, index) => {
      const id = `ch${String(index + 1).padStart(3, '0')}`;
      return {
        id,
        title: ch.title,
        type: 'functional',
        wordBudget: {
          min: adjustedMin,
          max: adjustedMax,
        },
        importance: 3,
        description: ch.description,
      };
    });
  }

  /**
   * 收集所有叶子节点（跳过 h1）
   */
  private collectLeafNodes(node: HeadingNode): HeadingNode[] {
    const leaves: HeadingNode[] = [];
    
    const traverse = (n: HeadingNode) => {
      // 跳过 h1（文档标题）
      if (n.level === 1) {
        for (const child of n.children) {
          traverse(child);
        }
        return;
      }
      
      // 叶子节点
      if (n.children.length === 0 && n.level > 1) {
        leaves.push(n);
        return;
      }
      
      // 非叶子节点，继续遍历子节点
      for (const child of n.children) {
        traverse(child);
      }
    };
    
    for (const child of node.children) {
      traverse(child);
    }
    
    return leaves;
  }

  /**
   * 构建章节描述
   */
  private buildDescription(node: HeadingNode): string {
    const parts: string[] = [];

    if (node.ownCharCount > 0) {
      parts.push(`本节涵盖「${node.title}」相关内容。`);
    }

    if (node.children.length > 0) {
      const childTitles = node.children.map(c => c.title).join('、');
      parts.push(`包含以下内容：${childTitles}。`);
    }

    return parts.join('');
  }

  /**
   * 合并章节到目标数量
   * 优先合并同一父节点下的相邻章节
   */
  private mergeToTargetCount(chapters: PlannedChapter[], targetCount: number): PlannedChapter[] {
    let result = [...chapters];

    while (result.length > targetCount && result.length > 1) {
      // 找到最佳合并对（同一父节点优先）
      const mergePair = this.findBestMergePairForCount(result);

      if (!mergePair) {
        // 无法继续合并，退出
        break;
      }

      const [a, b] = mergePair;
      const merged: PlannedChapter = {
        title: this.generateMergedTitle(a, b),
        estimatedWords: a.estimatedWords + b.estimatedWords,
        description: `${a.description} ${b.description}`.trim(),
        sourceNodes: [...a.sourceNodes, ...b.sourceNodes],
      };

      result = result.filter(c => c !== a && c !== b);
      result.push(merged);
    }

    return result;
  }

  /**
   * 查找最佳合并对（用于合并到目标数量）
   * 优先合并同一父节点下的相邻章节
   */
  private findBestMergePairForCount(chapters: PlannedChapter[]): [PlannedChapter, PlannedChapter] | null {
    let bestPair: [PlannedChapter, PlannedChapter] | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < chapters.length - 1; i++) {
      for (let j = i + 1; j < chapters.length; j++) {
        const a = chapters[i];
        const b = chapters[j];

        const sameParent = this.hasSameParent(a, b);
        
        // 计算分数：同一父节点优先，字数相近优先
        let score = 0;
        if (!sameParent) {
          score += 10000; // 不同父节点惩罚
        }
        
        // 字数差异越小越好
        const wordDiff = Math.abs(a.estimatedWords - b.estimatedWords);
        score += wordDiff;
        
        // 位置越近越好
        score += (j - i) * 100;

        if (score < bestScore) {
          bestScore = score;
          bestPair = [a, b];
        }
      }
    }

    return bestPair;
  }

  /**
   * 合并章节（贪心算法）
   *
   * 策略：
   * 1. 同一父节点下的叶子优先合并
   * 2. 合并后字数不超过 targetPerChapter * 2
   * 3. 重复直到总字数 <= targetWords * (1 + tolerance)
   */
  private mergeChapters(
    chapters: PlannedChapter[],
    targetWords: number,
    tolerance: number
  ): PlannedChapter[] {
    const maxAllowed = targetWords * (1 + tolerance);
    let result = [...chapters];

    const totalWords = () => result.reduce((sum, c) => sum + c.estimatedWords, 0);

    // 计算每章目标字数（合并后）
    const targetPerChapter = Math.floor(targetWords / Math.max(1, result.length * 0.6));
    const maxMergeSize = targetPerChapter * 2;

    // 循环合并直到总字数在范围内
    while (totalWords() > maxAllowed && result.length > 1) {
      const mergePair = this.findBestMergePair(result, maxMergeSize);

      if (!mergePair) {
        break;
      }

      const [a, b] = mergePair;
      const merged: PlannedChapter = {
        title: this.generateMergedTitle(a, b),
        estimatedWords: a.estimatedWords + b.estimatedWords,
        description: `${a.description} ${b.description}`.trim(),
        sourceNodes: [...a.sourceNodes, ...b.sourceNodes],
      };

      result = result.filter(c => c !== a && c !== b);
      result.push(merged);
    }

    return result;
  }

  /**
   * 查找最佳合并对
   */
  private findBestMergePair(
    chapters: PlannedChapter[],
    maxWords: number
  ): [PlannedChapter, PlannedChapter] | null {
    let bestPair: [PlannedChapter, PlannedChapter] | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < chapters.length - 1; i++) {
      for (let j = i + 1; j < chapters.length; j++) {
        const a = chapters[i];
        const b = chapters[j];
        const mergedWords = a.estimatedWords + b.estimatedWords;

        if (mergedWords > maxWords) continue;

        const sameParent = this.hasSameParent(a, b);
        const wordDiff = Math.abs(a.estimatedWords - b.estimatedWords);
        const score = wordDiff - (sameParent ? 10000 : 0);

        if (score < bestScore) {
          bestScore = score;
          bestPair = [a, b];
        }
      }
    }

    return bestPair;
  }

  /**
   * 检查两个章节是否来自同一父节点
   */
  private hasSameParent(a: PlannedChapter, b: PlannedChapter): boolean {
    if (a.sourceNodes.length === 0 || b.sourceNodes.length === 0) return false;
    const parentA = a.sourceNodes[0].parent;
    const parentB = b.sourceNodes[0].parent;
    return parentA !== undefined && parentA === parentB;
  }

  /**
   * 生成合并后的标题
   */
  private generateMergedTitle(a: PlannedChapter, b: PlannedChapter): string {
    if (this.hasSameParent(a, b) && a.sourceNodes[0].parent) {
      return a.sourceNodes[0].parent.title;
    }
    return `${a.title}与${b.title}`;
  }
}
