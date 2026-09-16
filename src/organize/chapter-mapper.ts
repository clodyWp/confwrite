import type { OutlineNode } from './outline-parser.js';
import type { IndexData } from './indexer.js';
import type { MaterialFile } from './scanner.js';

/**
 * 章节映射
 */
export interface ChapterMapping {
  /** 章节 ID */
  chapterId: string;
  /** 章节标题 */
  title: string;
  /** 相关文件 */
  relatedFiles: MaterialFile[];
  /** 相关分类 */
  relatedCategories: string[];
  /** 相关关键词 */
  relatedKeywords: string[];
}

/**
 * 章节-索引映射器
 */
export class ChapterMapper {
  /**
   * 为大纲中的每个章节映射相关资料
   */
  map(outline: OutlineNode, index: IndexData): ChapterMapping[] {
    const chapters = outline.getAllChapters();
    const mappings: ChapterMapping[] = [];

    for (const chapter of chapters) {
      if (!chapter.id) continue;

      const relatedFiles = this.findRelatedFiles(chapter, index);
      const relatedCategories = Array.from(new Set(relatedFiles.map(f => f.category)));
      const relatedKeywords = Array.from(new Set(relatedFiles.flatMap(f => f.keywords)));

      mappings.push({
        chapterId: chapter.id,
        title: chapter.title,
        relatedFiles,
        relatedCategories,
        relatedKeywords,
      });
    }

    return mappings;
  }

  /**
   * 获取特定章节的映射
   */
  getMapping(mappings: ChapterMapping[], chapterId: string): ChapterMapping | undefined {
    return mappings.find(m => m.chapterId === chapterId);
  }

  /**
   * 生成人类可读的摘要
   */
  generateSummary(mappings: ChapterMapping[]): string {
    if (mappings.length === 0) {
      return '章节映射摘要（共 0 章）：\n没有章节映射';
    }

    const lines: string[] = [];
    lines.push(`章节映射摘要（共 ${mappings.length} 章）：\n`);

    for (const mapping of mappings) {
      const fileCount = mapping.relatedFiles.length;
      const files = mapping.relatedFiles.map(f => f.filename).join(', ');
      lines.push(`- ${mapping.chapterId} (${mapping.title}): ${fileCount} 个相关文件`);
      if (files) {
        lines.push(`  文件: ${files}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 查找与章节相关的文件
   */
  private findRelatedFiles(chapter: OutlineNode, index: IndexData): MaterialFile[] {
    const relatedFiles: MaterialFile[] = [];
    const seenFiles = new Set<string>();

    // 策略 1: 基于关键词匹配
    // 假设章节标题可能包含关键词
    const chapterKeywords = this.extractKeywordsFromTitle(chapter.title);
    
    for (const file of index.files) {
      if (seenFiles.has(file.filename)) continue;

      // 检查文件的关键词是否与章节相关
      const hasKeywordMatch = file.keywords.some(k => 
        chapterKeywords.some(ck => k.includes(ck) || ck.includes(k))
      );

      if (hasKeywordMatch) {
        relatedFiles.push(file);
        seenFiles.add(file.filename);
      }
    }

    // 策略 2: 基于分类匹配
    // 如果章节标题包含分类名称，则分配该分类的所有文件
    for (const category of index.categories) {
      if (chapter.title.includes(category)) {
        const categoryFiles = index.byCategory[category] || [];
        for (const file of categoryFiles) {
          if (!seenFiles.has(file.filename)) {
            relatedFiles.push(file);
            seenFiles.add(file.filename);
          }
        }
      }
    }

    // 策略 3: 如果没有找到相关文件，分配所有文件（作为后备）
    if (relatedFiles.length === 0 && index.files.length > 0) {
      // 至少分配前 3 个文件作为参考
      const fallbackCount = Math.min(3, index.files.length);
      for (let i = 0; i < fallbackCount; i++) {
        relatedFiles.push(index.files[i]);
      }
    }

    return relatedFiles;
  }

  /**
   * 从章节标题提取关键词
   */
  private extractKeywordsFromTitle(title: string): string[] {
    // 简单的关键词提取：按空格和标点分割
    const words = title.split(/[\s，。！？；：、]+/).filter(w => w.length > 1);
    return words;
  }
}
