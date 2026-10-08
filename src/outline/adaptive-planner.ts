/**
 * AdaptiveOutlinePlanner — 自适应大纲规划器
 *
 * 根据需求文档的标题层级树，智能生成章节列表：
 * 1. 逐级展开：字数 > budget.max × 0.8 → 展开子节点
 * 2. 自适应合并：总字数 > target × 1.2 → 同父叶子向上合并
 *
 * 用于 Wave 3 的大纲智能展开。
 */

import type { HeadingNode } from './heading-tree.js';
import type { OutlineChapter } from './types.js';

export interface PlanOptions {
  /** 目标总字数 */
  targetWords: number;
  /** 单章字数预算 */
  wordBudget: { min: number; max: number };
  /** 偏差容忍度（默认 0.2 = 20%） */
  tolerance: number;
}

interface PlannedChapter {
  title: string;
  number?: string;
  estimatedWords: number;
  description: string;
  sourceNodes: HeadingNode[];  // 合并时包含多个节点
}

export class AdaptiveOutlinePlanner {
  /**
   * 根据标题树和选项生成章节列表
   */
  plan(root: HeadingNode, options: PlanOptions): OutlineChapter[] {
    const { targetWords, wordBudget, tolerance } = options;
    const expandThreshold = wordBudget.max * 0.8;

    // Step 1: 逐级展开，收集候选章节
    const candidates: PlannedChapter[] = [];
    this.expandNode(root, candidates, expandThreshold, 1);

    // 跳过根节点本身（level 0）
    const initialChapters = candidates.filter(c => c.sourceNodes.length > 0);

    // Step 2: 如果总字数超出目标，执行合并
    let finalChapters = initialChapters;
    const totalEstimated = initialChapters.reduce((sum, c) => sum + c.estimatedWords, 0);
    const maxAllowed = targetWords * (1 + tolerance);

    if (totalEstimated > maxAllowed && initialChapters.length > 1) {
      finalChapters = this.mergeChapters(initialChapters, targetWords, wordBudget, tolerance);
    }

    // Step 3: 分配 chapter ID
    return finalChapters.map((ch, index) => {
      const id = `ch${String(index + 1).padStart(3, '0')}`;
      return {
        id,
        title: ch.title,
        type: 'functional',  // 默认类型，后续可根据需求分类调整
        wordBudget: {
          min: Math.max(wordBudget.min, Math.floor(ch.estimatedWords * 0.8)),
          max: Math.max(wordBudget.max, Math.floor(ch.estimatedWords * 1.2)),
        },
        importance: 3,  // 默认重要度
        description: ch.description,
      };
    });
  }

  /**
   * 递归展开节点
   * - 如果节点字数 <= threshold → 作为独立章节
   * - 如果节点字数 > threshold → 展开子节点
   * - 至少展开到 h3 级别（确保功能模块被充分拆分）
   */
  private expandNode(
    node: HeadingNode,
    candidates: PlannedChapter[],
    threshold: number,
    minLevel: number
  ): void {
    // 跳过根节点（level 0）
    if (node.level === 0) {
      for (const child of node.children) {
        this.expandNode(child, candidates, threshold, minLevel);
      }
      return;
    }

    // 跳过 h1（通常是文档标题，不是内容章节）
    if (node.level === 1) {
      for (const child of node.children) {
        this.expandNode(child, candidates, threshold, minLevel);
      }
      return;
    }

    // 至少展开到 h3 级别（level 3）
    // 这确保功能模块（如 2.1 战略管理）会被拆分为子模块（2.1.1, 2.1.2...）
    const shouldExpandByLevel = node.level < 3 && node.children.length > 0;

    // 叶子节点或字数在阈值内且已达到最小展开深度 → 作为独立章节
    if ((node.children.length === 0 || node.charCount <= threshold) && !shouldExpandByLevel) {
      candidates.push({
        title: node.title,
        number: node.number,
        estimatedWords: node.charCount,
        description: this.buildDescription(node),
        sourceNodes: [node],
      });
      return;
    }

    // 字数超出阈值或未达最小展开深度 → 展开子节点
    for (const child of node.children) {
      this.expandNode(child, candidates, threshold, minLevel);
    }
  }

  /**
   * 构建章节描述
   */
  private buildDescription(node: HeadingNode): string {
    const parts: string[] = [];

    // 添加节点自身的描述
    if (node.ownCharCount > 0) {
      parts.push(`本节涵盖「${node.title}」相关内容。`);
    }

    // 添加子节点概要
    if (node.children.length > 0) {
      const childTitles = node.children.map(c => c.title).join('、');
      parts.push(`包含以下内容：${childTitles}。`);
    }

    return parts.join('');
  }

  /**
   * 合并章节（贪心算法）
   *
   * 合并策略：
   * 1. 同一父节点下的叶子章节优先合并
   * 2. 合并后字数不超过 budget.max
   * 3. 重复直到总字数在目标范围内
   */
  private mergeChapters(
    chapters: PlannedChapter[],
    targetWords: number,
    wordBudget: { min: number; max: number },
    tolerance: number
  ): PlannedChapter[] {
    const maxAllowed = targetWords * (1 + tolerance);
    let result = [...chapters];

    // 计算当前总字数
    const totalWords = () => result.reduce((sum, c) => sum + c.estimatedWords, 0);

    // 循环合并直到总字数在范围内
    while (totalWords() > maxAllowed && result.length > 1) {
      // 找到最佳合并对（同一父节点、字数互补）
      const mergePair = this.findBestMergePair(result, wordBudget.max);

      if (!mergePair) {
        // 无法继续合并，退出
        break;
      }

      // 执行合并
      const [a, b] = mergePair;
      const merged: PlannedChapter = {
        title: this.generateMergedTitle(a, b),
        estimatedWords: a.estimatedWords + b.estimatedWords,
        description: `${a.description} ${b.description}`.trim(),
        sourceNodes: [...a.sourceNodes, ...b.sourceNodes],
      };

      // 替换原始两个章节
      const newResult = result.filter(c => c !== a && c !== b);
      newResult.push(merged);
      result = newResult;
    }

    return result;
  }

  /**
   * 查找最佳合并对
   *
   * 优先级：
   * 1. 同一父节点下的相邻章节
   * 2. 合并后字数不超过 maxWords
   * 3. 字数差异最小的优先（保持均衡）
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

        // 合并后不能超过上限
        if (mergedWords > maxWords) continue;

        // 检查是否同一父节点
        const sameParent = this.hasSameParent(a, b);

        // 计算分数（越小越好）
        // 同一父节点加分（减去大数），字数差异小加分
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
    // 如果来自同一父节点，使用父节点标题
    if (this.hasSameParent(a, b) && a.sourceNodes[0].parent) {
      return a.sourceNodes[0].parent.title;
    }

    // 否则组合两个标题
    return `${a.title}与${b.title}`;
  }
}
