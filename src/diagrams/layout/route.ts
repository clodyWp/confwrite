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
 * 两个真机事故（都已修）：
 *   · 绕行通道按"两个端点框的右侧"取，没避开中间的节点 ——
 *     实测 polyline 312,95→312,187 直接穿过节点 (264,111,96x36)。
 *     现在绕行通道会逐格试探，直到找出一条不与任何节点框相交的通道。
 *   · 连线标签按线段中点居中，完全不管宽度 ——
 *     21 字的标签在 80px 宽的间隙里居中后跨 x=-35..195：
 *     左边出画布、右边压住节点。现在标签会**截断 + 多候选位置 + 避让**
 *     （既避节点框，也避已经放过标签的位置）。
 */

import { textWidth } from './metrics.js';
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
  /** 标签锚点 */
  labelAt?: Point;
  /** 标签对齐方式（竖直段旁的标签用 start，避免压线） */
  labelAnchor?: 'middle' | 'start';
  style: 'solid' | 'dashed' | 'dotted';
  bidirectional: boolean;
}

export interface RouteOptions {
  /** 可供绕行的范围 */
  bounds: { left: number; right: number; top: number; bottom: number };
  /** 连线与节点边缘的间隙 */
  clearance?: number;
  /** 连线标签的字号（由编排层传入最终字号，保证与渲染一致） */
  labelFontSize?: number;
}

/** 连线标签的宽度上限（超了就截断，避免长标签压住节点） */
const LABEL_MAX_WIDTH = 140;

/** 矩形中心 */
export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** 折线是否全为正交段（供测试与自检使用） */
export function isOrthogonal(points: Point[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i].x - points[i - 1].x);
    const dy = Math.abs(points[i].y - points[i - 1].y);
    if (dx > 1 && dy > 1) return false;
  }
  return true;
}

/** 两矩形是否相交（带容差） */
function intersects(a: Box, b: Box, tolerance = 1): boolean {
  return (
    a.x < b.x + b.w - tolerance &&
    b.x < a.x + a.w - tolerance &&
    a.y < b.y + b.h - tolerance &&
    b.y < a.y + a.h - tolerance
  );
}

/**
 * 整条路线是否不穿过任何节点框
 *
 * 只校验"通道那一段"是不够的（真机事故：绕到目标右侧后，
 * 横切入目标的最后一段又穿过了目标右边的节点）—— 必须逐段采样整条线。
 */
function routeIsClear(points: Point[], boxes: Box[], ignore: Box[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const steps = Math.max(2, Math.ceil(length / 4));

    for (let s = 0; s <= steps; s++) {
      const px = a.x + (b.x - a.x) * (s / steps);
      const py = a.y + (b.y - a.y) * (s / steps);

      // 端点必须贴在自身框的边上，所以只允许**端部 3px 内**接触 from/to
      const nearEndpoint =
        Math.hypot(px - first.x, py - first.y) <= 3 ||
        Math.hypot(px - last.x, py - last.y) <= 3;

      for (const box of boxes) {
        if (nearEndpoint && ignore.includes(box)) continue;
        if (px > box.x + 1 && px < box.x + box.w - 1 && py > box.y + 1 && py < box.y + box.h - 1) {
          return false;
        }
      }
    }
  }
  return true;
}

/** 从候选里挑第一条完全通畅的路线；都不通畅就返回第一条 */
function pickClearRoute(
  candidates: Point[][],
  boxes: Box[],
  ignore: Box[],
): Point[] {
  for (const points of candidates) {
    if (routeIsClear(points, boxes, ignore)) return points;
  }
  return candidates[0];
}

/**
 * 在给定 y 区间内空闲的竖直通道候选
 *
 * 关键：只要求「这段 y 区间里没有节点挡路」，**不是**要求整根竖列从上到下全空。
 * 后者在密集图上几乎筛不出候选，只能退回兜底路线（实测因此残留穿节点）。
 */
function freeBandColumns(
  boxes: Box[],
  yTop: number,
  yBottom: number,
  bounds: { left: number; right: number },
  ignore: Box[],
  clearance: number,
): number[] {
  const lo = Math.min(yTop, yBottom);
  const hi = Math.max(yTop, yBottom);
  const out: number[] = [];

  for (let x = bounds.left + 4; x <= bounds.right - 4; x += 6) {
    const blocked = boxes.some(
      b =>
        !ignore.includes(b) &&
        x > b.x - clearance &&
        x < b.x + b.w + clearance &&
        hi > b.y + 2 &&
        lo < b.y + b.h - 2,
    );
    if (!blocked) out.push(x);
  }
  return out;
}

/**
 * 两个 y 之间所有空闲的水平带（层间空隙）
 *
 * 跨越大半个画布的边，任何**单根竖列**都躲不开密集的节点 ——
 * 必须在每个空隙里逐段横移（阶梯路由）。这里给出可用的空隙。
 */
function freeBandsBetween(
  boxes: Box[],
  yFrom: number,
  yTo: number,
  ignore: Box[],
  clearance: number,
): number[] {
  const lo = Math.min(yFrom, yTo);
  const hi = Math.max(yFrom, yTo);
  const out: number[] = [];
  for (let y = lo + 6; y <= hi - 6; y += 6) {
    const blocked = boxes.some(
      b => !ignore.includes(b) && y > b.y - clearance && y < b.y + b.h + clearance,
    );
    if (!blocked) out.push(y);
  }
  return out;
}

/**
 * 空闲的竖直通道候选
 *
 * 只改变横段的位置是没用的 —— 真机事故里堵住的是**竖段所在的列**
 * （源节点正下方就有一个同列节点，直连竖线扎进它）。
 * 所以这里先算出"不与任何节点框的 x 区间重叠"的列，作为绕行通道。
 */
function freeColumns(boxes: Box[], bounds: { left: number; right: number }, ignore: Box[]): number[] {
  const out: number[] = [];
  for (let x = bounds.left + 4; x <= bounds.right - 4; x += 8) {
    const blocked = boxes.some(
      b => !ignore.includes(b) && x > b.x - 6 && x < b.x + b.w + 6,
    );
    if (!blocked) out.push(x);
  }
  return out;
}

/** 单段是否不穿过任何节点框 */
function segClear(a: Point, b: Point, boxes: Box[], ignore: Box[], clearance: number): boolean {
  const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const steps = Math.max(2, Math.ceil(length / 4));
  for (let s = 0; s <= steps; s++) {
    const px = a.x + (b.x - a.x) * (s / steps);
    const py = a.y + (b.y - a.y) * (s / steps);
    for (const box of boxes) {
      if (ignore.includes(box)) continue;
      if (
        px > box.x + clearance - 1 &&
        px < box.x + box.w - clearance + 1 &&
        py > box.y + clearance - 1 &&
        py < box.y + box.h - clearance + 1
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 多段阶梯路由：在**每一个空闲的水平空隙**里横移一次
 *
 * 为什么需要它：`routeAround` 的那些形状（Z 型、L 型、单次绕行）都只有
 * **一次**横移，横移之后的竖段仍然要跨越很长的距离 —— 在密集图上那一列
 * 必然被节点挡住。实测 ch003/ch006 就有 6 条边因此只能退回兜底路线，
 * 直接穿过节点框。
 *
 * 阶梯路由把长竖段拆成"每隔一层就横移一次"，每段竖线只跨一层，
 * 总能找到空隙穿过去。
 */
function staircaseRoute(
  fromBottom: Point,
  toTop: Point,
  boxes: Box[],
  bounds: { left: number; right: number },
  ignore: Box[],
  clearance: number,
): Point[] | null {
  const bands = freeBandsBetween(boxes, fromBottom.y + 4, toTop.y - 4, ignore, clearance);
  if (bands.length === 0) return null;

  const points: Point[] = [fromBottom];
  let current = fromBottom;

  // 逐带推进：每到一个空隙就换一次列，使**下一段竖线**只跨到下一个空隙。
  //
  // 之前只允许换一次列，于是"换列之后仍要跨越很远的那根竖线"照样被节点挡住
  // —— 实测残留 4 条穿节点，形状都是"第一段竖线就穿过中间节点"。
  // 现在每段的候选列都要求"在本段 y 区间内空闲"，逐段接力下去。
  for (let i = 0; i < bands.length; i++) {
    const y = bands[i];
    const nextY = i + 1 < bands.length ? bands[i + 1] : toTop.y;

    const down = { x: current.x, y };
    if (Math.abs(y - current.y) > 0.5 && !segClear(current, down, boxes, ignore, clearance)) {
      continue;
    }

    const columns = [toTop.x, ...freeBandColumns(boxes, y, nextY, bounds, ignore, clearance)];
    let advanced = false;

    for (const cx of columns) {
      const across = { x: cx, y };
      if (Math.abs(cx - current.x) > 0.5 && !segClear(down, across, boxes, ignore, clearance)) {
        continue;
      }

      const downNext = { x: cx, y: nextY };
      if (Math.abs(nextY - y) > 0.5 && !segClear(across, downNext, boxes, ignore, clearance)) {
        continue;
      }

      // 最后一个空隙：从 nextY 直接横切入目标
      if (i === bands.length - 1 && Math.abs(cx - toTop.x) > 0.5) {
        if (!segClear(downNext, toTop, boxes, ignore, clearance)) continue;
      }

      points.push(down, across, downNext);
      current = downNext;
      advanced = true;
      break;
    }

    if (!advanced) continue;
    if (Math.abs(current.x - toTop.x) <= 0.5 && Math.abs(current.y - toTop.y) <= 0.5) break;
  }

  // 收尾：对齐目标列，再竖直进目标
  if (Math.abs(current.x - toTop.x) > 0.5) {
    const across = { x: toTop.x, y: current.y };
    if (!segClear(current, across, boxes, ignore, clearance)) return null;
    points.push(across);
    current = across;
  }
  if (Math.abs(current.y - toTop.y) > 0.5) {
    if (!segClear(current, toTop, boxes, ignore, clearance)) return null;
    points.push({ x: toTop.x, y: toTop.y });
  }

  const deduped: Point[] = [];
  for (const pt of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last.x - pt.x) > 0.5 || Math.abs(last.y - pt.y) > 0.5) {
      deduped.push(pt);
    }
  }
  return deduped.length >= 2 ? deduped : null;
}

/** 折线总长（用于在通畅候选里挑最短的） */
function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

type Side = 'top' | 'right' | 'bottom' | 'left';

/** 矩形某条边的中点 —— 连线的进出口 */
function anchorOn(box: Box, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: box.x + box.w / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case 'left':
      return { x: box.x, y: box.y + box.h / 2 };
    default:
      return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

/** 两个进出口之间的正交折线（全水平/垂直段） */
function buildRoute(
  a: Point,
  aSide: Side,
  b: Point,
  bSide: Side,
  channelX?: number,
  channelY?: number,
): Point[] {
  const aVertical = aSide === 'top' || aSide === 'bottom';
  const bVertical = bSide === 'top' || bSide === 'bottom';

  if (aVertical && bVertical) {
    const y = channelY ?? (a.y + b.y) / 2;
    return [a, { x: a.x, y }, { x: b.x, y }, b];
  }
  if (!aVertical && !bVertical) {
    const x = channelX ?? (a.x + b.x) / 2;
    return [a, { x, y: a.y }, { x, y: b.y }, b];
  }
  if (aVertical) {
    if (channelY !== undefined && Math.abs(channelY - a.y) > 1) {
      return [a, { x: a.x, y: channelY }, { x: b.x, y: channelY }, b];
    }
    return [a, { x: a.x, y: b.y }, b];
  }
  if (channelX !== undefined && Math.abs(channelX - a.x) > 1) {
    return [a, { x: channelX, y: a.y }, { x: channelX, y: b.y }, b];
  }
  return [a, { x: b.x, y: a.y }, b];
}

/** 可能的通道位置（含画布左右外沿的兜底） */
function channelCandidates(
  boxes: Box[],
  bounds: { left: number; right: number; top: number; bottom: number },
  from: Box,
  to: Box,
  clearance: number,
) {
  // 主要用「按区间空闲」的列（严格版整列全空在密集图上几乎筛不出候选），
  // 严格版只作为补充
  const xs = freeBandColumns(boxes, from.y, to.y + to.h, bounds, [from, to], clearance);
  for (const x of freeColumns(boxes, bounds, [from, to])) {
    if (!xs.includes(x)) xs.push(x);
  }
  xs.push(Math.max(from.x + from.w, to.x + to.w) + clearance + 8);
  xs.push(Math.min(from.x, to.x) - clearance - 8);

  const ys = freeRows(boxes, bounds, [from, to]);
  ys.push(Math.max(from.y + from.h, to.y + to.h) + clearance + 8);
  ys.push(Math.min(from.y, to.y) - clearance - 8);

  return { xs, ys };
}

/**
 * 通用绕行：出口/入口各 4 种边 × 若干通道，取**最短且完全通畅**的路线
 *
 * 之所以不能只改横段位置：真机事故里堵住的往往是**源节点出口那一小段**
 * （紧邻的节点就在右边），或者**目标正上方/正下方的同列节点**。
 * 只有把进出口四条边和通道一起枚举，才能找到真正通畅的那条。
 *
 * @returns 找不到通畅路线时返回 null（调用方再兜底）
 */
function routeAround(
  from: Box,
  to: Box,
  boxes: Box[],
  bounds: { left: number; right: number; top: number; bottom: number },
  clearance: number,
): Point[] | null {
  const candidates: Point[][] = [];
  const sides: Side[] = ['right', 'left', 'bottom', 'top'];
  const channels = channelCandidates(boxes, bounds, from, to, clearance);

  for (const aSide of sides) {
    for (const bSide of sides) {
      const a = anchorOn(from, aSide);
      const b = anchorOn(to, bSide);
      const aVertical = aSide === 'top' || aSide === 'bottom';
      const bVertical = bSide === 'top' || bSide === 'bottom';

      if (aVertical && bVertical) {
        for (const y of channels.ys) candidates.push(buildRoute(a, aSide, b, bSide, undefined, y));
      } else if (!aVertical && !bVertical) {
        for (const x of channels.xs) candidates.push(buildRoute(a, aSide, b, bSide, x, undefined));
      } else {
        candidates.push(buildRoute(a, aSide, b, bSide));
        for (const y of channels.ys) candidates.push(buildRoute(a, aSide, b, bSide, undefined, y));
        for (const x of channels.xs) candidates.push(buildRoute(a, aSide, b, bSide, x, undefined));
      }
    }
  }

  const clear = candidates.filter(p => routeIsClear(p, boxes, [from, to]));
  if (clear.length === 0) return null;
  clear.sort((p, q) => polylineLength(p) - polylineLength(q));
  return clear[0];
}

/**
 * 空闲的水平通道候选（不与任何节点框的 y 区间重叠）
 */
function freeRows(boxes: Box[], bounds: { top: number; bottom: number }, ignore: Box[]): number[] {
  const out: number[] = [];
  for (let y = bounds.top + 4; y <= bounds.bottom + 20; y += 8) {
    const blocked = boxes.some(b => !ignore.includes(b) && y > b.y - 6 && y < b.y + b.h + 6);
    if (!blocked) out.push(y);
  }
  return out;
}

/** 竖直通道的候选 x：从 preferred 向右逐格试探，直到 bounds */
function channelXs(preferred: number, limit: number): number[] {
  const out: number[] = [];
  for (let x = preferred; x <= limit; x += 8) out.push(x);
  if (out.length === 0) out.push(preferred);
  return out;
}

/** 水平通道的候选 y */
function channelYs(preferred: number, limit: number): number[] {
  const out: number[] = [];
  for (let y = preferred; y <= limit; y += 8) out.push(y);
  if (out.length === 0) out.push(preferred);
  return out;
}

/** 截断到宽度上限，超出加省略号 */
function truncate(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;
  const budget = maxWidth - textWidth('…', fontSize);
  let out = '';
  for (const ch of text) {
    if (textWidth(out + ch, fontSize) > budget) break;
    out += ch;
  }
  return out ? `${out}…` : '…';
}

/** 标签候选位置：先水平段（不压线），再竖直段（贴着线的右侧） */
function labelCandidates(points: Point[]): Array<{ at: Point; anchor: 'middle' | 'start' }> {
  const horizontal: Array<{ a: Point; b: Point; len: number }> = [];
  const vertical: Array<{ a: Point; b: Point; len: number }> = [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.y - b.y) <= 1 && Math.abs(a.x - b.x) > 1) {
      horizontal.push({ a, b, len: Math.abs(b.x - a.x) });
    } else if (Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) > 1) {
      vertical.push({ a, b, len: Math.abs(b.y - a.y) });
    }
  }

  horizontal.sort((p, q) => q.len - p.len);
  vertical.sort((p, q) => q.len - p.len);

  const out: Array<{ at: Point; anchor: 'middle' | 'start' }> = [];
  for (const s of horizontal) {
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      out.push({ at: { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y }, anchor: 'middle' });
    }
  }
  for (const s of vertical) {
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      out.push({ at: { x: s.a.x + 7, y: s.a.y + (s.b.y - s.a.y) * t }, anchor: 'start' });
    }
  }
  return out;
}

/**
 * 路由所有连线
 */
export function routeEdges(
  boxes: Map<string, Box>,
  edges: SpecEdge[],
  options: RouteOptions,
): RoutedEdge[] {
  const clearance = options.clearance ?? 6;
  const labelFontSize = options.labelFontSize ?? 11;
  const { bounds } = options;
  const allBoxes = [...boxes.values()];
  const routed: RoutedEdge[] = [];
  const occupiedLabels: Box[] = [];

  /**
   * 从候选里挑最短且完全通畅的；都不通畅就用通用绕行器；
   * 连绕行器都找不到（极端拥挤）才退回第一个候选
   */
  const best = (from: Box, to: Box, candidates: Point[][]): Point[] => {
    const clear = candidates.filter(p => routeIsClear(p, allBoxes, [from, to]));
    if (clear.length > 0) {
      clear.sort((a, b) => polylineLength(a) - polylineLength(b));
      return clear[0];
    }
    // 兜底顺序：通用绕行 → 多段阶梯 → 实在不行才用第一个候选
    const around = routeAround(from, to, allBoxes, bounds, clearance);
    if (around) return around;

    const stair = staircaseRoute(
      { x: from.x + from.w / 2, y: from.y + from.h },
      { x: to.x + to.w / 2, y: to.y },
      allBoxes,
      bounds,
      [from, to],
      clearance,
    );
    if (stair) return stair;

    return candidates[0];
  };

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
      const top = Math.max(bounds.top + 2, from.y - clearance - 10);
      points = best(from, from, 
        channelXs(from.x + from.w + clearance + 8, bounds.right - 4).map(right => [
          { x: from.x + from.w, y: fromCenter.y },
          { x: right, y: fromCenter.y },
          { x: right, y: top },
          { x: from.x + from.w / 2, y: top },
          { x: from.x + from.w / 2, y: from.y },
        ]),
      );
    } else if (to.y > from.y + from.h) {
      // 正向：目标在下方
      const midY = Math.round((fromBottom.y + toTop.y) / 2);

      // ① 同列直连（最理想）
      if (Math.abs(fromBottom.x - toTop.x) <= 1) {
        points = best(from, to, [[fromBottom, toTop]]);
      } else {
        const candidates: Point[][] = [];

        // ② Z 型：下 → 横 → 下（横段在层间留白里，可上下挪）
        for (const y of channelYs(Math.max(bounds.top + 2, midY - 20), midY + 20)) {
          candidates.push([fromBottom, { x: fromBottom.x, y }, { x: toTop.x, y }, toTop]);
        }

        // ③ 侧向通道：先把横段挪到空闲列，再沿该列穿过被占住的层
        //    （源/目标正下方有别的节点时，Z 型必然穿过去）
        const columns = freeBandColumns(
          allBoxes,
          fromBottom.y,
          toTop.y,
          bounds,
          [from, to],
          clearance,
        );
        // 出口侧的空闲带（从源节点下方往下找）与入口侧的空闲带
        const exitBands = freeBandsBetween(allBoxes, fromBottom.y + 4, fromBottom.y + 90, [from, to], clearance);
        const entryBands = freeBandsBetween(allBoxes, toTop.y - 90, toTop.y - 4, [from, to], clearance);

        for (const cx of columns) {
          // 空、则退化为普通的 Z 型（已在上面枚举过）
          const exits = exitBands.length > 0 ? exitBands : [fromBottom.y + 12];
          const entries = entryBands.length > 0 ? entryBands : [toTop.y - 12];

          for (const exitY of exits) {
            for (const entryY of entries) {
              candidates.push([
                fromBottom,
                { x: fromBottom.x, y: exitY },
                { x: cx, y: exitY },
                { x: cx, y: entryY },
                { x: toTop.x, y: entryY },
                toTop,
              ]);
            }
          }
        }

        points = best(from, to, candidates);
      }
    } else if (Math.abs(fromCenter.y - toCenter.y) <= from.h / 2 + 1) {
      // 同层：从下方的自由通道绕
      points = best(
        from,
        to,
        channelYs(
          Math.max(from.y + from.h, to.y + to.h) + clearance + 8,
          bounds.bottom + 20,
        ).map(y => [
          { x: fromCenter.x, y: from.y + from.h },
          { x: fromCenter.x, y },
          { x: toCenter.x, y },
          { x: toCenter.x, y: to.y + to.h },
        ]),
      );
    } else {
      // 反向（往后指）：从右侧的自由通道绕回
      // 反向边：右侧绕行。通道从"两个端点的右边缘"开始逐格向右试探，
      // 并且校验**整条路线**（含最后横切入目标的那一段）
      const approach = (channelX: number, fromSide: boolean, toSide: boolean): Point[] => [
        { x: fromSide ? from.x + from.w : from.x, y: fromCenter.y },
        { x: channelX, y: fromCenter.y },
        { x: channelX, y: toCenter.y },
        { x: toSide ? to.x + to.w : to.x, y: toCenter.y },
      ];

      const backCandidates: Point[][] = [];
      for (const cx of freeBandColumns(
        allBoxes,
        Math.min(fromCenter.y, toCenter.y),
        Math.max(fromCenter.y, toCenter.y),
        bounds,
        [from, to],
        clearance,
      )) {
        backCandidates.push(approach(cx, true, true));
        backCandidates.push(approach(cx, false, false));
      }
      for (const cx of channelXs(Math.max(from.x + from.w, to.x + to.w) + clearance + 6, bounds.right - 4)) {
        backCandidates.push(approach(cx, true, true));
      }

      points = best(from, to, backCandidates);
    }

    const routedEdge: RoutedEdge = {
      from: edge.from,
      to: edge.to,
      points,
      style: edge.style,
      bidirectional: edge.direction === 'bidirectional',
    };

    if (edge.label) {
      const text = truncate(edge.label, LABEL_MAX_WIDTH, labelFontSize);
      // 占位比实测宽度略大：真实字体的字宽与估算有偏差，
      // 紧贴着的两个标签在实际渲染里就会擦边（保守口径实测到 8x12px 重叠）
      const width = textWidth(text, labelFontSize) + 12;
      const height = labelFontSize * 1.2 + 8;

      // 逐个候选位置试探：既不压节点，也不压已放好的标签，还不能出画布
      let chosen: { at: Point; anchor: 'middle' | 'start' } | undefined;
      for (const candidate of labelCandidates(points)) {
        const box: Box =
          candidate.anchor === 'middle'
            ? { x: candidate.at.x - width / 2, y: candidate.at.y - height * 0.8, w: width, h: height }
            : { x: candidate.at.x, y: candidate.at.y - height * 0.8, w: width, h: height };

        if (box.x < bounds.left || box.x + box.w > bounds.right) continue;
        if (box.y < bounds.top || box.y + box.h > bounds.bottom + 24) continue;
        if (allBoxes.some(b => intersects(box, b))) continue;
        if (occupiedLabels.some(b => intersects(box, b))) continue;

        chosen = candidate;
        occupiedLabels.push(box);
        break;
      }

      // 找不到空位就**不放**这个标签 ——
      // 压在节点或别的标签上比不显示更难读，而标签的详细含义本来就在正文里
      if (chosen) {
        routedEdge.label = text;
        routedEdge.labelAt = chosen.at;
        routedEdge.labelAnchor = chosen.anchor;
      }
    }

    routed.push(routedEdge);
  }

  return routed;
}
