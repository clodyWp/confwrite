/**
 * 图的层分配与交叉计数
 *
 * 布局引擎的第一步。层序决定图的整体形状：层纵向堆叠，
 * **层数直接决定画布高度** —— 真机事故里画布高到 4290px，
 * 就是层数被脏数据撑到 30+ 的结果（详见 extractor 的事故注释）。
 *
 * 因此这里的原则是：**层数只反映真实的结构深度**，不掺任何噪声。
 *
 * 层序的两个来源：
 *   1. **容器顺序** —— 写手用 containers 标注了分组，容器天然就是分层
 *      （知识库原则 1「分组压缩」）
 *   2. **拓扑分层** —— 没有容器时（真机数据里 ch002–ch005 就是这种），
 *      按边的方向做最长路径分层：layer(v) = max(layer(u) + 1)
 *
 * 横切 / 贯穿型容器不属于任何一层（它横跨全程），单独拎出来 ——
 * 否则它下面的节点会被推后一层，图凭空变高。
 */

import type { DiagramSpec } from '../structured-parser.js';

/** 层号映射：节点 id → 层号（从 0 开始） */
export type LayerMap = Map<string, number>;

/**
 * 无容器时的拓扑分层（最长路径）
 *
 * 环不会死循环：Kahn 拓扑排序处理不到的节点（即在环上的节点）
 * 保持初始层号 0。对布局来说这是安全的退化 —— 环本来就无法线性分层。
 */
function topologicalLayers(spec: DiagramSpec): LayerMap {
  const layer: LayerMap = new Map();
  for (const node of spec.nodes) layer.set(node.id, 0);

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of spec.nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of spec.edges) {
    if (edge.from === edge.to) continue; // 自环不影响层号
    const out = adjacency.get(edge.from);
    if (!out || !layer.has(edge.to)) continue;
    out.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      // 最长路径：取所有前驱里最深的那个 +1
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(current) ?? 0) + 1));
      const remaining = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  return layer;
}

/**
 * 分配层号
 *
 * 有容器时以**容器顺序**为准（写手的分组就是分层）；
 * 否则按拓扑深度分层。
 *
 * 横切 / 贯穿型容器里的节点**不返回**（不参与层序），
 * 由布局引擎单独放到侧边条。
 */
export function assignLayers(spec: DiagramSpec): LayerMap {
  const hasContainers = spec.containers.some(c => !c.crosscut);

  if (!hasContainers) {
    // 没有容器：全部节点按拓扑分层
    return topologicalLayers(spec);
  }

  const layer: LayerMap = new Map();

  // 容器 → 层号（跳过横切容器）
  const layerOfContainer = new Map<string, number>();
  let index = 0;
  for (const container of spec.containers) {
    if (container.crosscut) continue;
    layerOfContainer.set(container.id, index);
    index++;
  }

  for (const node of spec.nodes) {
    if (isCrosscutNode(node, spec)) continue; // 横切节点不参与层序

    // 归属**以节点自己的 container 字段为准**；
    // 容器声明的 nodes 列表作为补充（兼容手写 spec 只给了其中一边）
    const containerId = node.container ?? spec.containers.find(c => c.nodes.includes(node.id))?.id;
    const assigned = containerId ? layerOfContainer.get(containerId) : undefined;

    // 没被任何容器认领的节点（写手漏标）：放到第 0 层，
    // 不让它变成 undefined 让下游各写各的默认值
    layer.set(node.id, assigned ?? 0);
  }

  return layer;
}

/** 该节点是否属于某个横切 / 贯穿型容器 */
function isCrosscutNode(node: { id: string; container?: string }, spec: DiagramSpec): boolean {
  return spec.containers.some(
    c => c.crosscut && (c.id === node.container || c.nodes.includes(node.id)),
  );
}

/** 参与交叉计数的边（同层内相邻的两层之间） */
export interface CrossableEdge {
  from: string;
  to: string;
}

/**
 * 相邻层之间的连线交叉数
 *
 * 用经典判据：同一对相邻层里，两条边 (u1→v1)、(u2→v2) 交叉
 * 当且仅当 u1 与 u2 的顺序和 v1 与 v2 的顺序相反。
 *
 * 跨多层的边不参与计数（它可能穿过中间层的节点区域，
 * 严格计数需要知道中间层的让位情况，属于后续增强）。
 */
export function countCrossings(layers: string[][], edges: CrossableEdge[]): number {
  const position = new Map<string, number>();
  const layerOf = new Map<string, number>();

  layers.forEach((nodes, layerIndex) => {
    nodes.forEach((id, i) => {
      position.set(id, i);
      layerOf.set(id, layerIndex);
    });
  });

  let crossings = 0;

  for (let i = 0; i < layers.length - 1; i++) {
    // 只取本层 → 下一层的边
    const between = edges.filter(
      e => layerOf.get(e.from) === i && layerOf.get(e.to) === i + 1,
    );

    for (let a = 0; a < between.length; a++) {
      for (let b = a + 1; b < between.length; b++) {
        const fromA = position.get(between[a].from)!;
        const toA = position.get(between[a].to)!;
        const fromB = position.get(between[b].from)!;
        const toB = position.get(between[b].to)!;

        // 顺序相反即交叉（相等说明共端点，不算交叉）
        if ((fromA - fromB) * (toA - toB) < 0) crossings++;
      }
    }
  }

  return crossings;
}
