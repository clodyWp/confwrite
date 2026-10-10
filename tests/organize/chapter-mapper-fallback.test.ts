import { describe, it, expect } from 'vitest';
import { ChapterMapper } from '../../src/organize/chapter-mapper.js';
import { OutlineNode } from '../../src/organize/outline-parser.js';
import type { IndexData, MaterialFile } from '../../src/organize/indexer.js';

describe('ChapterMapper - fallback 改进', () => {
  const mapper = new ChapterMapper();

  const createMockOutline = (id: string, title: string): OutlineNode => {
    const root = new OutlineNode(1, '根节点');
    const chapter = new OutlineNode(2, title);
    chapter.id = id;
    root.children.push(chapter);
    return root;
  };

  const createMockIndex = (): IndexData => {
    const files: MaterialFile[] = [
      {
        filename: '总索引.md',
        path: '/path/总索引.md',
        size: 1000,
        category: '索引',
        keywords: ['索引', '目录'],
        summary: '项目总索引',
      },
      {
        filename: '项目概述.md',
        path: '/path/项目概述.md',
        size: 2000,
        category: '概述',
        keywords: ['项目', '概述'],
        summary: '项目概述文档',
      },
      {
        filename: '术语表.md',
        path: '/path/术语表.md',
        size: 1500,
        category: '术语',
        keywords: ['术语', '定义'],
        summary: '项目术语表',
      },
      {
        filename: '功能需求.md',
        path: '/path/功能需求.md',
        size: 5000,
        category: '功能',
        keywords: ['功能', '需求'],
        summary: '功能需求文档',
      },
    ];

    return {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      categories: ['索引', '概述', '术语', '功能'],
      byCategory: {
        '索引': [files[0]],
        '概述': [files[1]],
        '术语': [files[2]],
        '功能': [files[3]],
      },
      byFormat: { md: files.length },
      files,
    };
  };

  describe('通用参考资料分配', () => {
    it('应该为无匹配章节分配通用参考资料', () => {
      const outline = createMockOutline('ch001', '抽象概念');
      const index = createMockIndex();

      const mappings = mapper.map(outline, index);
      const mapping = mappings[0];

      // 应该分配通用参考资料
      expect(mapping.relatedFiles.length).toBeGreaterThan(0);
      
      // 应该包含通用资料（索引、概述、术语表）
      const filenames = mapping.relatedFiles.map(f => f.filename);
      const hasUniversalFiles = filenames.some(f => 
        f.includes('索引') || f.includes('概述') || f.includes('术语')
      );
      expect(hasUniversalFiles).toBe(true);
    });

    it('应该标记 fallback 状态', () => {
      const outline = createMockOutline('ch001', '抽象概念');
      const index = createMockIndex();

      const mappings = mapper.map(outline, index);
      const mapping = mappings[0];

      // 应该有 fallback 标记
      expect(mapping.isFallback).toBe(true);
    });

    it('精准匹配时不应标记为 fallback', () => {
      const outline = createMockOutline('ch001', '功能需求分析');
      const index = createMockIndex();

      const mappings = mapper.map(outline, index);
      const mapping = mappings[0];

      // 精准匹配时不应是 fallback
      expect(mapping.isFallback).toBe(false);
    });
  });

  describe('章节类型分配', () => {
    it('功能章节应优先分配功能相关通用资料', () => {
      const outline = createMockOutline('ch001', '系统功能');
      const index = createMockIndex();

      const mappings = mapper.map(outline, index);
      const mapping = mappings[0];

      // 应该包含功能相关的通用资料
      const filenames = mapping.relatedFiles.map(f => f.filename);
      expect(filenames.some(f => f.includes('功能') || f.includes('需求'))).toBe(true);
    });
  });
});
