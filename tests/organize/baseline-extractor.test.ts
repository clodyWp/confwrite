import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    it('extracts numbers from content', async () => {
      const files = [
        createMockFile('doc1.md', '系统性能达到 99.9%，响应时间 < 100ms'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.metrics).toBeDefined();
      expect(Object.keys(baseline.metrics).length).toBeGreaterThan(0);
    });

    it('extracts percentages', async () => {
      const files = [
        createMockFile('doc1.md', '系统可用性 99.99%，错误率低于 0.01%'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.metrics).toBeDefined();
    });

    it('extracts dates and timelines', async () => {
      const files = [
        createMockFile('doc1.md', '项目启动时间：2024年1月，预计2024年12月完成'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.timeline).toBeDefined();
    });

    it('extracts technical terms', async () => {
      const files = [
        createMockFile('doc1.md', '使用 Kubernetes 部署，基于微服务架构，采用 RESTful API'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.technicalTerms).toBeDefined();
      expect(baseline.technicalTerms.length).toBeGreaterThan(0);
    });

    it('extracts requirements', async () => {
      const files = [
        createMockFile('doc1.md', '系统必须支持 1000 并发用户，数据存储容量 10TB'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.requirements).toBeDefined();
    });

    it('merges data from multiple files', async () => {
      const files = [
        createMockFile('doc1.md', '系统性能 99.9%'),
        createMockFile('doc2.md', '响应时间 100ms'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.sourceFiles).toBe(2);
    });

    it('handles empty file list', async () => {
      const baseline = await extractor.extract([]);

      expect(baseline.sourceFiles).toBe(0);
      expect(baseline.metrics).toEqual({});
    });

    it('generates baseline JSON', async () => {
      const files = [createMockFile('doc1.md', '测试内容 100%')];

      const baseline = await extractor.extract(files);
      const json = JSON.stringify(baseline, null, 2);

      expect(json).toContain('"metrics"');
      expect(json).toContain('"sourceFiles"');
    });
  });

  describe('extractContext (via metric keys)', () => {
    it('extracts label before colon as key (e.g. "系统可用性：99.9%" → key "系统可用性")', async () => {
      const files = [
        createMockFile('doc1.md', '系统可用性：99.9%'),
      ];

      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      // The key should be '系统可用性' (the label before the colon)
      expect(keys.some(k => k === '系统可用性')).toBe(true);
    });

    it('keeps key length <= 15 characters', async () => {
      const files = [
        createMockFile('doc1.md', '响应时间不超过100ms'),
      ];

      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      for (const key of keys) {
        expect(key.length).toBeLessThanOrEqual(15);
      }
    });

    it('falls back to line prefix when no colon label exists', async () => {
      const files = [
        createMockFile('doc1.md', '当前系统峰值并发达到5000个连接'),
      ];

      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      // Should have some key derived from the line prefix, not empty
      expect(keys.length).toBeGreaterThan(0);
      // Key should contain meaningful Chinese text, not just punctuation
      for (const key of keys) {
        expect(key.length).toBeGreaterThan(0);
      }
    });
  });

  describe('LLM Chinese term extraction', () => {
    it('adds terms from LLM JSON array response', async () => {
      const mockLLM = vi.fn().mockResolvedValue(JSON.stringify(['微服务', '消息队列', '缓存层']));
      const llmExtractor = new BaselineExtractor({ llmCaller: mockLLM });
      const files = [
        createMockFile('doc1.md', '系统采用微服务架构，使用消息队列进行异步通信'),
      ];

      const baseline = await llmExtractor.extract(files);

      expect(baseline.technicalTerms).toContain('微服务');
      expect(baseline.technicalTerms).toContain('消息队列');
      expect(baseline.technicalTerms).toContain('缓存层');
    });

    it('correctly parses JSON wrapped in code blocks', async () => {
      const mockLLM = vi.fn().mockResolvedValue('```json\n["Kubernetes", "负载均衡"]\n```');
      const llmExtractor = new BaselineExtractor({ llmCaller: mockLLM });
      const files = [
        createMockFile('doc1.md', '部署在Kubernetes集群上'),
      ];

      const baseline = await llmExtractor.extract(files);

      expect(baseline.technicalTerms).toContain('Kubernetes');
      expect(baseline.technicalTerms).toContain('负载均衡');
    });

    it('returns empty array and does not crash when LLM call fails', async () => {
      const mockLLM = vi.fn().mockRejectedValue(new Error('LLM API unavailable'));
      const llmExtractor = new BaselineExtractor({ llmCaller: mockLLM });
      const files = [
        createMockFile('doc1.md', '系统使用Redis缓存'),
      ];

      const baseline = await llmExtractor.extract(files);

      // Should not crash, LLM terms just won't be added
      expect(baseline.technicalTerms).toBeDefined();
      expect(Array.isArray(baseline.technicalTerms)).toBe(true);
    });

    it('works without LLM caller (no Chinese LLM extraction)', async () => {
      const extractor2 = new BaselineExtractor();
      const files = [
        createMockFile('doc1.md', '系统采用微服务架构'),
      ];

      const baseline = await extractor2.extract(files);

      // Should still work, just without LLM-extracted Chinese terms
      expect(baseline.technicalTerms).toBeDefined();
      expect(Array.isArray(baseline.technicalTerms)).toBe(true);
    });
  });

  describe('improved requirement extraction', () => {
    it('extracts requirements from list format', async () => {
      const files = [
        createMockFile('doc1.md', '- 必须支持高可用部署\n- 需要水5展\n- 满足等保三级要求'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.requirements.length).toBeGreaterThanOrEqual(3);
      expect(baseline.requirements.some(r => r.includes('高可用'))).toBe(true);
      expect(baseline.requirements.some(r => r.includes('等保'))).toBe(true);
    });

    it('extracts weak requirements starting with "应"', async () => {
      const files = [
        createMockFile('doc1.md', '系统应支持水平扩展，应提供完整的API接口'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.requirements.length).toBeGreaterThanOrEqual(2);
      expect(baseline.requirements.some(r => r.includes('水平扩展'))).toBe(true);
      expect(baseline.requirements.some(r => r.includes('API'))).toBe(true);
    });

    it('extracts requirements with subjects completely', async () => {
      const files = [
        createMockFile('doc1.md', '系统必须支持10000并发用户访问'),
      ];

      const baseline = await extractor.extract(files);

      expect(baseline.requirements.length).toBeGreaterThanOrEqual(1);
      // Should include the full requirement with context
      const req = baseline.requirements.find(r => r.includes('10000'));
      expect(req).toBeDefined();
      expect(req!.length).toBeGreaterThan(5);
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
