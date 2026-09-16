import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BaselineExtractor } from '../../src/organize/baseline-extractor.js';
import type { MaterialFile } from '../../src/organize/scanner.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';

describe('BaselineExtractor', () => {
  let tempDir: string;
  let extractor: BaselineExtractor;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-baseline-test-'));
    extractor = new BaselineExtractor();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('extract', () => {
    it('extracts numbers from content', () => {
      const files = [
        createMockFile('doc1.md', '系统性能达到 99.9%，响应时间 < 100ms'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.metrics).toBeDefined();
      expect(Object.keys(baseline.metrics).length).toBeGreaterThan(0);
    });

    it('extracts percentages', () => {
      const files = [
        createMockFile('doc1.md', '系统可用性 99.99%，错误率低于 0.01%'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.metrics).toBeDefined();
    });

    it('extracts dates and timelines', () => {
      const files = [
        createMockFile('doc1.md', '项目启动时间：2024年1月，预计2024年12月完成'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.timeline).toBeDefined();
    });

    it('extracts technical terms', () => {
      const files = [
        createMockFile('doc1.md', '使用 Kubernetes 部署，基于微服务架构，采用 RESTful API'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.technicalTerms).toBeDefined();
      expect(baseline.technicalTerms.length).toBeGreaterThan(0);
    });

    it('extracts requirements', () => {
      const files = [
        createMockFile('doc1.md', '系统必须支持 1000 并发用户，数据存储容量 10TB'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.requirements).toBeDefined();
    });

    it('merges data from multiple files', () => {
      const files = [
        createMockFile('doc1.md', '系统性能 99.9%'),
        createMockFile('doc2.md', '响应时间 100ms'),
      ];

      const baseline = extractor.extract(files);

      expect(baseline.sourceFiles).toBe(2);
    });

    it('handles empty file list', () => {
      const baseline = extractor.extract([]);

      expect(baseline.sourceFiles).toBe(0);
      expect(baseline.metrics).toEqual({});
    });

    it('generates baseline JSON', () => {
      const files = [createMockFile('doc1.md', '测试内容 100%')];

      const baseline = extractor.extract(files);
      const json = JSON.stringify(baseline, null, 2);

      expect(json).toContain('"metrics"');
      expect(json).toContain('"sourceFiles"');
    });
  });

  describe('validate', () => {
    it('validates baseline structure', () => {
      const baseline: DataBaseline = {
        sourceFiles: 1,
        metrics: { '性能': '99.9%' },
        timeline: {},
        technicalTerms: ['API'],
        requirements: [],
        generatedAt: new Date().toISOString(),
      };

      const result = extractor.validate(baseline);

      expect(result.valid).toBe(true);
    });

    it('detects missing fields', () => {
      const baseline = {
        sourceFiles: 1,
      } as DataBaseline;

      const result = extractor.validate(baseline);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

function createMockFile(filename: string, content: string): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/path/${filename}`,
    format: 'markdown',
    size: content.length,
    title: filename.replace('.md', ''),
    keywords: [],
    summary: content,
    category: '未分类',
  };
}
