import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IndexGenerator } from '../../src/organize/indexer.js';
import type { MaterialFile } from '../../src/organize/scanner.js';
import type { IndexData } from '../../src/organize/indexer.js';

describe('IndexGenerator', () => {
  let tempDir: string;
  let generator: IndexGenerator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-indexer-test-'));
    generator = new IndexGenerator();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('generates index from material files', () => {
      const files: MaterialFile[] = [
        {
          filename: 'doc1.md',
          relativePath: 'doc1.md',
          absolutePath: '/path/doc1.md',
          format: 'markdown',
          size: 1000,
          title: 'Document 1',
          keywords: ['api', 'system'],
          summary: 'Summary 1',
          category: '技术',
        },
        {
          filename: 'doc2.md',
          relativePath: 'doc2.md',
          absolutePath: '/path/doc2.md',
          format: 'markdown',
          size: 2000,
          title: 'Document 2',
          keywords: ['design', 'architecture'],
          summary: 'Summary 2',
          category: '技术',
        },
      ];

      const index = generator.generate(files);

      expect(index.totalFiles).toBe(2);
      expect(index.categories).toContain('技术');
      expect(index.files.length).toBe(2);
    });

    it('groups files by category', () => {
      const files: MaterialFile[] = [
        createMockFile('doc1.md', '技术'),
        createMockFile('doc2.md', '技术'),
        createMockFile('doc3.md', '业务'),
      ];

      const index = generator.generate(files);

      expect(index.byCategory['技术'].length).toBe(2);
      expect(index.byCategory['业务'].length).toBe(1);
    });

    it('extracts all unique keywords', () => {
      const files: MaterialFile[] = [
        createMockFile('doc1.md', '技术', ['api', 'system']),
        createMockFile('doc2.md', '技术', ['api', 'design']),
      ];

      const index = generator.generate(files);

      expect(index.keywords).toContain('api');
      expect(index.keywords).toContain('system');
      expect(index.keywords).toContain('design');
    });

    it('generates searchable index file', () => {
      const files = [createMockFile('doc1.md', '技术')];

      const outputPath = join(tempDir, 'index.json');
      generator.generateAndSave(files, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      
      const content = readFileSync(outputPath, 'utf-8');
      const index: IndexData = JSON.parse(content);
      expect(index.totalFiles).toBe(1);
    });

    it('generates per-category index files', () => {
      const files = [
        createMockFile('doc1.md', '技术'),
        createMockFile('doc2.md', '业务'),
      ];

      const outputDir = tempDir;
      generator.generatePerCategory(files, outputDir);

      expect(existsSync(join(outputDir, 'index-技术.json'))).toBe(true);
      expect(existsSync(join(outputDir, 'index-业务.json'))).toBe(true);
    });

    it('handles empty file list', () => {
      const index = generator.generate([]);

      expect(index.totalFiles).toBe(0);
      expect(index.categories.length).toBe(0);
      expect(index.files.length).toBe(0);
    });
  });

  describe('search', () => {
    it('searches by keyword', () => {
      const files = [
        createMockFile('doc1.md', '技术', ['api', 'system']),
        createMockFile('doc2.md', '业务', ['process', 'workflow']),
      ];

      const index = generator.generate(files);
      const results = generator.search(index, 'api');

      expect(results.length).toBe(1);
      expect(results[0].filename).toBe('doc1.md');
    });

    it('searches by title', () => {
      const files = [
        createMockFileWith('doc1.md', '技术', 'API Design Guide'),
        createMockFileWith('doc2.md', '业务', 'Business Process'),
      ];

      const index = generator.generate(files);
      const results = generator.search(index, 'API');

      expect(results.length).toBe(1);
      expect(results[0].title).toBe('API Design Guide');
    });

    it('searches by category', () => {
      const files = [
        createMockFile('doc1.md', '技术'),
        createMockFile('doc2.md', '业务'),
      ];

      const index = generator.generate(files);
      const results = generator.searchByCategory(index, '技术');

      expect(results.length).toBe(1);
      expect(results[0].category).toBe('技术');
    });

    it('returns empty array for no matches', () => {
      const files = [createMockFile('doc1.md', '技术')];
      const index = generator.generate(files);

      const results = generator.search(index, 'nonexistent');
      expect(results.length).toBe(0);
    });
  });
});

function createMockFile(filename: string, category: string, keywords: string[] = []): MaterialFile {
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

function createMockFileWith(filename: string, category: string, title: string): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/path/${filename}`,
    format: 'markdown',
    size: 1000,
    title,
    keywords: [],
    summary: 'Mock summary',
    category,
  };
}
