import { OutlineTemplateLoader } from './template-loader.js';
import { ChapterTypeLoader } from '../knowledge/chapter-type-loader.js';
import type { Requirement, Outline, OutlineChapter } from './types.js';

/**
 * 字数评估结果
 */
export interface WordCountEvaluation {
  /** 总最小字数 */
  totalMin: number;
  /** 总最大字数 */
  totalMax: number;
  /** 目标字数 */
  targetWords: number;
  /** 偏差（实际 - 目标） */
  deviation: number;
  /** 偏差率 */
  deviationRate: number;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 大纲生成器
 * 使用模板+规则混合生成大纲
 */
export class OutlineGenerator {
  private projectDir: string;
  private templateLoader: OutlineTemplateLoader;
  private chapterTypeLoader: ChapterTypeLoader;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.templateLoader = new OutlineTemplateLoader(projectDir);
    this.chapterTypeLoader = new ChapterTypeLoader(projectDir);
  }

  /**
   * 生成大纲
   * @param templateName 模板名称
   * @param requirements 需求列表
   */
  async generate(templateName: string, requirements: Requirement[]): Promise<Outline> {
    // 1. 加载模板
    const template = this.templateLoader.loadTemplate(templateName);

    // 2. 生成章节列表
    const chapters: OutlineChapter[] = [];
    let chapterCounter = 1;

    for (const chapterConfig of template.chapters) {
      // 加载章节类型配置
      const typeConfig = this.chapterTypeLoader.loadChapterType(chapterConfig.type);

      // 生成章节ID
      const chapterId = `ch${String(chapterCounter).padStart(3, '0')}`;

      // 生成章节描述
      const description = this.generateChapterDescription(
        chapterConfig.type,
        typeConfig.name,
        requirements
      );

      // 创建章节
      const chapter: OutlineChapter = {
        id: chapterId,
        title: typeConfig.name,
        type: chapterConfig.type,
        wordBudget: typeConfig.wordBudget,
        importance: typeConfig.importance,
        description,
        style: typeConfig.writingStyle,
      };

      chapters.push(chapter);
      chapterCounter++;
    }

    // 3. 分配需求到章节
    this.assignRequirementsToChapters(requirements, chapters);

    // 4. 创建大纲
    const outline: Outline = {
      title: template.name,
      targetWords: template.targetWords,
      chapters,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };

    return outline;
  }

  /**
   * 评估字数预算
   * @param outline 大纲
   * @param tolerance 偏差阈值（默认20%）
   */
  evaluateWordCount(outline: Outline, tolerance: number = 0.2): WordCountEvaluation {
    // 计算总字数预算
    let totalMin = 0;
    let totalMax = 0;

    for (const chapter of outline.chapters) {
      if (chapter.wordBudget) {
        totalMin += chapter.wordBudget.min;
        totalMax += chapter.wordBudget.max;
      }
    }

    // 计算偏差
    const targetWords = outline.targetWords || 50000;
    const expectedWords = (totalMin + totalMax) / 2;
    const deviation = expectedWords - targetWords;
    const deviationRate = deviation / targetWords;

    // 生成警告
    const warnings: string[] = [];

    if (Math.abs(deviationRate) > tolerance) {
      if (deviation > 0) {
        warnings.push(
          `字数预算超出目标 ${(deviationRate * 100).toFixed(1)}%（预算：${expectedWords}字，目标：${targetWords}字）`
        );
        warnings.push('建议：减少章节数量或降低某些章节的字数预算');
      } else {
        warnings.push(
          `字数预算不足目标 ${Math.abs(deviationRate * 100).toFixed(1)}%（预算：${expectedWords}字，目标：${targetWords}字）`
        );
        warnings.push('建议：增加章节数量或提高某些章节的字数预算');
      }
    }

    return {
      totalMin,
      totalMax,
      targetWords,
      deviation,
      deviationRate,
      warnings,
    };
  }

  /**
   * 生成章节描述
   */
  private generateChapterDescription(
    chapterType: string,
    chapterName: string,
    requirements: Requirement[]
  ): string {
    // 根据章节类型生成描述
    const descriptions: Record<string, string> = {
      overview: `本章介绍项目背景、目标和范围，为后续章节提供上下文。`,
      requirements: `本章详细列出系统需求，包括功能需求和非功能需求。`,
      architecture: `本章描述系统架构设计，包括技术选型、系统组件和数据流。`,
      functional: `本章详细描述系统功能实现方案，包括核心功能模块和业务流程。`,
      implementation: `本章描述项目实施计划，包括里程碑、时间表和资源配置。`,
      support: `本章描述项目保障措施，包括组织保障、技术保障和运维保障。`,
      appendix: `本章包含补充信息，如术语表、参考文献和相关文档。`,
    };

    let description = descriptions[chapterType] || `本章介绍${chapterName}相关内容。`;

    // 如果是需求章或功能章，添加需求信息
    if (chapterType === 'requirements' || chapterType === 'functional') {
      const relevantRequirements = requirements.filter(r => 
        r.category === 'functional' || r.priority === 'high'
      );
      
      if (relevantRequirements.length > 0) {
        description += ` 包含${relevantRequirements.length}个关键需求。`;
      }
    }

    return description;
  }

  /**
   * 分配需求到章节
   */
  private assignRequirementsToChapters(
    requirements: Requirement[],
    chapters: OutlineChapter[]
  ): void {
    for (const requirement of requirements) {
      // 根据需求分类找到合适的章节
      const targetChapter = this.findTargetChapter(requirement, chapters);
      
      if (targetChapter) {
        requirement.assignedChapter = targetChapter.id;
      }
    }
  }

  /**
   * 查找目标章节
   */
  private findTargetChapter(
    requirement: Requirement,
    chapters: OutlineChapter[]
  ): OutlineChapter | null {
    // 根据需求分类映射到章节类型
    const categoryToChapterType: Record<string, string[]> = {
      functional: ['requirements', 'functional'],
      performance: ['architecture', 'requirements'],
      security: ['architecture', 'functional'],
      usability: ['functional', 'overview'],
      compatibility: ['architecture', 'implementation'],
      other: ['requirements', 'functional'],
    };

    const category = requirement.category || 'other';
    const targetTypes = categoryToChapterType[category] || ['requirements'];

    // 查找第一个匹配的章节
    for (const targetType of targetTypes) {
      const chapter = chapters.find(ch => ch.type === targetType);
      if (chapter) {
        return chapter;
      }
    }

    // 如果没有找到，返回第一个章节
    return chapters.length > 0 ? chapters[0] : null;
  }
}
