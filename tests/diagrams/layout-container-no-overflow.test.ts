/**
 * 布局原则：容器不溢出画布
 * 
 * 所有容器的 x, y, x+w, y+h 都必须在画布范围内
 */
import { describe, it, expect } from 'vitest';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

describe('容器不溢出画布', () => {
  it('容器右边界不超出画布', () => {
    const spec: DiagramSpec = {
      containers: [
        { id: 'layer1', label: '第一层', nodes: ['a', 'b', 'c'], crosscut: false },
      ],
      nodes: [
        { id: 'a', label: '节点A', container: 'layer1' },
        { id: 'b', label: '节点B', container: 'layer1' },
        { id: 'c', label: '节点C', container: 'layer1' },
      ],
      edges: [],
    };

    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '测试图');

    // 检查所有容器
    for (const c of result.containers) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(result.width);
    }
  });

  it('容器下边界不超出画布', () => {
    const spec: DiagramSpec = {
      containers: [
        { id: 'layer1', label: '第一层', nodes: ['a'], crosscut: false },
        { id: 'layer2', label: '第二层', nodes: ['b'], crosscut: false },
        { id: 'layer3', label: '第三层', nodes: ['c'], crosscut: false },
        { id: 'layer4', label: '第四层', nodes: ['d'], crosscut: false },
        { id: 'layer5', label: '第五层', nodes: ['e'], crosscut: false },
        { id: 'layer6', label: '第六层', nodes: ['f'], crosscut: false },
      ],
      nodes: [
        { id: 'a', label: 'A', container: 'layer1' },
        { id: 'b', label: 'B', container: 'layer2' },
        { id: 'c', label: 'C', container: 'layer3' },
        { id: 'd', label: 'D', container: 'layer4' },
        { id: 'e', label: 'E', container: 'layer5' },
        { id: 'f', label: 'F', container: 'layer6' },
      ],
      edges: [
        { from: 'a', to: 'b', label: '', style: 'solid', direction: 'forward' },
        { from: 'b', to: 'c', label: '', style: 'solid', direction: 'forward' },
        { from: 'c', to: 'd', label: '', style: 'solid', direction: 'forward' },
        { from: 'd', to: 'e', label: '', style: 'solid', direction: 'forward' },
        { from: 'e', to: 'f', label: '', style: 'solid', direction: 'forward' },
      ],
    };

    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '测试图');

    // 检查所有容器
    for (const c of result.containers) {
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y + c.h).toBeLessThanOrEqual(result.height);
    }
  });
});
