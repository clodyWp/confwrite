import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 章节配置
 */
export interface ChapterConfig {
  /** 章节类型 */
  type: string;
  /** 是否必需 */
  required: boolean;
  /** 章节顺序 */
  order: number;
}

/**
 * 大纲模板配置
 */
export interface OutlineTemplate {
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 目标字数 */
  targetWords: number;
  /** 章节配置列表 */
  chapters: ChapterConfig[];
  /** 模板内容（frontmatter之后的部分） */
  content?: string;
}

/**
 * 大纲模板加载器
 * 从知识库加载大纲模板定义
 */
export class OutlineTemplateLoader {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 加载单个大纲模板
   * @param templateName 模板名称（不含.md后缀）
   */
  loadTemplate(templateName: string): OutlineTemplate {
    const templatePath = join(
      this.projectDir,
      'knowledge',
      'outline-templates',
      `${templateName}.md`
    );

    if (!existsSync(templatePath)) {
      throw new Error(`大纲模板不存在: ${templateName}`);
    }

    const content = readFileSync(templatePath, 'utf-8');
    return this.parseTemplateFile(content, templateName);
  }

  /**
   * 加载所有可用的大纲模板
   */
  loadAllTemplates(): Map<string, OutlineTemplate> {
    const templates = new Map<string, OutlineTemplate>();
    const templatesDir = join(this.projectDir, 'knowledge', 'outline-templates');

    if (!existsSync(templatesDir)) {
      return templates;
    }

    const files = readdirSync(templatesDir);
    for (const file of files) {
      const filePath = join(templatesDir, file);
      const stat = statSync(filePath);

      if (stat.isFile() && file.endsWith('.md')) {
        const templateName = file.replace('.md', '');
        try {
          const content = readFileSync(filePath, 'utf-8');
          const template = this.parseTemplateFile(content, templateName);
          templates.set(templateName, template);
        } catch (error) {
          console.warn(`Failed to parse outline template: ${filePath}`, error);
        }
      }
    }

    return templates;
  }

  /**
   * 获取所有模板名称
   */
  getTemplateNames(): string[] {
    const templatesDir = join(this.projectDir, 'knowledge', 'outline-templates');

    if (!existsSync(templatesDir)) {
      return [];
    }

    const files = readdirSync(templatesDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
  }

  /**
   * 解析模板文件
   * 支持 YAML frontmatter 格式
   */
  private parseTemplateFile(content: string, templateName: string): OutlineTemplate {
    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      throw new Error(`Invalid outline template format: ${templateName}`);
    }

    const frontmatter = frontmatterMatch[1];
    const config = this.parseFrontmatter(frontmatter);

    // 提取 frontmatter 之后的内容
    const contentAfterFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

    return {
      name: config.name || templateName,
      description: config.description || '',
      targetWords: config.targetWords || 50000,
      chapters: config.chapters || [],
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
    let currentArray: any[] | null = null;
    let currentObject: any = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 检查是否是数组项的开始（- type: xxx）
      if (trimmed.startsWith('- ')) {
        if (!currentArray) {
          currentArray = [];
          result[currentKey] = currentArray;
        }
        currentObject = {};
        currentArray.push(currentObject);

        // 解析数组项的键值对
        const itemMatch = trimmed.substring(2).match(/^(\w+):\s*(.+)$/);
        if (itemMatch) {
          const key = itemMatch[1];
          const value = itemMatch[2].trim();
          currentObject[key] = this.parseValue(value);
        }
        continue;
      }

      // 检查是否是嵌套对象的属性（在数组项内）
      if (currentObject && line.startsWith('  ')) {
        const keyValueMatch = trimmed.match(/^(\w+):\s*(.+)$/);
        if (keyValueMatch) {
          const key = keyValueMatch[1];
          const value = keyValueMatch[2].trim();
          currentObject[key] = this.parseValue(value);
        }
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
          currentObject = null;
        } else {
          result[key] = this.parseValue(value);
          currentKey = '';
          currentArray = null;
          currentObject = null;
        }
      } else {
        // 检查是否是数组键
        const arrayKeyMatch = trimmed.match(/^(\w+):\s*$/);
        if (arrayKeyMatch) {
          currentKey = arrayKeyMatch[1];
          currentArray = null;
          currentObject = null;
        }
      }
    }

    return result;
  }

  /**
   * 解析值（支持数字、布尔值和字符串）
   */
  private parseValue(value: string): any {
    // 尝试解析为数字
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return numValue;
    }

    // 尝试解析为布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 否则返回字符串
    return value;
  }
}
