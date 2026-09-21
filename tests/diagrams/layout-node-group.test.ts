import { describe, it, expect } from 'vitest';
import { renderSvg } from '../../src/diagrams/layout/render.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';
import type { LayoutResult } from '../../src/diagrams/layout/index.js';

/**
 * `data-node-id` 分组必须包住节点的标签文字 ✓
 *
 * 背景：render.ts 里 `<g data-node-id="...">` 只包了 `<rect>` ✓，
 * `<text>` 在组外面 ✗。结果：任何想按节点分析 SVG 的工具（比如质量审计 ✓）
 * 都无法把标签和节点关联起来 ✗。
 *
 * 本测试锁的是：每个 `data-node-id` 组必须包含对应的 `<text>` ✓。
 */

describe('data-node-id 分组必须包住标签', () => {
  it('每个节点组包含对应的 text 元素', () => {
    const input: LayoutResult = {
      svg: '',
      width: 200,
      height: 100,
      nodes: [
        { id: 'node1', label: ['标签一'], layer: 0, x: 10, y: 10, w: 80, h: 30, highWeight: false },
        { id: 'node2', label: ['标签二'], layer: 1, x: 100, y: 10, w: 80, h: 30, highWeight: false },
      ],
      edges: [],
      containers: [],
      warnings: [],
      metrics: { fontSize: 13, margin: 10, layerGap: 20, rowGap: 10, paddingX: 8 },
    };

    const svg = renderSvg({ ...input, title: '测试', style: getDefaultDiagramStyle() });

    // 每个 data-node-id 组必须包含 <text> ✓
    const nodeGroups = svg.match(/<g data-node-id="[^"]+"[\s\S]*?<\/g>/g) || [];
    expect(nodeGroups.length).toBe(2);

    for (const group of nodeGroups) {
      expect(group).toContain('<text');
    }

    // 而且 text 的内容必须匹配节点标签 ✓
    expect(svg).toMatch(/data-node-id="node1"[\s\S]*?<\/g>/);
    const node1Group = svg.match(/data-node-id="node1"[\s\S]*?<\/g>/)?.[0];
    expect(node1Group).toContain('标签一');
  });
});
