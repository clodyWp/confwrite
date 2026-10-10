import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChapterTypeLoader } from '../../src/knowledge/chapter-type-loader.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-chapter-type-test-'));
}

describe('ChapterTypeLoader', () => {
  let tempDir: string;
  let loader: ChapterTypeLoader;

  beforeEach(() => {
    tempDir = createTempDir();
    loader = new ChapterTypeLoader(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadChapterType', () => {
    it('应该从知识库加载章节类型定义', () => {
      // 创建测试用的章节类型文件
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      const overviewContent = `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---

# 概述章写作指南

## 内容要求
- 必须包含项目背景
- 必须包含项目目标
`;
      writeFileSync(join(chapterTypesDir, 'overview.md'), overviewContent);

      const typeConfig = loader.loadChapterType('overview');
      
      expect(typeConfig).toBeDefined();
      expect(typeConfig.name).toBe('概述章');
      expect(typeConfig.wordBudget).toEqual({ min: 5000, max: 8000 });
      expect(typeConfig.importance).toBe(3);
      expect(typeConfig.writingStyle).toBe('overview');
    });

    it('应该支持自定义类型的加载', () => {
      const customTypesDir = join(tempDir, 'knowledge', 'chapter-types', 'custom');
      mkdirSync(customTypesDir, { recursive: true });
      
      const securityContent = `---
name: 安全章
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---

# 安全章写作指南
`;
      writeFileSync(join(customTypesDir, 'security.md'), securityContent);

      const typeConfig = loader.loadChapterType('custom/security');
      
      expect(typeConfig).toBeDefined();
      expect(typeConfig.name).toBe('安全章');
      expect(typeConfig.wordBudget).toEqual({ min: 8000, max: 12000 });
      expect(typeConfig.importance).toBe(4);
    });

    it('应该在类型不存在时抛出错误', () => {
      expect(() => {
        loader.loadChapterType('nonexistent');
      }).toThrow('章节类型不存在: nonexistent');
    });
  });

  describe('loadAllChapterTypes', () => {
    it('应该加载所有可用的章节类型', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      // 创建多个类型文件
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);
      
      writeFileSync(join(chapterTypesDir, 'requirements.md'), `---
name: 需求章
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---
`);

      const allTypes = loader.loadAllChapterTypes();
      
      expect(allTypes.size).toBe(2);
      expect(allTypes.has('overview')).toBe(true);
      expect(allTypes.has('requirements')).toBe(true);
    });

    it('应该包含自定义类型的加载', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      const customTypesDir = join(chapterTypesDir, 'custom');
      mkdirSync(customTypesDir, { recursive: true });
      
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);
      
      writeFileSync(join(customTypesDir, 'security.md'), `---
name: 安全章
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---
`);

      const allTypes = loader.loadAllChapterTypes();
      
      expect(allTypes.size).toBe(2);
      expect(allTypes.has('overview')).toBe(true);
      expect(allTypes.has('custom/security')).toBe(true);
    });

    it('应该在目录为空时返回空Map', () => {
      const allTypes = loader.loadAllChapterTypes();
      expect(allTypes.size).toBe(0);
    });
  });

  describe('getDefaultWordBudget', () => {
    it('应该返回类型的默认字数预算', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);

      const budget = loader.getDefaultWordBudget('overview');
      
      expect(budget).toEqual({ min: 5000, max: 8000 });
    });

    it('应该在类型不存在时返回null', () => {
      const budget = loader.getDefaultWordBudget('nonexistent');
      expect(budget).toBeNull();
    });
  });

  describe('getWritingStyle', () => {
    it('应该返回类型的默认写作风格', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      
      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);

      const style = loader.getWritingStyle('overview');
      
      expect(style).toBe('overview');
    });

    it('应该在类型不存在时返回null', () => {
      const style = loader.getWritingStyle('nonexistent');
      expect(style).toBeNull();
    });
  });

  describe('writingGuidance', () => {
    it('应该解析 frontmatter 中的 writingGuidance', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });

      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
writingGuidance: |
  概述章节通常包含：项目背景、目标范围、主要内容概览。
---
`);

      const config = loader.loadChapterType('overview');
      expect(config.writingGuidance).toContain('概述章节通常包含');
    });

    it('应该在缺少 writingGuidance 时返回 undefined', () => {
      const chapterTypesDir = join(tempDir, 'knowledge', 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });

      writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);

      const config = loader.loadChapterType('overview');
      expect(config.writingGuidance).toBeUndefined();
    });
  });
});
