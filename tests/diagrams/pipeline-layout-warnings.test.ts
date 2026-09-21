import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramPipeline } from '../../src/diagrams/pipeline.js';

// Mock layoutDiagram 让它返回 warnings ✓
vi.mock('../../src/diagrams/layout/index.js', () => ({
  layoutDiagram: vi.fn(() => ({
    svg: '<svg width="100" height="100"></svg>',
    width: 100,
    height: 100,
    nodes: [],
    edges: [],
    warnings: ['画布 100x100 超出页面框 680x900', '字号占宽比 1.50% 低于可读线'],
    metrics: { fontSize: 13, margin: 20, layerGap: 15, rowGap: 10, paddingX: 8 },
  })),
}));

/**
 * 管线必须把布局引擎的 warnings 传播到输出 ✓
 *
 * 背景：layoutDiagram() 返回 { svg, width, height, warnings, ... }，
 * 但 pipeline.ts 只取了 svg/width/height，warnings 被静默丢弃 ✗。
 * 结果：引擎发现的"超页面框""字号不可读"等问题，用户完全看不到 ✗。
 *
 * 本测试锁的是：layout warnings 必须出现在 result.warnings 里 ✓。
 */

const TEST_DIR = join(process.cwd(), '.test-pipeline-layout-warnings');

const STYLE = JSON.stringify({
  colorScheme: 'warm',
  nodeShape: 'rounded',
  layoutDirection: 'top-to-bottom',
  fontSize: 'normal',
  customColors: null,
});

/** 一个简单的图（mock 会返回 warnings ✓） */
const SIMPLE_DIAGRAM = `<!-- diagram-start
type: flow
title: 测试图
nodes:
  - id: n01
    label: 节点1
  - id: n02
    label: 节点2
edges:
  - from: n01
    to: n02
diagram-end -->`;

const CHAPTER_MD = `# 测试章节

一些正文。

${SIMPLE_DIAGRAM}
`;

describe('pipeline 必须传播布局引擎的 warnings', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'logs'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), CHAPTER_MD, 'utf-8');
    writeFileSync(join(TEST_DIR, 'assets', 'diagram-style.json'), STYLE, 'utf-8');
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('layout warnings 必须出现在 result.warnings 里', async () => {
    const pipeline = new DiagramPipeline(TEST_DIR);

    const result = await pipeline.run({ skipPng: true });

    // mock 返回了 warnings，管线必须传播它们 ✓
    expect(result.warnings.length).toBeGreaterThan(0);
    
    // 必须包含布局引擎的告警 ✓
    const layoutWarnings = result.warnings.flatMap(w => w.warnings);
    const hasLayoutWarning = layoutWarnings.some(
      w => w.includes('超出页面框') || w.includes('低于可读线')
    );
    expect(hasLayoutWarning).toBe(true);
  });
});
