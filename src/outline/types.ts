/**
 * 需求定义
 */
export interface Requirement {
  /** 需求唯一标识 */
  id: string;
  /** 需求标题 */
  title: string;
  /** 需求优先级 */
  priority: 'high' | 'medium' | 'low';
  /** 需求来源（文档名+页码或章节） */
  source: string;
  /** 需求分类（可选） */
  category?: string;
  /** 需求详细描述（可选） */
  description?: string;
  /** 分配的章节ID（大纲生成后填充） */
  assignedChapter?: string;
}

/**
 * 需求统计信息
 */
export interface RequirementStatistics {
  /** 总需求数 */
  total: number;
  /** 按优先级统计 */
  byPriority: {
    high: number;
    medium: number;
    low: number;
  };
  /** 按分类统计（可选） */
  byCategory?: Record<string, number>;
  /** 完整性检查 */
  completeness: {
    /** 是否完整 */
    isComplete: boolean;
    /** 警告信息 */
    warnings: string[];
  };
}

/**
 * 大纲章节定义
 */
export interface OutlineChapter {
  /** 章节ID */
  id: string;
  /** 章节标题 */
  title: string;
  /** 章节类型 */
  type: string;
  /** 字数预算 */
  wordBudget?: {
    min: number;
    max: number;
  };
  /** 重要度（1-5） */
  importance?: number;
  /** 章节描述 */
  description?: string;
  /** 写作风格 */
  style?: string;
  /** 子章节 */
  children?: OutlineChapter[];
}

/**
 * 大纲定义
 */
export interface Outline {
  /** 文档标题 */
  title: string;
  /** 目标字数 */
  targetWords?: number;
  /** 章节列表 */
  chapters: OutlineChapter[];
  /** 生成时间 */
  createdAt: string;
  /** 版本号 */
  version: string;
}
