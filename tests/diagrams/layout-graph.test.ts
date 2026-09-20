import { describe, it, expect } from 'vitest';
import { assignLayers, countCrossings } from '../../src/diagrams/layout/graph.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

/**
 * 图的层分配与交叉计数
 *
 * 这是布局引擎的第一步。层序决定了图的整体形状：
 * 层纵向堆叠 → 层数直接决定画布高度。真机事故里画布高到 4290px，
 * 就是因为层数被脏数据撑到 30+（详见 extractor 那个 description
 * 吞掉整块 YAML 的事故）。
 *
 * 层序有两个来源：
 *   1. **容器顺序** —— 写手用 containers 标注了分组，容器天然就是分层
 *      （知识库原则 1「分组压缩」）
 *   2. **拓扑分层** —— 没有容器时（真机数据里 ch002–ch005 就是这种），
 *      按边的方向做最长路径分层：layer(v) = max(layer(u)+1)
 *
 * 横切 / 贯穿型容器不属于任何一层，单独拎出来（不能混进层序，
 * 否则它下面的节点会被推后一层，图凭空变高）。
 */

const base = { containers: [], edges: [] };

describe('assignLayers', () => {
  describe('容器顺序优先', () => {
    it('容器顺序即层序', () => {
      const spec: DiagramSpec = {
        ...base,
        containers: [
          { id: 'a', label: 'A', nodes: ['a1', 'a2'] },
          { id: 'b', label: 'B', nodes: ['b1'] },
          { id: 'c', label: 'C', nodes: ['c1'] },
        ],
        nodes: [
          { id: 'a1', label: 'a1' }, { id: 'a2', label: 'a2' },
          { id: 'b1', label: 'b1' },
          { id: 'c1', label: 'c1' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a1')).toBe(0);
      expect(layers.get('a2')).toBe(0);
      expect(layers.get('b1')).toBe(1);
      expect(layers.get('c1')).toBe(2);
    });

    it('横切容器不占层，其节点不推高总层数', () => {
      const spec: DiagramSpec = {
        ...base,
        containers: [
          { id: 'a', label: 'A', nodes: ['a1'] },
          { id: 'cross', label: '贯穿动作', nodes: ['x1'], crosscut: true },
          { id: 'b', label: 'B', nodes: ['b1'] },
        ],
        nodes: [
          { id: 'a1', label: 'a1' }, { id: 'x1', label: 'x1' }, { id: 'b1', label: 'b1' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a1')).toBe(0);
      expect(layers.get('b1')).toBe(1); // 不是 2
      expect(layers.get('x1')).toBeUndefined(); // 横切节点不参与层序
    });

    it('节点声明了 container 但容器没声明它 → 仍然按容器顺序分层', () => {
      const spec: DiagramSpec = {
        ...base,
        containers: [
          { id: 'a', label: 'A', nodes: [] },
          { id: 'b', label: 'B', nodes: [] },
        ],
        nodes: [
          { id: 'a1', label: 'a1', container: 'a' },
          { id: 'b1', label: 'b1', container: 'b' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a1')).toBe(0);
      expect(layers.get('b1')).toBe(1);
    });
  });

  describe('无容器时按拓扑分层', () => {
    it('链式结构逐层递进', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [
          { id: 'a', label: 'a' }, { id: 'b', label: 'b' }, { id: 'c', label: 'c' },
        ],
        edges: [
          { from: 'a', to: 'b', direction: 'forward', style: 'solid' },
          { from: 'b', to: 'c', direction: 'forward', style: 'solid' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a')).toBe(0);
      expect(layers.get('b')).toBe(1);
      expect(layers.get('c')).toBe(2);
    });

    it('分支汇合时取最长路径（不是最短）', () => {
      //   a → b → c
      //   a ─────→ c
      // c 必须在 b 之后，所以 layer(c) = 2 而不是 1
      const spec: DiagramSpec = {
        ...base,
        nodes: [
          { id: 'a', label: 'a' }, { id: 'b', label: 'b' }, { id: 'c', label: 'c' },
        ],
        edges: [
          { from: 'a', to: 'b', direction: 'forward', style: 'solid' },
          { from: 'b', to: 'c', direction: 'forward', style: 'solid' },
          { from: 'a', to: 'c', direction: 'forward', style: 'solid' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('c')).toBe(2);
    });

    it('并列的分支落在同一层', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [
          { id: 'a', label: 'a' }, { id: 'b1', label: 'b1' }, { id: 'b2', label: 'b2' },
        ],
        edges: [
          { from: 'a', to: 'b1', direction: 'forward', style: 'solid' },
          { from: 'a', to: 'b2', direction: 'forward', style: 'solid' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('b1')).toBe(1);
      expect(layers.get('b2')).toBe(1);
    });

    it('孤立节点落在第 0 层', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [{ id: 'lonely', label: 'lonely' }],
      };
      expect(assignLayers(spec).get('lonely')).toBe(0);
    });

    it('环不会导致死循环（取已收敛的值）', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
        edges: [
          { from: 'a', to: 'b', direction: 'forward', style: 'solid' },
          { from: 'b', to: 'a', direction: 'forward', style: 'solid' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a')).toBeDefined();
      expect(layers.get('b')).toBeDefined();
    });

    it('自环不影响层号', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
        edges: [
          { from: 'a', to: 'a', direction: 'forward', style: 'solid' },
          { from: 'a', to: 'b', direction: 'forward', style: 'solid' },
        ],
      };
      const layers = assignLayers(spec);
      expect(layers.get('a')).toBe(0);
      expect(layers.get('b')).toBe(1);
    });
  });

  describe('层数上限（知识库：架构图 ≤5，流程图 ≤8）', () => {
    it('返回层数便于调用方判断是否需要折行', () => {
      const spec: DiagramSpec = {
        ...base,
        nodes: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }],
        edges: [{ from: 'a', to: 'b', direction: 'forward', style: 'solid' }],
      };
      const layers = assignLayers(spec);
      expect(Math.max(...layers.values()) + 1).toBe(2);
    });
  });
});

describe('countCrossings', () => {
  it('没有交叉时返回 0', () => {
    const layers = [
      ['a1', 'a2'],
      ['b1', 'b2'],
    ];
    const edges = [
      { from: 'a1', to: 'b1' },
      { from: 'a2', to: 'b2' },
    ];
    expect(countCrossings(layers, edges)).toBe(0);
  });

  it('交叉的连线返回 1', () => {
    const layers = [
      ['a1', 'a2'],
      ['b1', 'b2'],
    ];
    const edges = [
      { from: 'a1', to: 'b2' },
      { from: 'a2', to: 'b1' },
    ];
    expect(countCrossings(layers, edges)).toBe(1);
  });

  it('三条互相交叉的连线返回 3', () => {
    const layers = [
      ['a1', 'a2', 'a3'],
      ['b1', 'b2', 'b3'],
    ];
    const edges = [
      { from: 'a1', to: 'b3' },
      { from: 'a2', to: 'b2' },
      { from: 'a3', to: 'b1' },
    ];
    expect(countCrossings(layers, edges)).toBe(3);
  });

  it('同一节点扇出的多条线不算交叉', () => {
    const layers = [['a'], ['b1', 'b2', 'b3']];
    const edges = [
      { from: 'a', to: 'b1' },
      { from: 'a', to: 'b2' },
      { from: 'a', to: 'b3' },
    ];
    expect(countCrossings(layers, edges)).toBe(0);
  });

  it('跨多层的边不参与相邻层交叉计数（不抛错）', () => {
    const layers = [['a'], ['b'], ['c']];
    const edges = [{ from: 'a', to: 'c' }];
    expect(countCrossings(layers, edges)).toBe(0);
  });
});
