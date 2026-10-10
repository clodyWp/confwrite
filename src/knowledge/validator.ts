import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
  };
}

/**
 * 综合验证结果
 */
export interface AllValidationResult {
  valid: boolean;
  chapterTypes: ValidationResult;
  outlineTemplates: ValidationResult;
  requirementCategories: ValidationResult;
  stats: {
    chapterTypes: number;
    outlineTemplates: number;
    requirementCategories: number;
  };
}

/**
 * 知识库验证器
 * 用于验证知识库文件的格式和内容
 */
export class KnowledgeBaseValidator {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 验证章节类型知识库
   */
  validateChapterTypes(): ValidationResult {
    const chapterTypesDir = join(this.projectDir, 'knowledge', 'chapter-types');
    return this.validateDirectory(chapterTypesDir, 'chapter-type');
  }

  /**
   * 验证大纲模板知识库
   */
  validateOutlineTemplates(): ValidationResult {
    const templatesDir = join(this.projectDir, 'knowledge', 'outline-templates');
    return this.validateDirectory(templatesDir, 'outline-template');
  }

  /**
   * 验证需求分类知识库
   */
  validateRequirementCategories(): ValidationResult {
    const categoriesDir = join(this.projectDir, 'knowledge', 'requirement-categories');
    return this.validateDirectory(categoriesDir, 'requirement-category');
  }

  /**
   * 验证所有知识库
   */
  validateAll(): AllValidationResult {
    const chapterTypes = this.validateChapterTypes();
    const outlineTemplates = this.validateOutlineTemplates();
    const requirementCategories = this.validateRequirementCategories();

    return {
      valid: chapterTypes.valid && outlineTemplates.valid && requirementCategories.valid,
      chapterTypes,
      outlineTemplates,
      requirementCategories,
      stats: {
        chapterTypes: chapterTypes.stats.total,
        outlineTemplates: outlineTemplates.stats.total,
        requirementCategories: requirementCategories.stats.total,
      },
    };
  }

  /**
   * 生成验证报告
   */
  generateReport(result: AllValidationResult): string {
    const lines: string[] = [];

    lines.push('# 知识库验证报告\n');

    // 总体统计
    lines.push('## 总体统计\n');
    lines.push(`- **章节类型**: ${result.stats.chapterTypes} 个`);
    lines.push(`- **大纲模板**: ${result.stats.outlineTemplates} 个`);
    lines.push(`- **需求分类**: ${result.stats.requirementCategories} 个`);
    lines.push(`- **总体状态**: ${result.valid ? '✅ 通过' : '❌ 失败'}`);
    lines.push('');

    // 章节类型验证结果
    lines.push('## 章节类型知识库\n');
    lines.push(`- **总数**: ${result.chapterTypes.stats.total}`);
    lines.push(`- **有效**: ${result.chapterTypes.stats.valid}`);
    lines.push(`- **无效**: ${result.chapterTypes.stats.invalid}`);
    if (result.chapterTypes.errors.length > 0) {
      lines.push('- **错误**:\n');
      for (const error of result.chapterTypes.errors) {
        lines.push(`  - ${error}`);
      }
    }
    lines.push('');

    // 大纲模板验证结果
    lines.push('## 大纲模板知识库\n');
    lines.push(`- **总数**: ${result.outlineTemplates.stats.total}`);
    lines.push(`- **有效**: ${result.outlineTemplates.stats.valid}`);
    lines.push(`- **无效**: ${result.outlineTemplates.stats.invalid}`);
    if (result.outlineTemplates.errors.length > 0) {
      lines.push('- **错误**:\n');
      for (const error of result.outlineTemplates.errors) {
        lines.push(`  - ${error}`);
      }
    }
    lines.push('');

    // 需求分类验证结果
    lines.push('## 需求分类知识库\n');
    lines.push(`- **总数**: ${result.requirementCategories.stats.total}`);
    lines.push(`- **有效**: ${result.requirementCategories.stats.valid}`);
    lines.push(`- **无效**: ${result.requirementCategories.stats.invalid}`);
    if (result.requirementCategories.errors.length > 0) {
      lines.push('- **错误**:\n');
      for (const error of result.requirementCategories.errors) {
        lines.push(`  - ${error}`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 验证目录中的所有文件
   */
  private validateDirectory(dir: string, type: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      stats: {
        total: 0,
        valid: 0,
        invalid: 0,
      },
    };

    if (!existsSync(dir)) {
      return result;
    }

    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    result.stats.total = files.length;

    for (const file of files) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, 'utf-8');

      try {
        this.validateFile(content, type, file);
        result.stats.valid++;
      } catch (error) {
        result.valid = false;
        result.stats.invalid++;
        result.errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  /**
   * 验证单个文件
   */
  private validateFile(content: string, type: string, filename: string): void {
    // 检查frontmatter（支持 CRLF 和 LF）
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      throw new Error('缺少frontmatter');
    }

    const frontmatter = frontmatterMatch[1];

    // 根据类型检查必需字段
    switch (type) {
      case 'chapter-type':
        this.validateChapterTypeFrontmatter(frontmatter);
        break;
      case 'outline-template':
        this.validateOutlineTemplateFrontmatter(frontmatter);
        break;
      case 'requirement-category':
        this.validateRequirementCategoryFrontmatter(frontmatter);
        break;
    }
  }

  /**
   * 验证章节类型的frontmatter
   */
  private validateChapterTypeFrontmatter(frontmatter: string): void {
    const requiredFields = ['name', 'wordBudget', 'importance', 'writingStyle'];
    
    for (const field of requiredFields) {
      if (!frontmatter.includes(field)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }

    // 检查wordBudget格式
    if (!frontmatter.includes('min:') || !frontmatter.includes('max:')) {
      throw new Error('wordBudget必须包含min和max字段');
    }
  }

  /**
   * 验证大纲模板的frontmatter
   */
  private validateOutlineTemplateFrontmatter(frontmatter: string): void {
    const requiredFields = ['name', 'description', 'targetWords', 'chapters'];
    
    for (const field of requiredFields) {
      if (!frontmatter.includes(field)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }
  }

  /**
   * 验证需求分类的frontmatter
   */
  private validateRequirementCategoryFrontmatter(frontmatter: string): void {
    const requiredFields = ['name', 'description', 'chapterTypes'];
    
    for (const field of requiredFields) {
      if (!frontmatter.includes(field)) {
        throw new Error(`缺少必需字段: ${field}`);
      }
    }
  }
}
