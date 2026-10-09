import { OutlineTemplateLoader } from './template-loader.js';
import { ChapterTypeLoader } from '../knowledge/chapter-type-loader.js';
import { HeadingTreeBuilder } from './heading-tree.js';
import { AdaptiveOutlinePlanner } from './adaptive-planner.js';
import { LLMPlanner } from './llm-planner.js';
import type { LLMCaller } from './llm-planner.js';
import { FormatConverter } from '../organize/converter.js';
import type { Requirement, Outline, OutlineChapter } from './types.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  /** 可选的 LLM 调用函数，由外部注入（如 pi SDK） */
  private llmCaller?: LLMCaller;

  constructor(projectDir: string, options?: { llmCaller?: LLMCaller }) {
    this.projectDir = projectDir;
    this.templateLoader = new OutlineTemplateLoader(projectDir);
    this.chapterTypeLoader = new ChapterTypeLoader(projectDir);
    this.llmCaller = options?.llmCaller;
  }

  /**
   * 生成大纲
   *
   * 优先级：LLMPlanner > AdaptiveOutlinePlanner > 模板方式
   *
   * 1. 如果注入了 LLMCaller 且需求文档存在，优先使用 LLMPlanner
   * 2. LLMPlanner 失败或不可用时，回退到 AdaptiveOutlinePlanner（需要 Markdown # 标题）
   * 3. 最终回退到模板方式
   */
  async generate(templateName: string, requirements: Requirement[], targetWords?: number): Promise<Outline> {
    // 1. 加载模板
    const template = this.templateLoader.loadTemplate(templateName);
    
    // 使用传入的 targetWords，如果没有则使用模板的 targetWords
    const effectiveTargetWords = targetWords || template.targetWords;

    // 2. 读取需求文档内容
    const requirementsContent = await this.readRequirementsContent();

    // 3. 优先使用 LLM 规划器
    if (requirementsContent && this.llmCaller) {
      try {
        const llmPlanner = new LLMPlanner(this.llmCaller);
        const chapters = await llmPlanner.plan({
          requirementsContent,
          targetWords: effectiveTargetWords,
          wordBudget: { min: 5000, max: 8000 },
          templateName,
        });

        if (chapters.length > 0) {
          this.assignRequirementsToChapters(requirements, chapters);

          return {
            title: template.name,
            targetWords: effectiveTargetWords,
            chapters,
            createdAt: new Date().toISOString(),
            version: '1.0.0',
          };
        }
      } catch {
        // LLMPlanner 失败，回退到 AdaptiveOutlinePlanner
      }
    }

    // 4. 回退：AdaptiveOutlinePlanner（需要 Markdown # 标题格式）
    if (requirementsContent) {
      try {
        const builder = new HeadingTreeBuilder();
        const headingTree = builder.build(requirementsContent);

        if (headingTree.children.length > 0) {
          const planner = new AdaptiveOutlinePlanner();
          const chapters = planner.plan(headingTree, {
            targetWords: effectiveTargetWords,
            wordBudget: { min: 5000, max: 8000 },
            tolerance: 0.2,
          });

          if (chapters.length > 0) {
            this.assignRequirementsToChapters(requirements, chapters);

            return {
              title: template.name,
              targetWords: effectiveTargetWords,
              chapters,
              createdAt: new Date().toISOString(),
              version: '1.0.0',
            };
          }
        }
      } catch {
        // 回退到模板方式
      }
    }

    // 5. 最终回退：模板方式（原有逻辑）
    const chapters: OutlineChapter[] = [];
    let chapterCounter = 1;

    for (const chapterConfig of template.chapters) {
      const typeConfig = this.chapterTypeLoader.loadChapterType(chapterConfig.type);
      const chapterId = `ch${String(chapterCounter).padStart(3, '0')}`;
      const description = this.generateChapterDescription(
        chapterConfig.type,
        typeConfig.name,
        requirements
      );

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

    this.assignRequirementsToChapters(requirements, chapters);

    return {
      title: template.name,
      targetWords: effectiveTargetWords,
      chapters,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };
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

  /**
   * 读取需求文档内容
   * 
   * 优先读取 inputs/requirements.md，如果不存在则尝试转换 Word 文档。
   * 返回文档内容字符串，如果无法获取则返回 null。
   */
  private async readRequirementsContent(): Promise<string | null> {
    let requirementsDocPath = join(this.projectDir, 'inputs', 'requirements.md');
    
    if (!existsSync(requirementsDocPath)) {
      const converted = await this.convertWordDocuments();
      if (converted) {
        requirementsDocPath = converted;
      } else {
        return null;
      }
    }
    
    try {
      return readFileSync(requirementsDocPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 转换 inputs/ 目录中的 Word 文档为 Markdown
   * 
   * 如果 inputs/ 目录中存在 .docx 文件，将其转换为 requirements.md
   * 返回转换后的文件路径，如果没有需要转换的文件则返回 null
   */
  private async convertWordDocuments(): Promise<string | null> {
    const inputsDir = join(this.projectDir, 'inputs');
    if (!existsSync(inputsDir)) {
      return null;
    }

    // 查找 Word 文档
    const files = readdirSync(inputsDir);
    const docxFiles = files.filter(f => f.toLowerCase().endsWith('.docx'));
    
    if (docxFiles.length === 0) {
      return null;
    }

    // 使用第一个 Word 文档
    const docxPath = join(inputsDir, docxFiles[0]);
    const converter = new FormatConverter();
    
    try {
      const result = await converter.convert(docxPath, inputsDir);
      if (result.success && result.outputPath) {
        // 将转换后的文件重命名为 requirements.md
        const requirementsPath = join(inputsDir, 'requirements.md');
        if (result.outputPath !== requirementsPath) {
          const { renameSync } = await import('node:fs');
          renameSync(result.outputPath, requirementsPath);
        }
        return requirementsPath;
      }
    } catch {
      // 转换失败，返回 null
    }

    return null;
  }
}
