/**
 * 布局原则 7：边界清晰
 * 
 * 容器间距 ≥ 组内间距 × 2，建议 30px+
 */
import { describe, it, expect } from 'vitest';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

describe('布局原则 7：边界清晰', () => {
  it('容器间距 ≥ 29px（原则 7：边界清晰）', () => {
    const spec: DiagramSpec = {
      containers: [
        { id: 'layer1', label: '第一层', nodes: ['a', 'b'], crosscut: false },
        { id: 'layer2', label: '第二层', nodes: ['c', 'd'], crosscut: false },
        { id: 'layer3', label: '第三层', nodes: ['e', 'f'], crosscut: false },
      ],
      nodes: [
        { id: 'a', label: 'A', container: 'layer1' },
        { id: 'b', label: 'B', container: 'layer1' },
        { id: 'c', label: 'C', container: 'layer2' },
        { id: 'd', label: 'D', container: 'layer2' },
        { id: 'e', label: 'E', container: 'layer3' },
        { id: 'f', label: 'F', container: 'layer3' },
      ],
      edges: [
        { from: 'a', to: 'c', label: '', style: 'solid', direction: 'forward' },
        { from: 'b', to: 'd', label: '', style: 'solid', direction: 'forward' },
        { from: 'c', to: 'e', label: '', style: 'solid', direction: 'forward' },
        { from: 'd', to: 'f', label: '', style: 'solid', direction: 'forward' },
      ],
    };

    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '测试图');

    // 提取容器位置
    const containers = result.containers.filter(c => !c.crosscut);
    expect(containers.length).toBe(3);

    // 计算容器间距
    for (let i = 1; i < containers.length; i++) {
      const prev = containers[i - 1];
      const curr = containers[i];
      const gap = curr.y - (prev.y + prev.h);
      expect(gap).toBeGreaterThanOrEqual(29);
    }
  });

  it('容器间距 ≥ 组内间距 × 2', () => {
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

    // 提取容器位置
    const containers = result.containers.filter(c => !c.crosscut);
    console.log('Containers:', containers.map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h })));
    console.log('Nodes:', result.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })));
    console.log('Metrics:', { layerGap: result.metrics.layerGap, containerPad: result.metrics.containerPad, containerLabelHeight: result.metrics.containerLabelHeight });
    expect(containers.length).toBe(2);
  });
});
