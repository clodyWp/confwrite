import { describe, it, expect } from 'vitest';
import { ChapterMapper } from '../../src/organize/chapter-mapper.js';
import type { OutlineNode } from '../../src/organize/outline-parser.js';
import type { IndexData } from '../../src/organize/indexer.js';
import type { MaterialFile } from '../../src/organize/scanner.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';

describe('ChapterMapper', () => {
  describe('map', () => {
    it('maps chapters to relevant files', () => {
      const outline = createMockOutline(['ch001', 'ch002']);
      const index = createMockIndex([
        createMockMaterialFile('doc1.md', '技术', ['api', 'system']),
        createMockMaterialFile('doc2.md', '业务', ['process']),
      ]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);

      expect(mappings.length).toBe(2);
      expect(mappings[0].chapterId).toBe('ch001');
      expect(mappings[0].relatedFiles.length).toBeGreaterThan(0);
    });

    it('assigns files based on keywords', () => {
      const outline = createMockOutline(['ch001']);
      const index = createMockIndex([
        createMockMaterialFile('api-doc.md', '技术', ['api', '接口']),
        createMockMaterialFile('business-doc.md', '业务', ['业务流程']),
      ]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);

      expect(mappings[0].relatedFiles.length).toBeGreaterThan(0);
    });

    it('assigns files based on category', () => {
      const outline = createMockOutline(['ch001']);
      const index = createMockIndex([
        createMockMaterialFile('doc1.md', '技术'),
        createMockMaterialFile('doc2.md', '技术'),
      ]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);

      expect(mappings[0].relatedFiles.length).toBe(2);
    });

    it('handles chapters without related files', () => {
      const outline = createMockOutline(['ch001']);
      const index = createMockIndex([]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);

      expect(mappings.length).toBe(1);
      expect(mappings[0].relatedFiles.length).toBe(0);
    });

    it('preserves chapter order', () => {
      const outline = createMockOutline(['ch003', 'ch001', 'ch002']);
      const index = createMockIndex([]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);

      expect(mappings[0].chapterId).toBe('ch003');
      expect(mappings[1].chapterId).toBe('ch001');
      expect(mappings[2].chapterId).toBe('ch002');
    });
  });

  describe('getMapping', () => {
    it('returns mapping for specific chapter', () => {
      const outline = createMockOutline(['ch001', 'ch002']);
      const index = createMockIndex([
        createMockMaterialFile('doc1.md', '技术'),
      ]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);
      const mapping = mapper.getMapping(mappings, 'ch001');

      expect(mapping).toBeDefined();
      expect(mapping?.chapterId).toBe('ch001');
    });

    it('returns undefined for non-existent chapter', () => {
      const outline = createMockOutline(['ch001']);
      const index = createMockIndex([]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);
      const mapping = mapper.getMapping(mappings, 'ch999');

      expect(mapping).toBeUndefined();
    });
  });

  describe('generateSummary', () => {
    it('generates human-readable summary', () => {
      const outline = createMockOutline(['ch001', 'ch002']);
      const index = createMockIndex([
        createMockMaterialFile('doc1.md', '技术'),
        createMockMaterialFile('doc2.md', '业务'),
      ]);

      const mapper = new ChapterMapper();
      const mappings = mapper.map(outline, index);
      const summary = mapper.generateSummary(mappings);

      expect(summary).toContain('ch001');
      expect(summary).toContain('ch002');
      expect(summary).toContain('doc1.md');
    });

    it('handles empty mappings', () => {
      const mapper = new ChapterMapper();
      const summary = mapper.generateSummary([]);

      expect(summary).toContain('0');
    });
  });
});

function createMockOutline(chapterIds: string[]): OutlineNode {
  const root: OutlineNode = {
    level: 0,
    title: 'Test Outline',
    children: [],
    findChapter(id: string) {
      return this.children.find(c => c.id === id);
    },
    getAllChapters() {
      return this.children.filter(c => c.id);
    },
  };

  for (const id of chapterIds) {
    root.children.push({
      level: 1,
      title: `Chapter ${id}`,
      id,
      spawnLevel: true,
      children: [],
      findChapter: root.findChapter,
      getAllChapters: root.getAllChapters,
    });
  }

  return root;
}

function createMockIndex(files: MaterialFile[]): IndexData {
  return {
    totalFiles: files.length,
    categories: Array.from(new Set(files.map(f => f.category))),
    keywords: Array.from(new Set(files.flatMap(f => f.keywords))),
    byCategory: files.reduce((acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    }, {} as Record<string, MaterialFile[]>),
    files,
    generatedAt: new Date().toISOString(),
  };
}

function createMockMaterialFile(filename: string, category: string, keywords: string[] = []): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/path/${filename}`,
    format: 'markdown',
    size: 1000,
    title: filename.replace('.md', ''),
    keywords,
    summary: 'Mock summary',
    category,
  };
}
