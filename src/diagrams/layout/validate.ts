/**
 * SVG Layout Validator
 *
 * 参考 svg-diagram-v3 的 validate-svg.js，集成到布局管线。
 * 校验 6 项：节点重叠、超出画布、文字截断、连线端点、留白不足、组间距不足。
 *
 * 与外部脚本的区别：这里是纯函数，输入已解析的几何数据，输出问题列表。
 * 管线在 layoutDiagram 之后调用，把问题写进 warnings。
 */

import type { PlacedNode, PlacedContainer } from './render.js';
import type { RoutedEdge, Point } from './route.js';

export interface ValidationInput {
  nodes: PlacedNode[];
  containers: PlacedContainer[];
  edges: RoutedEdge[];
  width: number;
  height: number;
  fontSize: number;
}

export interface ValidationIssue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

const MIN_PADDING = 10;  // 调整为 10px，适应紧凑布局
const MIN_NODE_GAP = 10;
const MIN_GROUP_GAP_RATIO = 3;
const TEXT_CHAR_WIDTH_RATIO = 0.6;

/**
 * 校验布局结果
 */
export function validateLayout(input: ValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, containers, edges, width, height, fontSize } = input;

  // 1. 节点重叠
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        issues.push({
          type: 'OVERLAP',
          severity: 'error',
          message: `节点重叠: ${a.id} 与 ${b.id}`,
        });
      }
    }
  }

  // 2. 超出画布
  for (const n of nodes) {
    if (n.x < 0 || n.y < 0 || n.x + n.w > width || n.y + n.h > height) {
      issues.push({
        type: 'OUT_OF_BOUNDS',
        severity: 'error',
        message: `节点超出画布: ${n.id}`,
      });
    }
  }

  // 3. 文字截断
  for (const n of nodes) {
    const label = n.label.join('');
    const textWidth = label.length * fontSize * TEXT_CHAR_WIDTH_RATIO;
    const available = n.w - 16;
    if (textWidth > available) {
      issues.push({
        type: 'TEXT_OVERFLOW',
        severity: 'warning',
        message: `文字可能截断: ${n.id}（${label.slice(0, 20)}…）`,
      });
    }
  }

  // 4. 留白不足
  if (nodes.length > 0) {
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxX = Math.max(...nodes.map(n => n.x + n.w));
    const maxY = Math.max(...nodes.map(n => n.y + n.h));

    if (minX < MIN_PADDING) {
      issues.push({ type: 'PADDING', severity: 'warning', message: `左侧留白不足: ${minX}px` });
    }
    if (width - maxX < MIN_PADDING) {
      issues.push({ type: 'PADDING', severity: 'warning', message: `右侧留白不足: ${width - maxX}px` });
    }
    if (minY < MIN_PADDING) {
      issues.push({ type: 'PADDING', severity: 'warning', message: `顶部留白不足: ${minY}px` });
    }
    if (height - maxY < MIN_PADDING) {
      issues.push({ type: 'PADDING', severity: 'warning', message: `底部留白不足: ${height - maxY}px` });
    }
  }

  // 5. 同行/列节点间距不足
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const sameRow = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < 20;
      const sameCol = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) < 20;

      if (sameRow || sameCol) {
        const gapH = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapV = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        const gap = Math.max(gapH, gapV);
        if (gap >= 0 && gap < MIN_NODE_GAP) {
          issues.push({
            type: 'INSUFFICIENT_GAP',
            severity: 'warning',
            message: `节点间距不足: ${a.id} 与 ${b.id}（${gap.toFixed(0)}px < ${MIN_NODE_GAP}px）`,
          });
        }
      }
    }
  }

  // 6. 组间距/组内间距比
  const flowContainers = containers.filter(c => !c.crosscut && c.label);
  if (flowContainers.length >= 2) {
    const nodesByContainer = flowContainers.map(c =>
      nodes.filter(n => n.x >= c.x && n.x + n.w <= c.x + c.w && n.y >= c.y && n.y + n.h <= c.y + c.h),
    );

    const internalGaps: number[] = [];
    for (const group of nodesByContainer) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const gapH = Math.max(group[j].x - (group[i].x + group[i].w), group[i].x - (group[j].x + group[j].w));
          const gapV = Math.max(group[j].y - (group[i].y + group[i].h), group[i].y - (group[j].y + group[j].h));
          const gap = Math.max(gapH, gapV);
          if (gap > 0 && gap < 200) internalGaps.push(gap);
        }
      }
    }

    const containerGaps: number[] = [];
    for (let i = 0; i < flowContainers.length; i++) {
      for (let j = i + 1; j < flowContainers.length; j++) {
        const a = flowContainers[i];
        const b = flowContainers[j];
        const gapH = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapV = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        const gap = Math.max(gapH, gapV);
        if (gap > 0 && gap < 500) containerGaps.push(gap);
      }
    }

    if (internalGaps.length > 0 && containerGaps.length > 0) {
      const avgInternal = internalGaps.reduce((a, b) => a + b, 0) / internalGaps.length;
      const avgContainer = containerGaps.reduce((a, b) => a + b, 0) / containerGaps.length;
      const ratio = avgContainer / avgInternal;
      if (ratio < MIN_GROUP_GAP_RATIO) {
        issues.push({
          type: 'GROUP_GAP_RATIO',
          severity: 'warning',
          message: `组间距/组内间距比不足: ${ratio.toFixed(1)}:1（需≥${MIN_GROUP_GAP_RATIO}:1）`,
        });
      }
    }
  }

  return issues;
}
