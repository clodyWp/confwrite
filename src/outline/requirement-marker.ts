import type { Requirement } from './types.js';

/**
 * 需求标记信息
 */
export interface RequirementMarkerInfo {
  /** 需求ID */
  requirementId: string;
  /** 标记所在行号 */
  lineNumber: number;
  /** 标记所在列号 */
  columnNumber: number;
}

/**
 * 需求覆盖检查结果
 */
export interface CoverageCheckResult {
  /** 总需求数 */
  totalRequirements: number;
  /** 已覆盖需求数 */
  coveredRequirements: number;
  /** 未覆盖需求列表 */
  uncoveredRequirements: string[];
  /** 是否完整覆盖 */
  isComplete: boolean;
}

/**
 * 需求追溯标记工具
 * 用于在写作时标记需求实现位置
 */
export class RequirementMarker {
  /**
   * 生成需求标记提示（用于Writer prompt）
   * @param requirements 需求列表
   * @param chapterId 章节ID
   */
  static generateMarkerPrompt(requirements: Requirement[], chapterId: string): string {
    // 筛选分配到当前章节的需求
    const chapterRequirements = requirements.filter(
      r => r.assignedChapter === chapterId
    );

    if (chapterRequirements.length === 0) {
      return '';
    }

    const lines: string[] = [];
    lines.push('## 需求标记\n');
    lines.push('本章需要覆盖以下需求：\n');
    
    for (const req of chapterRequirements) {
      lines.push(`- **${req.id}**: ${req.title}（优先级：${req.priority}）`);
    }
    
    lines.push('');
    lines.push('**重要**：在实现每个需求时，请在对应段落前添加标记。标记格式如下：\n');
    lines.push('```');
    lines.push('<!-- requirement: REQ-001 -->');
    lines.push('本节实现用户登录功能...');
    lines.push('```\n');
    lines.push('这样便于后续追溯和验证。\n');

    return lines.join('\n');
  }

  /**
   * 解析内容中的需求标记
   * @param content 文档内容
   */
  static parseMarkers(content: string): RequirementMarkerInfo[] {
    const markers: RequirementMarkerInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const markerMatch = line.match(/<!--\s*requirement:\s*(REQ-\d+)\s*-->/);
      
      if (markerMatch) {
        markers.push({
          requirementId: markerMatch[1],
          lineNumber: i + 1,
          columnNumber: line.indexOf(markerMatch[0]) + 1,
        });
      }
    }

    return markers;
  }

  /**
   * 检查需求覆盖情况
   * @param requirements 需求列表
   * @param content 文档内容
   * @param chapterId 章节ID
   */
  static checkCoverage(
    requirements: Requirement[],
    content: string,
    chapterId: string
  ): CoverageCheckResult {
    // 筛选分配到当前章节的需求
    const chapterRequirements = requirements.filter(
      r => r.assignedChapter === chapterId
    );

    // 解析内容中的标记
    const markers = this.parseMarkers(content);
    const coveredIds = new Set(markers.map(m => m.requirementId));

    // 检查覆盖情况
    const uncoveredRequirements: string[] = [];
    
    for (const req of chapterRequirements) {
      if (!coveredIds.has(req.id)) {
        uncoveredRequirements.push(req.id);
      }
    }

    return {
      totalRequirements: chapterRequirements.length,
      coveredRequirements: chapterRequirements.length - uncoveredRequirements.length,
      uncoveredRequirements,
      isComplete: uncoveredRequirements.length === 0,
    };
  }
}
