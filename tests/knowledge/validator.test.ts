import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeBaseValidator } from '../../src/knowledge/validator.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-kb-validator-test-'));
}

describe('KnowledgeBaseValidator', () => {
  let tempDir: string;
  let projectDir: string;
  let validator: KnowledgeBaseValidator;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    validator = new KnowledgeBaseValidator(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateChapterTypes', () => {
    it('应该验证章节类型知识库的格式', () => {
      const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      const validContent = `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---

# 概述章写作指南
`;
      writeFileSync(join(chapterTypesDir, 'overview.md'), validContent, 'utf-8');

      const result = validator.validateChapterTypes();

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.stats.total).toBe(1);
    });

    it('应该检测缺少frontmatter的章节类型文件', () => {
      const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      const invalidContent = `# 概述章写作指南

缺少frontmatter
`;
      writeFileSync(join(chapterTypesDir, 'overview.md'), invalidContent, 'utf-8');

      const result = validator.validateChapterTypes();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('frontmatter');
    });

    it('应该检测缺少必需字段的frontmatter', () => {
      const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      const invalidContent = `---
name: 概述章
---

# 概述章写作指南
`;
      writeFileSync(join(chapterTypesDir, 'overview.md'), invalidContent, 'utf-8');

      const result = validator.validateChapterTypes();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('wordBudget');
    });
  });

  describe('validateOutlineTemplates', () => {
    it('应该验证大纲模板知识库的格式', () => {
      const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      const validContent = `---
name: 技术方案
description: 技术项目方案
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---

# 技术方案模板
`;
      writeFileSync(join(templatesDir, 'technical-proposal.md'), validContent, 'utf-8');

      const result = validator.validateOutlineTemplates();

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.stats.total).toBe(1);
    });

    it('应该检测缺少chapters字段的模板', () => {
      const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      const invalidContent = `---
name: 技术方案
description: 技术项目方案
targetWords: 50000
---

# 技术方案模板
`;
      writeFileSync(join(templatesDir, 'technical-proposal.md'), invalidContent, 'utf-8');

      const result = validator.validateOutlineTemplates();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('chapters');
    });
  });

  describe('validateRequirementCategories', () => {
    it('应该验证需求分类知识库的格式', () => {
      const categoriesDir = join(projectDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      
      const validContent = `---
name: 功能需求
description: 功能相关需求
chapterTypes:
  - requirements
  - functional
---

# 功能需求
`;
      writeFileSync(join(categoriesDir, 'functional.md'), validContent, 'utf-8');

      const result = validator.validateRequirementCategories();

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.stats.total).toBe(1);
    });

    it('应该检测缺少chapterTypes字段的分类', () => {
      const categoriesDir = join(projectDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      
      const invalidContent = `---
name: 功能需求
description: 功能相关需求
---

# 功能需求
`;
      writeFileSync(join(categoriesDir, 'functional.md'), invalidContent, 'utf-8');

      const result = validator.validateRequirementCategories();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('chapterTypes');
    });
  });

  describe('validateAll', () => {
    it('应该验证所有知识库', () => {
      // 创建章节类型
      const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`, 'utf-8');

      // 创建大纲模板
      const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术项目方案
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---
`, 'utf-8');

      // 创建需求分类
      const categoriesDir = join(projectDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      writeFileSync(join(categoriesDir, 'functional.md'), `---
name: 功能需求
description: 功能相关需求
chapterTypes:
  - requirements
---
`, 'utf-8');

      const result = validator.validateAll();

      expect(result.valid).toBe(true);
      expect(result.stats.chapterTypes).toBe(1);
      expect(result.stats.outlineTemplates).toBe(1);
      expect(result.stats.requirementCategories).toBe(1);
    });
  });

  describe('generateReport', () => {
    it('应该生成知识库验证报告', () => {
      const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`, 'utf-8');

      const result = validator.validateAll();
      const report = validator.generateReport(result);

      expect(report).toContain('知识库验证报告');
      expect(report).toContain('章节类型');
      expect(report).toContain('大纲模板');
      expect(report).toContain('需求分类');
    });
  });
});
