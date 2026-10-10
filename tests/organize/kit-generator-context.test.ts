import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';
import type { Outline } from '../../src/outline/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-kit-generator-context-test-'));
}

describe('KitGenerator - Context Injection', () => {
  let tempDir: string;
  let generator: KitGenerator;
  let mockOutline: Outline;

  beforeEach(() => {
    tempDir = createTempDir();
    generator = new KitGenerator();
    
    // 创建模拟大纲
    mockOutline = {
      title: '技术方案',
      targetWords: 50000,
      chapters: [
        {
          id: 'ch001',
          title: '项目概述',
          type: 'overview',
          description: '介绍项目背景和目标',
          wordBudget: { min: 5000, max: 8000 },
          importance: 3,
        },
        {
          id: 'ch002',
          title: '需求分析',
          type: 'requirements',
          description: '详细分析系统需求',
          wordBudget: { min: 8000, max: 12000 },
          importance: 4,
        },
        {
          id: 'ch003',
          title: '系统架构',
          type: 'architecture',
          description: '设计系统架构方案',
          wordBudget: { min: 10000, max: 15000 },
          importance: 5,
        },
      ],
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateWithOutline', () => {
    it('应该注入前一章的上下文', () => {
      const mapping: ChapterMapping = {
        chapterId: 'ch002',
        title: '需求分析',
        relatedCategories: ['requirements'],
        relatedFiles: [],
        relatedKeywords: ['需求'],
      };

      const baseline: DataBaseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const content = generator.generateWithOutline(mapping, baseline, mockOutline);

      expect(content).toContain('前一章');
      expect(content).toContain('ch001');
      expect(content).toContain('项目概述');
      expect(content).toContain('介绍项目背景和目标');
    });

    it('应该注入后一章的上下文', () => {
      const mapping: ChapterMapping = {
        chapterId: 'ch002',
        title: '需求分析',
        relatedCategories: ['requirements'],
        relatedFiles: [],
        relatedKeywords: ['需求'],
      };

      const baseline: DataBaseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const content = generator.generateWithOutline(mapping, baseline, mockOutline);

      expect(content).toContain('后一章');
      expect(content).toContain('ch003');
      expect(content).toContain('系统架构');
      expect(content).toContain('设计系统架构方案');
    });

    it('应该在第一章时不注入前一章', () => {
      const mapping: ChapterMapping = {
        chapterId: 'ch001',
        title: '项目概述',
        relatedCategories: ['overview'],
        relatedFiles: [],
        relatedKeywords: ['概述'],
      };

      const baseline: DataBaseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const content = generator.generateWithOutline(mapping, baseline, mockOutline);

      expect(content).not.toContain('前一章');
      expect(content).toContain('后一章');
    });

    it('应该在最后一章时不注入后一章', () => {
      const mapping: ChapterMapping = {
        chapterId: 'ch003',
        title: '系统架构',
        relatedCategories: ['architecture'],
        relatedFiles: [],
        relatedKeywords: ['架构'],
      };

      const baseline: DataBaseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const content = generator.generateWithOutline(mapping, baseline, mockOutline);

      expect(content).toContain('前一章');
      expect(content).not.toContain('后一章');
    });

    it('应该在章节不存在时不注入上下文', () => {
      const mapping: ChapterMapping = {
        chapterId: 'ch999',
        title: '不存在的章节',
        relatedCategories: [],
        relatedFiles: [],
        relatedKeywords: [],
      };

      const baseline: DataBaseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const content = generator.generateWithOutline(mapping, baseline, mockOutline);

      expect(content).not.toContain('前一章');
      expect(content).not.toContain('后一章');
    });
  });
});
