import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 章节类型配置
 */
export interface ChapterTypeConfig {
  name: string;
  wordBudget: {
    min: number;
    max: number;
  };
  importance: number;
  writingStyle: string;
  content?: string; // 文件中的其他内容（写作指南等）
}

/**
 * 章节类型加载器
 * 从知识库加载章节类型定义
 */
export class ChapterTypeLoader {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 加载单个章节类型
   * @param type 类型名称（如 'overview' 或 'custom/security'）
   */
  loadChapterType(type: string): ChapterTypeConfig {
    const typePath = this.resolveTypePath(type);
    
    if (!existsSync(typePath)) {
      throw new Error(`章节类型不存在: ${type}`);
    }

    const content = readFileSync(typePath, 'utf-8');
    return this.parseChapterTypeFile(content, type);
  }

  /**
   * 加载所有可用的章节类型
   */
  loadAllChapterTypes(): Map<string, ChapterTypeConfig> {
    const types = new Map<string, ChapterTypeConfig>();
    const chapterTypesDir = join(this.projectDir, 'knowledge', 'chapter-types');

    if (!existsSync(chapterTypesDir)) {
      return types;
    }

    // 加载根目录下的类型
    this.loadTypesFromDirectory(chapterTypesDir, '', types);

    // 加载custom目录下的类型
    const customDir = join(chapterTypesDir, 'custom');
    if (existsSync(customDir)) {
      this.loadTypesFromDirectory(customDir, 'custom/', types);
    }

    return types;
  }

  /**
   * 获取类型的默认字数预算
   */
  getDefaultWordBudget(type: string): { min: number; max: number } | null {
    try {
      const config = this.loadChapterType(type);
      return config.wordBudget;
    } catch {
      return null;
    }
  }

  /**
   * 获取类型的默认写作风格
   */
  getWritingStyle(type: string): string | null {
    try {
      const config = this.loadChapterType(type);
      return config.writingStyle;
    } catch {
      return null;
    }
  }

  /**
   * 解析类型路径
   */
  private resolveTypePath(type: string): string {
    // 如果是 custom/xxx 格式
    if (type.startsWith('custom/')) {
      return join(this.projectDir, 'knowledge', 'chapter-types', `${type}.md`);
    }
    // 否则是根目录下的类型
    return join(this.projectDir, 'knowledge', 'chapter-types', `${type}.md`);
  }

  /**
   * 从目录加载所有类型
   */
  private loadTypesFromDirectory(
    dir: string,
    prefix: string,
    types: Map<string, ChapterTypeConfig>
  ): void {
    if (!existsSync(dir)) {
      return;
    }

    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);

      if (stat.isFile() && file.endsWith('.md')) {
        const typeName = prefix + file.replace('.md', '');
        try {
          const content = readFileSync(filePath, 'utf-8');
          const config = this.parseChapterTypeFile(content, typeName);
          types.set(typeName, config);
        } catch (error) {
          // 跳过解析失败的文件
          console.warn(`Failed to parse chapter type file: ${filePath}`, error);
        }
      }
    }
  }

  /**
   * 解析章节类型文件
   * 支持 YAML frontmatter 格式
   */
  private parseChapterTypeFile(content: string, typeName: string): ChapterTypeConfig {
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      throw new Error(`Invalid chapter type file format: ${typeName}`);
    }

    const frontmatter = frontmatterMatch[1];
    const config = this.parseFrontmatter(frontmatter);

    // 提取 frontmatter 之后的内容
    const contentAfterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

    return {
      name: config.name || typeName,
      wordBudget: config.wordBudget || { min: 5000, max: 8000 },
      importance: config.importance || 3,
      writingStyle: config.writingStyle || 'functional',
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
    let currentObject: any = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 检查是否是嵌套对象的开始
      const keyMatch = trimmed.match(/^(\w+):\s*$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        currentObject = {};
        result[currentKey] = currentObject;
        continue;
      }

      // 检查是否是键值对
      const keyValueMatch = trimmed.match(/^(\w+):\s*(.+)$/);
      if (keyValueMatch) {
        const key = keyValueMatch[1];
        const value = keyValueMatch[2].trim();

        // 如果当前在嵌套对象中
        if (currentObject && line.startsWith('  ')) {
          currentObject[key] = this.parseValue(value);
        } else {
          // 否则在根对象中
          result[key] = this.parseValue(value);
          currentObject = null;
        }
      }
    }

    return result;
  }

  /**
   * 解析值（支持数字和字符串）
   */
  private parseValue(value: string): any {
    // 尝试解析为数字
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return numValue;
    }

    // 否则返回字符串
    return value;
  }
}
