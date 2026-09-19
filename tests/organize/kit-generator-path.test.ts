import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';
import type { MaterialFile } from '../../src/organize/scanner.js';

describe('KitGenerator - 文件路径信息', () => {
  let tempDir: string;
  let generator: KitGenerator;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-kit-path-test-'));
    generator = new KitGenerator();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('素材包应包含文件路径', () => {
    it('应该在相关文件部分包含路径信息', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('招标技术要求.md', 'inputs/招标技术要求.md'),
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      // 应该包含文件名
      expect(content).toContain('招标技术要求.md');
      // 应该包含路径信息
      expect(content).toContain('路径: inputs/招标技术要求.md');
    });

    it('应该为每个相关文件都包含路径', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('doc1.md', 'inputs/doc1.md'),
        createMockMaterialFile('doc2.md', 'reference_material/doc2.md'),
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('路径: inputs/doc1.md');
      expect(content).toContain('路径: reference_material/doc2.md');
    });

    it('路径信息应该在文件名之后、摘要之前', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('doc1.md', 'inputs/doc1.md'),
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      const lines = content.split('\n');
      const filenameLineIndex = lines.findIndex(line => line.includes('**doc1.md**'));
      const pathLineIndex = lines.findIndex(line => line.includes('路径: inputs/doc1.md'));

      expect(filenameLineIndex).toBeGreaterThan(-1);
      expect(pathLineIndex).toBeGreaterThan(-1);
      expect(pathLineIndex).toBe(filenameLineIndex + 1);
    });

    it('没有路径时不应该显示路径行', () => {
      const mapping = createMockMapping('ch001', '系统概述', [
        createMockMaterialFile('doc1.md', ''), // 空路径
      ]);
      const baseline = createMockBaseline();

      const content = generator.generate(mapping, baseline);

      expect(content).toContain('doc1.md');
      expect(content).not.toContain('路径:');
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

function createMockMaterialFile(filename: string, relativePath: string): MaterialFile {
  return {
    filename,
    relativePath,
    absolutePath: `/project/${relativePath}`,
    format: 'markdown',
    size: 1000,
    title: filename.replace('.md', ''),
    keywords: [],
    summary: 'Mock summary',
    category: '未分类',
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
