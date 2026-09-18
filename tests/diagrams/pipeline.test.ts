/**
 * Tests for diagram pipeline
 * 
 * 完整的图表生成管线：提取 → 解析 → SVG → PNG → 验证。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DiagramPipeline,
  type PipelineOptions,
  type PipelineResult,
} from '../../src/diagrams/pipeline.js';

const TEST_DIR = join(process.cwd(), '.test-diagram-pipeline');

describe('DiagramPipeline', () => {
  let pipeline: DiagramPipeline;

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });

    // 创建默认风格配置
    writeFileSync(
      join(TEST_DIR, 'assets', 'diagram-style.json'),
      JSON.stringify({
        colorScheme: 'warm',
        nodeShape: 'rounded',
        layoutDirection: 'top-to-bottom',
        fontSize: 'normal',
        customColors: null,
      })
    );

    pipeline = new DiagramPipeline(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('extractDiagrams', () => {
    it('extracts diagrams from chapter files', () => {
      const chapterContent = `
# 系统架构

本系统采用三层架构。

<!-- diagram-start
type: architecture
title: 系统整体架构
description: |
  三层架构：
  - 客户端层
  - 服务层
  - 数据层
diagram-end -->

从架构图可以看出...
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      const diagrams = pipeline.extractDiagrams();

      expect(diagrams).toHaveLength(1);
      expect(diagrams[0].chapterId).toBe('ch01');
      expect(diagrams[0].type).toBe('architecture');
      expect(diagrams[0].title).toBe('系统整体架构');
    });

    it('extracts multiple diagrams from multiple chapters', () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), `
# 第一章
<!-- diagram-start
type: flow
title: 流程图
description: |
  步骤 A → 步骤 B
diagram-end -->
`);
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch02-v1.md'), `
# 第二章
<!-- diagram-start
type: architecture
title: 架构图
description: |
  模块 A + 模块 B
diagram-end -->
`);

      const diagrams = pipeline.extractDiagrams();

      expect(diagrams).toHaveLength(2);
    });

    it('returns empty array when no diagrams', () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), `
# 纯文字章节
没有任何图表。
`);

      const diagrams = pipeline.extractDiagrams();
      expect(diagrams).toHaveLength(0);
    });

    it('extracts mermaid code blocks (backward compatibility)', () => {
      const chapterContent = `
# 系统架构

\`\`\`mermaid
graph TD
    A[客户端] --> B[API网关]
    B --> C[微服务]
\`\`\`
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      const diagrams = pipeline.extractDiagrams();

      expect(diagrams).toHaveLength(1);
      expect(diagrams[0].format).toBe('mermaid');
      expect(diagrams[0].description).toContain('graph TD');
    });

    it('extracts both diagram-start and mermaid blocks', () => {
      const chapterContent = `
# 系统架构

<!-- diagram-start
type: architecture
title: 架构图
description: |
  模块 A
diagram-end -->

\`\`\`mermaid
graph TD
    A --> B
\`\`\`
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      const diagrams = pipeline.extractDiagrams();

      expect(diagrams).toHaveLength(2);
      expect(diagrams[0].format).toBe('unknown'); // diagram-start 格式
      expect(diagrams[1].format).toBe('mermaid');
    });
  });

  describe('run', () => {
    it('generates SVG and PNG for each diagram', async () => {
      const chapterContent = `
# 系统架构

<!-- diagram-start
type: architecture
title: 系统架构
description: |
  客户端 → 服务器 → 数据库
diagram-end -->
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      const result = await pipeline.run();

      expect(result.total).toBe(1);
      expect(result.generated).toBe(1);
      expect(result.errors).toHaveLength(0);

      // 检查文件是否生成
      expect(existsSync(join(TEST_DIR, 'figures', 'ch01-fig1.svg'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'figures', 'ch01-fig1.png'))).toBe(true);
    });

    it('skips cached diagrams', async () => {
      const chapterContent = `
<!-- diagram-start
type: flow
title: 流程图
description: |
  A → B
diagram-end -->
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      // 第一次运行
      const result1 = await pipeline.run();
      expect(result1.generated).toBe(1);

      // 第二次运行（应该跳过缓存）
      const result2 = await pipeline.run();
      expect(result2.skipped).toBe(1);
      expect(result2.generated).toBe(0);
    });

    it('regenerates when content changes', async () => {
      const content1 = `
<!-- diagram-start
type: flow
title: 流程图 v1
description: |
  A → B
diagram-end -->
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), content1);

      // 第一次运行
      await pipeline.run();

      // 修改内容
      const content2 = `
<!-- diagram-start
type: flow
title: 流程图 v2
description: |
  A → B → C
diagram-end -->
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), content2);

      // 第二次运行（应该重新生成）
      const result = await pipeline.run();
      expect(result.generated).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('saves manifest after generation', async () => {
      const chapterContent = `
<!-- diagram-start
type: architecture
title: 架构图
description: |
  模块 A
diagram-end -->
`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), chapterContent);

      await pipeline.run();

      // 检查 manifest 文件
      const manifestPath = join(TEST_DIR, 'figures', 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest['ch01-fig1']).toBeDefined();
      expect(manifest['ch01-fig1'].svgFile).toBe('ch01-fig1.svg');
      expect(manifest['ch01-fig1'].pngFile).toBe('ch01-fig1.png');
    });

    it('returns empty result when no diagrams', async () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch01-v1.md'), `
# 纯文字
没有图表。
`);

      const result = await pipeline.run();

      expect(result.total).toBe(0);
      expect(result.generated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
