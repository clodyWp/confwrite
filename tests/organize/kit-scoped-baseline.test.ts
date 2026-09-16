import { describe, it, expect } from 'vitest';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';
import type { MaterialFile } from '../../src/organize/scanner.js';

function makeFile(filename: string, category: string, keywords: string[]): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/test/${filename}`,
    format: 'markdown',
    size: 100,
    title: filename,
    keywords,
    summary: 'test summary',
    category,
  };
}

function makeMapping(chapterId: string, files: MaterialFile[]): ChapterMapping {
  return {
    chapterId,
    title: `Chapter ${chapterId}`,
    relatedFiles: files,
    relatedCategories: [...new Set(files.map(f => f.category))],
    relatedKeywords: [...new Set(files.flatMap(f => f.keywords))],
  };
}

function makeBaseline(): DataBaseline {
  return {
    sourceFiles: 5,
    metrics: {
      '系统可用性': '99.9%',
      '响应时间': '100ms',
      '并发用户数': '10000',
      '数据存储': '10TB',
      'API调用频率': '5000次/秒',
    },
    timeline: {
      '项目启动': '2024-01',
      '上线时间': '2024-06',
    },
    technicalTerms: ['Kubernetes', 'Redis', 'PostgreSQL', 'Kafka', 'Nginx'],
    requirements: [
      '必须支持高可用部署',
      '需要支持水平扩展',
      '满足等保三级要求',
      '支持多租户隔离',
      '确保数据加密存储',
    ],
    generatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('KitGenerator — scoped baseline', () => {
  const generator = new KitGenerator();

  it('only includes metrics related to chapter keywords', () => {
    const files = [makeFile('perf-spec.md', '性能', ['性能', '响应', '并发'])];
    const mapping = makeMapping('ch001', files);
    const baseline = makeBaseline();

    const content = generator.generate(mapping, baseline);

    // Should include performance-related metrics
    expect(content).toContain('100ms');
    expect(content).toContain('10000');
    // Should NOT include unrelated metrics
    expect(content).not.toContain('10TB');
    expect(content).not.toContain('5000次/秒');
  });

  it('only includes terms related to chapter keywords', () => {
    const files = [makeFile('arch-spec.md', '架构', ['Kubernetes', 'Nginx', '部署'])];
    const mapping = makeMapping('ch002', files);
    const baseline = makeBaseline();

    const content = generator.generate(mapping, baseline);

    // Should include architecture-related terms
    expect(content).toContain('Kubernetes');
    expect(content).toContain('Nginx');
    // Should NOT include data-layer terms
    expect(content).not.toContain('PostgreSQL');
    expect(content).not.toContain('Kafka');
  });

  it('only includes requirements related to chapter keywords', () => {
    const files = [makeFile('security-spec.md', '安全', ['安全', '加密', '等保'])];
    const mapping = makeMapping('ch003', files);
    const baseline = makeBaseline();

    const content = generator.generate(mapping, baseline);

    expect(content).toContain('等保三级');
    expect(content).toContain('数据加密');
    expect(content).not.toContain('多租户');
    expect(content).not.toContain('水平扩展');
  });

  it('falls back to full baseline when no related files', () => {
    const mapping = makeMapping('ch004', []);
    const baseline = makeBaseline();

    const content = generator.generate(mapping, baseline);

    // Should include everything
    expect(content).toContain('99.9%');
    expect(content).toContain('10TB');
    expect(content).toContain('Kubernetes');
    expect(content).toContain('PostgreSQL');
  });

  it('generateBatch produces different baselines for different chapters', () => {
    const mappings = [
      makeMapping('ch001', [makeFile('perf.md', '性能', ['性能', '响应'])]),
      makeMapping('ch002', [makeFile('storage.md', '存储', ['存储', '数据'])]),
    ];
    const baseline = makeBaseline();

    const content1 = generator.generate(mappings[0], baseline);
    const content2 = generator.generate(mappings[1], baseline);

    // ch001 should have perf metrics, ch002 should have storage metrics
    expect(content1).toContain('100ms');
    expect(content2).toContain('10TB');
  });
});
