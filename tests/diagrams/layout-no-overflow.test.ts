/**
 * 布局原则：容器和节点不溢出画布
 * 
 * 所有容器和节点的 x, y, x+w, y+h 都必须在 [0, width] 和 [0, height] 范围内
 */
import { describe, it, expect } from 'vitest';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

describe('容器和节点不溢出画布', () => {
  it('所有容器都在画布范围内', () => {
    const spec: DiagramSpec = {
      containers: [
        { id: 'layer1', label: '第一层', nodes: ['a', 'b'], crosscut: false },
        { id: 'layer2', label: '第二层', nodes: ['c', 'd'], crosscut: false },
      ],
      nodes: [
        { id: 'a', label: 'A', container: 'layer1' },
        { id: 'b', label: 'B', container: 'layer1' },
        { id: 'c', label: 'C', container: 'layer2' },
        { id: 'd', label: 'D', container: 'layer2' },
      ],
      edges: [
        { from: 'a', to: 'c', label: '', style: 'solid', direction: 'forward' },
        { from: 'b', to: 'd', label: '', style: 'solid', direction: 'forward' },
      ],
    };

    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '测试图');

    // 检查所有容器
    for (const c of result.containers) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(result.width);
      expect(c.y + c.h).toBeLessThanOrEqual(result.height);
    }

    // 检查所有节点
    for (const n of result.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(result.width);
      expect(n.y + n.h).toBeLessThanOrEqual(result.height);
    }
  });

  it('宽节点不会溢出画布', () => {
    const spec: DiagramSpec = {
      containers: [
        { id: 'layer1', label: '第一层', nodes: ['a'], crosscut: false },
      ],
      nodes: [
        { id: 'a', label: '这是一个非常非常长的标签，可能会导致节点宽度超出画布', container: 'layer1' },
      ],
      edges: [],
    };

    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '测试图');

    // 检查节点
    const node = result.nodes[0];
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.x + node.w).toBeLessThanOrEqual(result.width);

    // 检查容器
    const container = result.containers[0];
    expect(container.x).toBeGreaterThanOrEqual(0);
    expect(container.x + container.w).toBeLessThanOrEqual(result.width);
  });
});
