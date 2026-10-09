/**
 * RequirementMapper — 需求映射生成器
 *
 * 根据大纲中的 requirementSource 信息，从需求文档中提取对应内容，
 * 生成 requirement-map.json 供素材包生成使用。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { OutlineChapter } from '../outline/types.js';

/**
 * 需求映射条目
 */
export interface RequirementMapEntry {
  /** 需求章节号列表 */
  sections: string[];
  /** 需求标题列表 */
  headings: string[];
  /** 提取的需求内容 */
  content: string;
}

/**
 * 需求映射（章节ID → 需求内容）
 */
export type RequirementMap = Record<string, RequirementMapEntry>;

/**
 * 需求映射生成器
 */
export class RequirementMapper {
  private projectDir: string;
  private requirementsPath: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    
    // 优先使用 requirements.md，其次使用 requirements.docx 转换后的内容
    const mdPath = join(projectDir, 'inputs', 'requirements.md');
    if (existsSync(mdPath)) {
      this.requirementsPath = mdPath;
    } else {
      // 如果没有 .md 文件，尝试查找其他格式
      this.requirementsPath = mdPath; // 默认路径
    }
  }

  /**
   * 生成需求映射
   */
  generate(chapters: OutlineChapter[]): RequirementMap {
    const map: RequirementMap = {};

    // 读取需求文档
    const requirementsContent = this.readRequirements();
    if (!requirementsContent) {
      // 如果无法读取需求文档，返回空映射
      for (const chapter of chapters) {
        map[chapter.id] = {
          sections: chapter.requirementSource?.sections || [],
          headings: chapter.requirementSource?.headings || [],
          content: '',
        };
      }
      return map;
    }

    // 为每个章节提取需求内容
    for (const chapter of chapters) {
      const sections = chapter.requirementSource?.sections || [];
      const headings = chapter.requirementSource?.headings || [];
      
      if (sections.length === 0) {
        map[chapter.id] = { sections: [], headings: [], content: '' };
        continue;
      }

      // 从需求文档中提取对应章节的内容
      const content = this.extractContent(requirementsContent, sections);
      
      map[chapter.id] = {
        sections,
        headings,
        content,
      };
    }

    return map;
  }

  /**
   * 生成并保存需求映射
   */
  generateAndSave(chapters: OutlineChapter[]): RequirementMap {
    const map = this.generate(chapters);
    
    // 确保 assets 目录存在
    const assetsDir = join(this.projectDir, 'assets');
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }
    
    // 保存到 assets/requirement-map.json
    const mapPath = join(assetsDir, 'requirement-map.json');
    writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf-8');
    
    return map;
  }

  /**
   * 读取需求文档
   */
  private readRequirements(): string | null {
    if (!existsSync(this.requirementsPath)) {
      return null;
    }
    
    try {
      return readFileSync(this.requirementsPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 从需求文档中提取指定章节的内容
   * 
   * @param content 需求文档内容
   * @param sections 要提取的章节号列表（如 ['2.1.1', '2.1.2']）
   */
  private extractContent(content: string, sections: string[]): string {
    const extractedParts: string[] = [];

    for (const section of sections) {
      const extracted = this.extractSection(content, section);
      if (extracted) {
        extractedParts.push(extracted);
      }
    }

    return extractedParts.join('\n\n---\n\n');
  }

  /**
   * 提取单个章节的内容
   * 
   * 支持多种 Markdown 标题格式：
   * - `## 2.1.1 标题`
   * - `### 2.1.1 标题`
   * - `#### 2.1.1 标题`
   */
  private extractSection(content: string, sectionNumber: string): string | null {
    // 构建正则表达式匹配章节标题和内容
    const escapedSection = sectionNumber.replace(/\./g, '\\.');
    
    // 简单策略：匹配章节标题，然后捕获直到下一个同级或更高级标题
    // 或者直到文件结尾
    const lines = content.split('\n');
    let startIndex = -1;
    let startLevel = 0;
    
    // 找到章节开始位置
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();
        // 检查标题是否以章节号开头
        if (title.startsWith(sectionNumber) || title.match(new RegExp(`^${escapedSection}\\s`))) {
          startIndex = i;
          startLevel = level;
          break;
        }
      }
    }
    
    if (startIndex === -1) {
      return null;
    }
    
    // 找到章节结束位置（下一个同级或更高级标题）
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        if (level <= startLevel) {
          endIndex = i;
          break;
        }
      }
    }
    
    // 提取内容
    const sectionContent = lines.slice(startIndex, endIndex).join('\n').trim();
    return sectionContent || null;
  }
}
