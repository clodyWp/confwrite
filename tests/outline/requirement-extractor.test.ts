import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequirementExtractor } from '../../src/outline/requirement-extractor.js';
import type { Requirement } from '../../src/outline/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-requirement-extractor-test-'));
}

describe('RequirementExtractor', () => {
  let tempDir: string;
  let extractor: RequirementExtractor;

  beforeEach(() => {
    tempDir = createTempDir();
    extractor = new RequirementExtractor(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('extractFromDocument', () => {
    it('应该从文档中提取需求', async () => {
      const docContent = `
# 系统需求文档

## 功能需求
1. 系统需要支持用户登录功能
2. 系统需要支持数据导出功能
3. 系统需要支持报表生成

## 性能需求
1. 系统响应时间不超过2秒
2. 系统支持1000并发用户

## 安全需求
1. 系统需要支持HTTPS加密
2. 系统需要支持用户权限控制
`;
      const docPath = join(tempDir, 'requirements.md');
      writeFileSync(docPath, docContent, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements[0]).toHaveProperty('id');
      expect(requirements[0]).toHaveProperty('title');
      expect(requirements[0]).toHaveProperty('priority');
      expect(requirements[0]).toHaveProperty('source');
    });

    it('应该为每个需求生成唯一ID', async () => {
      const docContent = `
# 需求文档
1. 需求A
2. 需求B
3. 需求C
`;
      const docPath = join(tempDir, 'requirements.md');
      writeFileSync(docPath, docContent, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      const ids = requirements.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('应该记录需求来源', async () => {
      const docContent = `
# 需求文档
1. 需求A
`;
      const docPath = join(tempDir, 'requirements.md');
      writeFileSync(docPath, docContent, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      expect(requirements[0].source).toContain('requirements.md');
    });
  });

  describe('generateStatistics', () => {
    it('应该生成需求统计信息', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
        },
        {
          id: 'REQ-003',
          title: '性能优化',
          priority: 'high',
          source: 'doc2.md',
        },
      ];

      const stats = extractor.generateStatistics(requirements);

      expect(stats.total).toBe(3);
      expect(stats.byPriority.high).toBe(2);
      expect(stats.byPriority.medium).toBe(1);
    });

    it('应该检查需求完整性', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
        },
      ];

      const stats = extractor.generateStatistics(requirements);

      expect(stats.completeness.warnings.length).toBeGreaterThan(0);
    });

    it('应该在需求完整时不产生警告', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
        {
          id: 'REQ-002',
          title: '性能要求',
          priority: 'high',
          source: 'doc1.md',
          category: 'performance',
        },
        {
          id: 'REQ-003',
          title: '安全要求',
          priority: 'high',
          source: 'doc1.md',
          category: 'security',
        },
        {
          id: 'REQ-004',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          category: 'functional',
        },
        {
          id: 'REQ-005',
          title: '界面友好',
          priority: 'medium',
          source: 'doc1.md',
          category: 'usability',
        },
      ];

      const stats = extractor.generateStatistics(requirements);

      expect(stats.completeness.warnings.length).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('应该生成需求提取报告', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
      ];

      const stats = extractor.generateStatistics(requirements);
      const report = extractor.generateReport(requirements, stats);

      expect(report).toContain('需求提取报告');
      expect(report).toContain('REQ-001');
      expect(report).toContain('用户登录');
    });

    it('应该在报告中包含统计信息', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '需求1',
          priority: 'high',
          source: 'doc1.md',
        },
        {
          id: 'REQ-002',
          title: '需求2',
          priority: 'medium',
          source: 'doc1.md',
        },
      ];

      const stats = extractor.generateStatistics(requirements);
      const report = extractor.generateReport(requirements, stats);

      expect(report).toContain('总计');
      expect(report).toContain('2');
    });

    it('应该在报告中包含完整性警告', () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '需求1',
          priority: 'high',
          source: 'doc1.md',
        },
      ];

      const stats = extractor.generateStatistics(requirements);
      const report = extractor.generateReport(requirements, stats);

      expect(report).toContain('警告');
    });
  });
});
