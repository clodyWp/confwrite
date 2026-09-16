import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';
import type { MaterialFile } from '../../src/organize/scanner.js';

describe('KitGenerator', () => {
  let tempDir: string;
  let generator: KitGenerator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-kit-test-'));
    generator = new KitGenerator();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('generates kit content for a chapter', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('doc1.md', '技术'),
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('# ch001');
      expect(content).toContain('系统概述');
      expect(content).toContain('doc1.md');
    });

    it('includes chapter information', () => {
      const mapping = createMockMapping('ch001', '系统概述');
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('## 章节信息');
      expect(content).toContain('ch001');
      expect(content).toContain('系统概述');
    });

    it('includes related files', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('doc1.md', '技术'),
        createMockMaterialFile('doc2.md', '业务'),
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('## 相关文件');
      expect(content).toContain('doc1.md');
      expect(content).toContain('doc2.md');
    });

    it('includes key data from baseline', () => {
      const mapping = createMockMapping('ch001', '系统概述');
      const baseline = createMockBaseline({
        metrics: { '性能': '99.9%', '响应时间': '100ms' },
      });

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('## 关键数据');
      expect(content).toContain('99.9%');
      expect(content).toContain('100ms');
    });

    it('includes writing tips', () => {
      const mapping = createMockMapping('ch001', '系统概述');
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('## 写作提示');
    });

    it('handles empty related files', () => {
      const mapping = createMockMapping('ch001', '系统概述', []);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('ch001');
      expect(content).toContain('系统概述');
    });
  });

  describe('generateAndSave', () => {
    it('saves kit to file', () => {
      const mapping = createMockMapping('ch001', '系统概述');
      const baseline = createMockBaseline();

      const outputPath = join(tempDir, 'ch001.md');
      generator.generateAndSave(mapping, baseline, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('ch001');
    });

    it('creates directory if not exists', () => {
      const mapping = createMockMapping('ch001', '系统概述');
      const baseline = createMockBaseline();

      const outputDir = join(tempDir, 'kits');
      const outputPath = join(outputDir, 'ch001.md');
      generator.generateAndSave(mapping, baseline, outputPath);

      expect(existsSync(outputDir)).toBe(true);
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('generateBatch', () => {
    it('generates kits for multiple chapters', () => {
      const mappings = [
        createMockMapping('ch001', '系统概述'),
        createMockMapping('ch002', '架构设计'),
      ];
      const baseline = createMockBaseline();

      const outputDir = tempDir;
      const result = generator.generateBatch(mappings, baseline, outputDir);

      expect(result.results.length).toBe(2);
      expect(existsSync(join(outputDir, 'ch001.md'))).toBe(true);
      expect(existsSync(join(outputDir, 'ch002.md'))).toBe(true);
    });

    it('returns generation statistics', () => {
      const mappings = [
        createMockMapping('ch001', '系统概述'),
        createMockMapping('ch002', '架构设计'),
      ];
      const baseline = createMockBaseline();

      const outputDir = tempDir;
      const results = generator.generateBatch(mappings, baseline, outputDir);

      expect(results.total).toBe(2);
      expect(results.success).toBe(2);
      expect(results.failed).toBe(0);
    });
  });
});

function createMockMapping(
  chapterId: string,
  title: string,
  relatedFiles: MaterialFile[] = []
): ChapterMapping {
  return {
    chapterId,
    title,
    relatedFiles,
    relatedCategories: Array.from(new Set(relatedFiles.map(f => f.category))),
    relatedKeywords: Array.from(new Set(relatedFiles.flatMap(f => f.keywords))),
  };
}

function createMockMaterialFile(filename: string, category: string): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/path/${filename}`,
    format: 'markdown',
    size: 1000,
    title: filename.replace('.md', ''),
    keywords: [],
    summary: 'Mock summary',
    category,
  };
}

function createMockBaseline(overrides: Partial<DataBaseline> = {}): DataBaseline {
  return {
    sourceFiles: 10,
    metrics: {},
    timeline: {},
    technicalTerms: [],
    requirements: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}
