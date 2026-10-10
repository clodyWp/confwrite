import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequirementCategoryLoader } from '../../src/knowledge/requirement-category-loader.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-requirement-category-test-'));
}

describe('RequirementCategoryLoader', () => {
  let tempDir: string;
  let loader: RequirementCategoryLoader;

  beforeEach(() => {
    tempDir = createTempDir();
    loader = new RequirementCategoryLoader(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadCategory', () => {
    it('应该从知识库加载需求分类', () => {
      const categoriesDir = join(tempDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      
      const categoryContent = `---
name: 功能需求
description: 系统功能相关的需求
chapterTypes:
  - requirements
  - functional
---

# 功能需求

## 定义
功能需求描述系统应该提供的功能和服务。

## 特征
- 描述系统行为
- 定义用户交互
- 规定业务规则

## 示例
- 用户登录功能
- 数据导出功能
- 报表生成功能
`;
      writeFileSync(join(categoriesDir, 'functional.md'), categoryContent);

      const category = loader.loadCategory('functional');
      
      expect(category).toBeDefined();
      expect(category.name).toBe('功能需求');
      expect(category.description).toBe('系统功能相关的需求');
      expect(category.chapterTypes).toContain('requirements');
      expect(category.chapterTypes).toContain('functional');
    });

    it('应该在分类不存在时抛出错误', () => {
      expect(() => {
        loader.loadCategory('nonexistent');
      }).toThrow('需求分类不存在: nonexistent');
    });
  });

  describe('loadAllCategories', () => {
    it('应该加载所有可用的需求分类', () => {
      const categoriesDir = join(tempDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      
      writeFileSync(join(categoriesDir, 'functional.md'), `---
name: 功能需求
description: 功能相关
chapterTypes:
  - requirements
---
`);
      
      writeFileSync(join(categoriesDir, 'performance.md'), `---
name: 性能需求
description: 性能相关
chapterTypes:
  - architecture
---
`);

      const allCategories = loader.loadAllCategories();
      
      expect(allCategories.size).toBe(2);
      expect(allCategories.has('functional')).toBe(true);
      expect(allCategories.has('performance')).toBe(true);
    });

    it('应该在目录为空时返回空Map', () => {
      const allCategories = loader.loadAllCategories();
      expect(allCategories.size).toBe(0);
    });
  });

  describe('getChapterTypesForCategory', () => {
    it('应该返回分类对应的章节类型', () => {
      const categoriesDir = join(tempDir, 'knowledge', 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      
      writeFileSync(join(categoriesDir, 'functional.md'), `---
name: 功能需求
description: 功能相关
chapterTypes:
  - requirements
  - functional
---
`);

      const chapterTypes = loader.getChapterTypesForCategory('functional');
      
      expect(chapterTypes).toContain('requirements');
      expect(chapterTypes).toContain('functional');
    });

    it('应该在分类不存在时返回空数组', () => {
      const chapterTypes = loader.getChapterTypesForCategory('nonexistent');
      expect(chapterTypes).toEqual([]);
    });
  });
});
