import { describe, it, expect } from 'vitest';
import { parseStructuredDiagram } from '../../src/diagrams/structured-parser.js';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';

/**
 * 回边不能穿过源节点或目标节点本身 ✓
 *
 * 背景：ch004-fig3（国产化适配映射关系）有 4 层容器，sql_adapt 在底层（y=377-422），
 * kingbase 在第二层（y=189-225）。边 sql_adapt->kingbase 从底部 (y=413) 出发，
 * 但要去的 kingbase 在上方，路径向上穿过了 sql_adapt 节点本身 ✗。
 *
 * 根因：`staircaseRoute` 硬编码从底部出发，没考虑"目标在上方"的情况。
 * 修复：根据目标位置调整起点和终点方向。
 *
 * 本测试锁的是：任何边的路径不能穿过 from/to 节点的内部（端点附近除外）✓。
 */

const SPEC = `<!-- diagram-start
type: relation
title: 国产化适配映射关系
containers:
  - id: base
    label: 开源基线
    nodes: [base_db, base_os, base_mw, base_cpu]
  - id: dom_sys
    label: 国产库与系统
    nodes: [dm, kingbase, kylin, uos]
  - id: dom_hw
    label: 国产中间件与芯片
    nodes: [tongweb, bes, kunpeng, phytium]
  - id: adapt
    label: 适配层
    nodes: [sql_adapt, mw_adapt, arch_adapt]
nodes:
  - id: base_db
    label: 开源关系库
    container: base
  - id: base_os
    label: 开源操作系统
    container: base
  - id: base_mw
    label: 开源中间件
    container: base
  - id: base_cpu
    label: x86 架构
    container: base
  - id: dm
    label: 达梦 DM8
    container: dom_sys
  - id: kingbase
    label: 金仓 V8
    container: dom_sys
  - id: kylin
    label: 银河麒麟 V10
    container: dom_sys
  - id: uos
    label: 统信 UOS V20
    container: dom_sys
  - id: tongweb
    label: 东方通 TongWeb
    container: dom_hw
  - id: bes
    label: 宝兰德 BES
    container: dom_hw
  - id: kunpeng
    label: 鲲鹏 920
    container: dom_hw
  - id: phytium
    label: 飞腾 S2500
    container: dom_hw
  - id: sql_adapt
    label: SQL 方言适配
    container: adapt
  - id: mw_adapt
    label: 中间件适配
    container: adapt
  - id: arch_adapt
    label: 双架构适配
    container: adapt
edges:
  - from: base_db
    to: sql_adapt
  - from: sql_adapt
    to: dm
  - from: sql_adapt
    to: kingbase
  - from: base_mw
    to: mw_adapt
  - from: mw_adapt
    to: tongweb
  - from: mw_adapt
    to: bes
  - from: base_cpu
    to: arch_adapt
  - from: arch_adapt
    to: kunpeng
  - from: arch_adapt
    to: phytium
  - from: base_os
    to: kylin
  - from: base_os
    to: uos
diagram-end -->`;

function segmentCrossesNodeInterior(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  node: { x: number; y: number; w: number; h: number },
  margin = 4,
): boolean {
  const left = node.x + margin;
  const right = node.x + node.w - margin;
  const top = node.y + margin;
  const bottom = node.y + node.h - margin;

  const steps = 20;
  for (let s = 2; s < steps - 1; s++) {
    const t = s / steps;
    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    if (x >= left && x <= right && y >= top && y <= bottom) {
      return true;
    }
  }
  return false;
}

describe('回边不能穿过源/目标节点本身', () => {
  it('任何边的路径不能穿过 from 或 to 节点的内部', () => {
    const spec = parseStructuredDiagram(SPEC);
    const result = layoutDiagram(spec, getDefaultDiagramStyle(), '国产化适配映射关系');

    const nodeMap = new Map(result.nodes.map(n => [n.id, n]));
    let selfCrossings = 0;

    for (const edge of result.edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const points = edge.points;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        if (segmentCrossesNodeInterior(p1, p2, fromNode)) {
          selfCrossings++;
          console.log(`  穿过 from 节点: ${edge.from} -> ${edge.to}`);
        }
        if (segmentCrossesNodeInterior(p1, p2, toNode)) {
          selfCrossings++;
          console.log(`  穿过 to 节点: ${edge.from} -> ${edge.to}`);
        }
      }
    }

    expect(selfCrossings).toBe(0);
  });
});
