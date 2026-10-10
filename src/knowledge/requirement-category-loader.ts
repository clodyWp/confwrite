import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 需求分类配置
 */
export interface RequirementCategory {
  /** 分类名称 */
  name: string;
  /** 分类描述 */
  description: string;
  /** 对应的章节类型 */
  chapterTypes: string[];
  /** 分类内容（frontmatter之后的部分） */
  content?: string;
}

/**
 * 需求分类加载器
 * 从知识库加载需求分类定义
 */
export class RequirementCategoryLoader {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 加载单个需求分类
   * @param categoryName 分类名称（不含.md后缀）
   */
  loadCategory(categoryName: string): RequirementCategory {
    const categoryPath = join(
      this.projectDir,
      'knowledge',
      'requirement-categories',
      `${categoryName}.md`
    );

    if (!existsSync(categoryPath)) {
      throw new Error(`需求分类不存在: ${categoryName}`);
    }

    const content = readFileSync(categoryPath, 'utf-8');
    return this.parseCategoryFile(content, categoryName);
  }

  /**
   * 加载所有可用的需求分类
   */
  loadAllCategories(): Map<string, RequirementCategory> {
    const categories = new Map<string, RequirementCategory>();
    const categoriesDir = join(this.projectDir, 'knowledge', 'requirement-categories');

    if (!existsSync(categoriesDir)) {
      return categories;
    }

    const files = readdirSync(categoriesDir);
    for (const file of files) {
      const filePath = join(categoriesDir, file);
      const stat = statSync(filePath);

      if (stat.isFile() && file.endsWith('.md')) {
        const categoryName = file.replace('.md', '');
        try {
          const content = readFileSync(filePath, 'utf-8');
          const category = this.parseCategoryFile(content, categoryName);
          categories.set(categoryName, category);
        } catch (error) {
          console.warn(`Failed to parse requirement category: ${filePath}`, error);
        }
      }
    }

    return categories;
  }

  /**
   * 获取分类对应的章节类型
   */
  getChapterTypesForCategory(categoryName: string): string[] {
    try {
      const category = this.loadCategory(categoryName);
      return category.chapterTypes;
    } catch {
      return [];
    }
  }

  /**
   * 解析分类文件
   * 支持 YAML frontmatter 格式
   */
  private parseCategoryFile(content: string, categoryName: string): RequirementCategory {
    // 解析 YAML frontmatter（支持 CRLF 和 LF）
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

    if (!frontmatterMatch) {
      throw new Error(`Invalid requirement category format: ${categoryName}`);
    }

    const frontmatter = frontmatterMatch[1];
    const config = this.parseFrontmatter(frontmatter);

    // 提取 frontmatter 之后的内容（支持 CRLF 和 LF）
    const contentAfterFrontmatter = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

    return {
      name: config.name || categoryName,
      description: config.description || '',
      chapterTypes: config.chapterTypes || [],
      content: contentAfterFrontmatter || undefined,
    };
  }

  /**
   * 解析 YAML frontmatter（简化版）
   */
  private parseFrontmatter(frontmatter: string): any {
    const result: any = {};
    const lines = frontmatter.split('\n');

    let currentKey = '';
    let currentArray: string[] | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 检查是否是数组项（- xxx）
      if (trimmed.startsWith('- ')) {
        if (!currentArray) {
          currentArray = [];
          result[currentKey] = currentArray;
        }
        currentArray.push(trimmed.substring(2).trim());
        continue;
      }

      // 检查是否是键值对
      const keyValueMatch = trimmed.match(/^(\w+):\s*(.+)$/);
      if (keyValueMatch) {
        const key = keyValueMatch[1];
        const value = keyValueMatch[2].trim();

        // 如果值是数组标记
        if (value === '' || value === '[]') {
          currentKey = key;
          currentArray = null;
        } else {
          result[key] = value;
          currentKey = '';
          currentArray = null;
        }
      } else {
        // 检查是否是数组键
        const arrayKeyMatch = trimmed.match(/^(\w+):\s*$/);
        if (arrayKeyMatch) {
          currentKey = arrayKeyMatch[1];
          currentArray = null;
        }
      }
    }

    return result;
  }
}
