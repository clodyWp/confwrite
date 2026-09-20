/**
 * 正交连线路由
 *
 * 用户明确要求：**保持横平竖直**，不要 mermaid 那种弧线/斜线。
 * 所以这里只产出「水平段 + 垂直段」组成的折线，永远不出现斜线。
 *
 * 三种情形：
 *   1. 相邻层、同列          → 一条竖直直线
 *   2. 相邻层、不同列        → Z 型折线（下 → 横 → 下）
 *   3. 同层内 / 反向（往后指）→ 从侧边或下方的通道绕行
 *
 * 横向通道走"层间留白"（layerGap 就是为此预留的），
 * 这样连线不会穿过节点。
 */

import type { SpecEdge } from '../structured-parser.js';

export interface Point {
  x: number;
  y: number;
}

/** 已落位的矩形 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoutedEdge {
  from: string;
  to: string;
  /** 折线顶点，相邻两点必在同一水平线或同一竖直线上 */
  points: Point[];
  label?: string;
  /** 标签锚点（放在水平段上，避免标签叠在竖直段上） */
  labelAt?: Point;
  style: 'solid' | 'dashed' | 'dotted';
  bidirectional: boolean;
}

export interface RouteOptions {
  /** 可供绕行的范围 */
  bounds: { left: number; right: number; top: number; bottom: number };
  /** 连线与节点边缘的间隙 */
  clearance?: number;
}

/** 矩形中心 */
export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** 折线是否全为正交段（供测试与自检使用） */
export function isOrthogonal(points: Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i].x - points[i - 1].x);
    const dy = Math.abs(points[i].y - points[i - 1].y);
    // 允许 1px 浮点误差；水平或垂直
    if (dx > 1 && dy > 1) return false;
  }
  return true;
}

/** 折线总长（用于挑选"最长段"放标签） */
function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 把标签放在最长的水平段中点；没有水平段时放在最长段中点 */
function labelAnchor(points: Point[]): Point | undefined {
  let bestHorizontal: { at: Point; length: number } | null = null;
  let best: { at: Point; length: number } | null = null;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const length = segmentLength(a, b);

    if (length > (best?.length ?? -1)) best = { at: mid, length };

    const horizontal = Math.abs(a.y - b.y) <= 1 && Math.abs(a.x - b.x) > 1;
    if (horizontal && length > (bestHorizontal?.length ?? -1)) {
      bestHorizontal = { at: mid, length };
    }
  }

  return (bestHorizontal ?? best)?.at;
}

/**
 * 路由所有连线
 *
 * 找不到端点的边会被跳过（调用方应已过滤，这里是防御）。
 */
export function routeEdges(
  boxes: Map<string, Box>,
  edges: SpecEdge[],
  options: RouteOptions,
): RoutedEdge[] {
  const clearance = options.clearance ?? 6;
  const { bounds } = options;
  const routed: RoutedEdge[] = [];

  for (const edge of edges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) continue;

    const fromBottom = { x: from.x + from.w / 2, y: from.y + from.h };
    const toTop = { x: to.x + to.w / 2, y: to.y };
    const fromCenter = centerOf(from);
    const toCenter = centerOf(to);

    let points: Point[];

    if (edge.from === edge.to) {
      // 自环：从右侧绕一圈回来
      const right = Math.min(bounds.right, from.x + from.w + clearance + 18);
      points = [
        { x: from.x + from.w, y: fromCenter.y },
        { x: right, y: fromCenter.y },
        { x: right, y: from.y + from.h / 2 - clearance - 6 },
        { x: from.x + from.w / 2, y: from.y + from.h / 2 - clearance - 6 },
        { x: from.x + from.w / 2, y: from.y },
      ];
    } else if (to.y > from.y + from.h) {
      // 正向：目标在下方
      const midY = Math.round((fromBottom.y + toTop.y) / 2);
      if (Math.abs(fromBottom.x - toTop.x) <= 1) {
        points = [fromBottom, toTop]; // 同列 → 一条竖直直线
      } else {
        // Z 型：下 → 横 → 下（全正交）
        points = [
          fromBottom,
          { x: fromBottom.x, y: midY },
          { x: toTop.x, y: midY },
          toTop,
        ];
      }
    } else if (Math.abs(fromCenter.y - toCenter.y) <= from.h / 2 + 1) {
      // 同层：从下方通道绕（层内折行留白就是为此预留的）
      const below = Math.min(
        bounds.bottom,
        Math.max(from.y + from.h, to.y + to.h) + clearance + 10,
      );
      points = [
        { x: fromCenter.x, y: from.y + from.h },
        { x: fromCenter.x, y: below },
        { x: toCenter.x, y: below },
        { x: toCenter.x, y: to.y + to.h },
      ];
    } else {
      // 反向（往后指）：从右侧通道绕回
      const right = Math.min(
        bounds.right,
        Math.max(from.x + from.w, to.x + to.w) + clearance + 12,
      );
      points = [
        { x: from.x + from.w, y: fromCenter.y },
        { x: right, y: fromCenter.y },
        { x: right, y: toCenter.y },
        { x: to.x + to.w, y: toCenter.y },
      ];
    }

    const anchor = labelAnchor(points);
    routed.push({
      from: edge.from,
      to: edge.to,
      points,
      style: edge.style,
      bidirectional: edge.direction === 'bidirectional',
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.label && anchor ? { labelAt: anchor } : {}),
    });
  }

  return routed;
}
