import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramPipeline } from '../../src/diagrams/pipeline.js';

/**
 * 管线必须走**新的布局引擎**（不是旧的 generateSVG）
 *
 * 背景：新引擎（src/diagrams/layout/）在真实数据上把画布从最高 4290px 压到
 * 727px、高宽比从 8.0 降到 1.43、字号全部可读，但一直**没接进管线** ——
 * 属于"两个引擎并存、新的没人调"，用户实际拿到的图仍然是坏的。
 *
 * 本文件锁的是"管线确实用了新引擎"这一层**行为**，不绑渲染器内部标记：
 *   · 画布宽 ≤ 684（知识库 layout.md 的可读性上限，由 字号/画布宽 ≥1.9% 推出）
 *   · 高宽比 ≤ 1.5（保证 ≤1 页，不拆图）
 *   · 容器渲染成虚线框、high_weight 节点明显更高
 *   · 层数再多也**压缩**，不拆成多张
 */

const TEST_DIR = join(process.cwd(), '.test-pipeline-layout');

const STYLE = JSON.stringify({
  colorScheme: 'warm',
  nodeShape: 'rounded',
  layoutDirection: 'top-to-bottom',
  fontSize: 'normal',
  customColors: null,
});

/** 两层容器 + 一个 high_weight 节点 */
const STRUCTURED = `<!-- diagram-start
type: flow
title: 故障处置与时限控制
description: |
  展示故障从触发到关闭的标准路径。
containers:
  - id: trigger
    label: 触发入口
    nodes: [entry_monitor, entry_manual]
  - id: main
    label: 主流程
    nodes: [s1_accept, s2_grade, s3_handle]
nodes:
  - id: entry_monitor
    label: 监控告警自动派单
    container: trigger
  - id: entry_manual
    label: 人工报修
    container: trigger
  - id: s1_accept
    label: ① 受理登记
    container: main
  - id: s2_grade
    label: ② 分级判定
    container: main
    high_weight: true
  - id: s3_handle
    label: ③ 处置并记录
    container: main
edges:
  - from: entry_monitor
    to: s1_accept
    label: 自动派单
  - from: entry_manual
    to: s1_accept
  - from: s1_accept
    to: s2_grade
  - from: s2_grade
    to: s3_handle
diagram-end -->`;

/** 8 层、每层 3 个节点 —— 旧渲染器会拉成一张很高的图 */
const TALL = (() => {
  const nodes: string[] = [];
  const edges: string[] = [];
  const containers: string[] = [];
  for (let layer = 0; layer < 8; layer++) {
    const ids = [0, 1, 2].map(i => `n${layer}_${i}`);
    containers.push(`  - id: c${layer}\n    label: 第 ${layer + 1} 阶段\n    nodes: [${ids.join(', ')}]`);
    for (let i = 0; i < 3; i++) {
      nodes.push(`  - id: ${ids[i]}\n    label: 第${layer + 1}层第${i + 1}项业务节点的名称\n    container: c${layer}`);
      if (layer > 0) edges.push(`  - from: n${layer - 1}_${i}\n    to: ${ids[i]}`);
    }
  }
  return `<!-- diagram-start
type: flow
title: 多层流程
containers:
${containers.join('\n')}
nodes:
${nodes.join('\n')}
edges:
${edges.join('\n')}
diagram-end -->`;
})();

/** 散文格式（回退路径，必须仍然能出图） */
const PROSE = `<!-- diagram-start
type: architecture
title: 三层架构
description: |
  三层架构：
  - 客户端层：Web 浏览器、移动端 App
  - 服务层：API Gateway、用户服务
  连接关系：
  - 客户端 → API Gateway（HTTP/HTTPS）
diagram-end -->`;

async function render(content: string): Promise<string> {
  mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'assets', 'diagram-style.json'), STYLE);
  writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch006-v1.md'), `# 第 6 章\n\n${content}\n`, 'utf-8');

  const pipeline = new DiagramPipeline(TEST_DIR);
  await pipeline.run({ skipPng: true, skipValidation: true });
  return readFileSync(join(TEST_DIR, 'figures', 'ch006-fig1.svg'), 'utf-8');
}

function sizeOf(svg: string): { width: number; height: number } {
  const w = svg.match(/<svg[^>]*width="([\d.]+)"/);
  const h = svg.match(/<svg[^>]*height="([\d.]+)"/);
  return { width: Number(w?.[1] ?? 0), height: Number(h?.[1] ?? 0) };
}

function dataIds(svg: string, attr: string): string[] {
  return Array.from(svg.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))).map(m => m[1]);
}

describe('管线走新布局引擎（画布契约）', () => {
  let svg: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    svg = await render(STRUCTURED);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('画布宽度不超过可读性上限 684', () => {
    expect(sizeOf(svg).width).toBeLessThanOrEqual(684);
  });

  it('高宽比不超过 1.5（保证单页，不拆图）', () => {
    const { width, height } = sizeOf(svg);
    expect(height / width).toBeLessThanOrEqual(1.5);
  });

  it('节点用 data-node-id 标记，数量与结构化块一致', () => {
    expect(dataIds(svg, 'data-node-id').sort()).toEqual(
      ['entry_manual', 'entry_monitor', 's1_accept', 's2_grade', 's3_handle'].sort(),
    );
  });

  it('连线用 data-edge-from/to 标记，数量与 edges 一致', () => {
    expect(dataIds(svg, 'data-edge-from')).toHaveLength(4);
  });

  it('容器渲染成虚线框（含容器标签）', () => {
    expect(svg).toContain('stroke-dasharray');
    const texts = Array.from(svg.matchAll(/>([^<>]+)<\/text>/g)).map(m => m[1]);
    expect(texts).toContain('触发入口');
    expect(texts).toContain('主流程');
  });

  it('high_weight 节点比同级节点更高（权重可视化）', () => {
    const heights = Array.from(svg.matchAll(/data-node-id="([^"]+)"[^>]*data-node-h="([\d.]+)"/g))
      .map(m => ({ id: m[1], h: Number(m[2]) }));
    const byId = new Map(heights.map(x => [x.id, x.h]));
    expect(byId.get('s2_grade')!).toBeGreaterThan(byId.get('s1_accept')!);
  });

  it('正交路由：所有折线只有水平段和竖直段', () => {
    const polylines = Array.from(svg.matchAll(/<polyline\b[^>]*\bpoints="([^"]+)"/g)).map(m => m[1]);
    expect(polylines.length).toBeGreaterThan(0);
    for (const raw of polylines) {
      const pts = raw.trim().split(/\s+/).map(p => p.split(',').map(Number));
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i][0] - pts[i - 1][0]);
        const dy = Math.abs(pts[i][1] - pts[i - 1][1]);
        expect(dx < 0.5 || dy < 0.5, `线段既非水平也非竖直: ${raw}`).toBe(true);
      }
    }
  });
});

describe('管线走新布局引擎（压缩而非拆图）', () => {
  let svg: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    svg = await render(TALL);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('8 层 24 个节点仍然是一张图（不拆）', () => {
    expect(dataIds(svg, 'data-node-id')).toHaveLength(24);
  });

  it('仍然满足宽 ≤684 且高宽比 ≤1.5', () => {
    const { width, height } = sizeOf(svg);
    console.log(`Width: ${width}, Height: ${height}, Ratio: ${(height / width).toFixed(4)}`);
    expect(width).toBeLessThanOrEqual(684);
    expect(height / width).toBeLessThanOrEqual(1.5);
  });
});

describe('管线走新布局引擎（散文回退不回归）', () => {
  let svg: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    svg = await render(PROSE);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('散文里的层名单仍然被解析成节点', () => {
    const texts = Array.from(svg.matchAll(/>([^<>]+)<\/text>/g)).map(m => m[1]);
    expect(texts).toContain('客户端层');
    expect(texts).toContain('服务层');
  });

  it('散文里的连接关系仍然被解析成边', () => {
    expect(dataIds(svg, 'data-edge-from').length).toBeGreaterThanOrEqual(1);
  });

  it('散文路径同样满足画布契约', () => {
    expect(sizeOf(svg).width).toBeLessThanOrEqual(684);
  });
});
