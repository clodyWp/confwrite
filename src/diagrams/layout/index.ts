/**
 * 布局编排
 *
 * 把 DiagramSpec 变成可渲染的几何结果：
 *
 *   分层 → 层内排序（交叉最小化）→ 测宽折行 → 尺寸解算（含压缩）
 *        → 落位 → 容器包围框 → 正交路由 → 渲染
 *
 * 自检在这里做（正交性、节点重叠、交叉数、画布比例），不达标就记进
 * warnings —— 让"图没画好"这件事**可见**，而不是悄悄产出畸形图。
 */

import { getLayerPalette, type DiagramStyle } from '../style.js';
import type { DiagramSpec, SpecNode } from '../structured-parser.js';
import { assignLayers, countCrossings, type CrossableEdge } from './graph.js';
import {
  DEFAULT_METRICS,
  getDefaultMetrics,
  solveCanvas,
  textWidth,
  wrapIntoRows,
  wrapLabel,
  TARGET_WIDTH,
  MAX_ASPECT_RATIO,
  MAX_HEIGHT,
  MIN_FONT_RATIO,
  type LayoutMetrics,
} from './metrics.js';
import { renderSvg, type PlacedContainer, type PlacedNode } from './render.js';
import { isOrthogonal, routeEdges, type Box, type RoutedEdge } from './route.js';
import { validateLayout } from './validate.js';

export interface LayoutResult {
  svg: string;
  width: number;
  height: number;
  metrics: LayoutMetrics;
  /** 压缩/降级动作（可诊断） */
  adjustments: string[];
  /** 自检发现的问题 */
  warnings: string[];
  nodes: PlacedNode[];
  containers: PlacedContainer[];
  edges: RoutedEdge[];
  /** 层序（节点 id，不含横切节点） */
  layers: string[][];
  crossings: number;
}

interface NodeDraft {
  id: string;
  label: string[];
  w: number;
  h: number;
  layer: number;
  highWeight: boolean;
}

/** 层内排序：按与上一层邻居的平均位置（重心）排序 —— 减少交叉最有效的一步 */
function orderByBarycenter(ids: number[], barycenter: Map<number, number>): number[] {
  return [...ids].sort((a, b) => {
    const ba = barycenter.get(a);
    const bb = barycenter.get(b);
    if (ba === undefined && bb === undefined) return 0;
    if (ba === undefined) return 1;
    if (bb === undefined) return -1;
    return ba - bb;
  });
}

/**
 * 主入口
 */
/**
 * 样式里的字号档位 → 实际像素
 *
 * 此前新引擎**完全忽略** style.fontSize（旧渲染器是支持的），
 * 属于静默失效：用户改了 diagram-style.json 却看不到任何变化。
 */
const STYLE_FONT_SIZE: Record<DiagramStyle['fontSize'], number> = {
  compact: 11,
  normal: DEFAULT_METRICS.fontSize,
  spacious: 15,
};

export function layoutDiagram(spec: DiagramSpec, style: DiagramStyle, title?: string): LayoutResult {
  const warnings: string[] = [];
  // 使用场景参数
  const sceneMetrics = getDefaultMetrics(style.scene);
  const base = {
    ...sceneMetrics,
    fontSize: STYLE_FONT_SIZE[style.fontSize] ?? sceneMetrics.fontSize,
  };

  // 图表必须保持 ≤1 页的可读宽度，因此不支持横向布局。
  // 但**不能静默忽略**用户配置 —— 明确告警，避免"改了没反应"。
  if (style.layoutDirection === 'left-to-right') {
    warnings.push(
      'layoutDirection=left-to-right 暂不支持（图表需保持单页可读宽度），已按 top-to-bottom 渲染',
    );
  }
  // BUG：标题只留了字号+行距，没给容器的"标签区 + 上边距"留位，
  // 于是第一个容器的框会向上罩住标题（实测容器 y=23、标题基线 y=49）
  const hasFlowContainer = spec.containers.some(c => !c.crosscut);
  const titleHeight = title
    ? base.fontSize + 14 + (hasFlowContainer ? base.containerLabelHeight + base.containerPad : 0)
    : 0;

  const layerOf = assignLayers(spec);

  const crosscutContainerIds = new Set(spec.containers.filter(c => c.crosscut).map(c => c.id));
  const isCrosscut = (n: SpecNode): boolean =>
    n.container !== undefined && crosscutContainerIds.has(n.container);

  const flowNodes = spec.nodes.filter(n => !isCrosscut(n));
  const crosscutNodes = spec.nodes.filter(n => isCrosscut(n));

  // ---- 1. 节点尺寸（标签折行）----
  const maxTextWidth = base.maxNodeWidth - base.paddingX * 2;
  const makeDraft = (node: SpecNode): NodeDraft => {
    const lines = wrapLabel(node.label, base.fontSize, maxTextWidth);
    const widest = Math.max(...lines.map(l => textWidth(l, base.fontSize)));
    const h = base.paddingY * 2 + lines.length * base.fontSize * 1.25;
    return {
      id: node.id,
      label: lines,
      w: Math.min(base.maxNodeWidth, Math.max(base.minNodeWidth, Math.ceil(widest) + base.paddingX * 2)),
      // 原则 2：高权重节点更大（加高；宽度保持层内一致以免整行参差）
      h: node.highWeight ? Math.round(h * 1.25) : Math.round(h),
      layer: layerOf.get(node.id) ?? 0,
      highWeight: node.highWeight === true,
    };
  };

  // 主流程节点用**全局索引**贯穿后续计算（索引即下标，避免两套编号错位）
  const drafts: NodeDraft[] = flowNodes.map(makeDraft);
  const crosscutDrafts: NodeDraft[] = crosscutNodes.map(makeDraft);
  const draftOf = new Map<string, NodeDraft>();
  drafts.forEach(d => draftOf.set(d.id, d));
  crosscutDrafts.forEach(d => draftOf.set(d.id, d));

  // ---- 2. 分层 + 层内排序 ----
  const buckets = new Map<number, number[]>();
  drafts.forEach((d, index) => {
    if (!buckets.has(d.layer)) buckets.set(d.layer, []);
    buckets.get(d.layer)!.push(index);
  });

  let layers: number[][] = [...buckets.keys()].sort((a, b) => a - b).map(l => buckets.get(l)!);
  const layerIds = (): string[][] => layers.map(row => row.map(i => drafts[i].id));

  const crossableEdges: CrossableEdge[] = spec.edges.map(e => ({ from: e.from, to: e.to }));
  const beforeCrossings = countCrossings(layerIds(), crossableEdges);

  /**
   * 一趟重心排序：按相邻层里邻居的平均位置重排某一层
   *
   * 只保留更优的结果 —— 排序不该让交叉变多。
   *
   * @param direction 'forward' 用上一层邻居（自上而下），
   *                  'backward' 用下一层邻居（自下而上）
   */
  const sweep = (index: number, direction: 'forward' | 'backward'): void => {
    const reference = direction === 'forward' ? index - 1 : index + 1;
    if (reference < 0 || reference >= layers.length) return;

    const referencePosition = new Map<string, number>();
    layerIds()[reference].forEach((id, position) => referencePosition.set(id, position));

    const barycenter = new Map<number, number>();
    for (const i of layers[index]) {
      const id = drafts[i].id;
      const neighbors = spec.edges
        .filter(e => (direction === 'forward' ? e.to === id : e.from === id))
        .map(e => referencePosition.get(direction === 'forward' ? e.from : e.to))
        .filter((p): p is number => p !== undefined);
      if (neighbors.length > 0) {
        barycenter.set(i, neighbors.reduce((a, b) => a + b, 0) / neighbors.length);
      }
    }

    const saved = layers[index];
    const next = orderByBarycenter(saved, barycenter);
    layers[index] = next;
    if (countCrossings(layerIds(), crossableEdges) > countCrossings(
      layers.map((row, k) => (k === index ? saved : row)).map(row => row.map(x => drafts[x].id)),
      crossableEdges,
    )) {
      layers[index] = saved; // 变差了就回退
    }
  };

  // 自上而下 + 自下而上各扫两轮（经典的交叉最小化启发式）
  for (let round = 0; round < 2; round++) {
    for (let i = 1; i < layers.length; i++) sweep(i, 'forward');
    for (let i = layers.length - 2; i >= 0; i--) sweep(i, 'backward');
  }

  const crossings = Math.min(beforeCrossings, countCrossings(layerIds(), crossableEdges));

  // ---- 3. 层内统一宽度（原则 4：同类模块同尺寸）----
  for (const row of layers) {
    const width = Math.max(...row.map(i => drafts[i].w));
    for (const i of row) drafts[i].w = width;
  }

  // ---- 4. 横切竖条宽度 ----
  // 竖条宽度要同时容下「最宽节点」和「它自己的标签」——
  // 只按节点算会让标签伸出画布（实测 ch008-fig1 的贯穿性追溯链标签）
  const crosscutLabel = spec.containers.find(c => c.crosscut)?.label ?? '';
  const crosscutLabelWidth = textWidth(crosscutLabel, base.fontSize - 1) + 16;
  const crosscutWidth = crosscutDrafts.length
    ? Math.max(
        120,
        Math.min(base.maxNodeWidth, Math.max(...crosscutDrafts.map(d => d.w)) + base.containerPad * 2),
        crosscutLabelWidth,
      )
    : 0;

  // ---- 5. 折行 + 尺寸解算 ----
  const usableWidth = TARGET_WIDTH - base.margin * 2 - (crosscutWidth ? base.rowGap + crosscutWidth : 0);

  // wrapIntoRows 返回的是**层内下标**，这里立刻换成 drafts 的全局下标 ——
  // 否则下游拿层内下标去索引 nodeWidths 会量错节点宽度
  // （曾经为此把 628px 的画布算成 988px，并报出假的"超宽"警告）
  const rowsPerLayer: number[][][] = layers.map(row =>
    wrapIntoRows(row.map(i => drafts[i].w), usableWidth, base.rowGap).map(inner =>
      inner.map(i => row[i]),
    ),
  );

  // 横切竖条自己需要的最小高度（标签 + 留白 + 节点逐个排开）
  const crosscutStep = crosscutDrafts.length
    ? Math.max(...crosscutDrafts.map(d => d.h)) + base.subRowGap
    : 0;
  const crosscutNeededHeight = crosscutDrafts.length
    ? base.containerLabelHeight + base.containerPad * 2 + crosscutStep * crosscutDrafts.length
    : 0;

  // 相邻层都有容器时，层间距必须装得下容器标签区 + 两侧边距 + 容器间距（原则 7：≥30px）
  const minLayerGap = hasFlowContainer
    ? base.containerPad * 2 + base.containerLabelHeight + 29
    : undefined;

  const size = solveCanvas({
    layers: rowsPerLayer,
    nodeWidths: drafts.map(d => d.w),
    nodeHeights: drafts.map(d => d.h),
    crosscut: crosscutDrafts.length
      ? { width: crosscutWidth, nodeCount: crosscutDrafts.length, height: crosscutNeededHeight }
      : null,
    titleHeight,
    minLayerGap,
    // 初始层间距就要满足下限 —— 只设"压缩下限"是不够的：
    // 初始值 40 本来就低于所需的 58，永远不会被抬高
    metrics: minLayerGap
      ? { ...base, layerGap: Math.max(base.layerGap, minLayerGap) }
      : base,
  });

  const metrics = size.metrics;
  warnings.push(...size.adjustments.filter(a => a.startsWith('⚠️')));

  /** 字号被压缩后，节点高度按同比例缩放 */
  const heightOf = (d: NodeDraft): number => Math.round(d.h * (metrics.fontSize / base.fontSize));
  const widthOf = (d: NodeDraft): number => d.w;

  // 所有行的宽度（用于整体居中）
  const allRowWidths: number[] = [];
  for (const rows of rowsPerLayer) {
    for (const row of rows) {
      allRowWidths.push(
        row.reduce((sum, i) => sum + widthOf(drafts[i]), 0) + metrics.rowGap * Math.max(0, row.length - 1),
      );
    }
  }
  const contentWidth = allRowWidths.length ? Math.max(...allRowWidths) : 0;

  // ---- 6. 落位 ----
  const placed: PlacedNode[] = [];
  const boxes = new Map<string, Box>();

  const place = (draft: NodeDraft, box: Box, layer: number): void => {
    boxes.set(draft.id, box);
    placed.push({
      id: draft.id,
      label: draft.label,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      layer,
      highWeight: draft.highWeight,
    });
  };

  let y = metrics.margin + titleHeight;

  rowsPerLayer.forEach(rows => {
    rows.forEach((row, ri) => {
      const rowWidth =
        row.reduce((sum, i) => sum + widthOf(drafts[i]), 0) +
        metrics.rowGap * Math.max(0, row.length - 1);
      const rowHeight = Math.max(...row.map(i => heightOf(drafts[i])));
      let x = metrics.margin + (contentWidth - rowWidth) / 2;

      for (const i of row) {
        const d = drafts[i];
        const h = heightOf(d);
        place(d, { x: Math.round(x), y: Math.round(y + (rowHeight - h) / 2), w: d.w, h }, d.layer);
        x += d.w + metrics.rowGap;
      }

      y += rowHeight + (ri < rows.length - 1 ? metrics.subRowGap : 0);
    });
    y += metrics.layerGap;
  });

  const contentHeight = Math.max(0, y - metrics.layerGap - (metrics.margin + titleHeight));

  // ---- 7. 横切竖条（布局上单独一列，不占层序）----
  const containers: PlacedContainer[] = [];

  if (crosscutDrafts.length > 0) {
    const barX = metrics.margin + contentWidth + metrics.rowGap;
    const barY = metrics.margin + titleHeight;
    const crosscutContainer = spec.containers.find(c => c.crosscut);
    // 竖条高度取"主体高度"与"自己需要的高度"的较大者
    const barH = Math.max(contentHeight, crosscutNeededHeight);

    containers.push({
      id: crosscutContainer?.id ?? 'crosscut',
      label: crosscutContainer?.label ?? '贯穿动作',
      x: Math.round(barX),
      y: Math.round(barY),
      w: crosscutWidth,
      h: Math.round(barH),
      crosscut: true,
    });

    const innerTop = barY + metrics.containerLabelHeight + metrics.containerPad;
    const innerHeight = Math.max(0, barH - metrics.containerLabelHeight - metrics.containerPad * 2);
    // step 不得小于节点自身高度，否则等分居中会把节点叠在一起
    const step = crosscutDrafts.length > 1 ? Math.max(crosscutStep, innerHeight / crosscutDrafts.length) : 0;

    crosscutDrafts.forEach((d, i) => {
      const h = heightOf(d);
      place(
        d,
        {
          x: Math.round(barX + (crosscutWidth - d.w) / 2),
          y: Math.round(innerTop + (step > 0 ? i * step + (step - h) / 2 : 0)),
          w: d.w,
          h,
        },
        -1,
      );
    });
  }

  // ---- 8. 非横切容器的包围框（原则 1 / 7）----
  for (const container of spec.containers) {
    if (container.crosscut) continue;
    const members = placed.filter(n => flowNodes.find(x => x.id === n.id)?.container === container.id);
    if (members.length === 0) continue;

    const minX = Math.min(...members.map(m => m.x));
    const minY = Math.min(...members.map(m => m.y));
    const maxX = Math.max(...members.map(m => m.x + m.w));
    const maxY = Math.max(...members.map(m => m.y + m.h));

    containers.push({
      id: container.id,
      label: container.label,
      x: Math.round(minX - metrics.containerPad),
      y: Math.round(minY - metrics.containerPad - metrics.containerLabelHeight),
      w: Math.round(maxX - minX + metrics.containerPad * 2),
      h: Math.round(maxY - minY + metrics.containerPad * 2 + metrics.containerLabelHeight),
      crosscut: false,
    });
  }

  // ---- 9. 正交路由 ----
  // 计算容器标签的占位框（边标签需避开）
  const containerLabelBoxes = containers
    .filter(c => c.label)
    .map(c => {
      const labelFontSize = Math.max(9, metrics.fontSize - 1);
      const labelWidth = Math.min(
        c.label.length * labelFontSize * 0.6,
        c.w - 16
      );
      return {
        x: c.x + 8,
        y: c.y + metrics.fontSize + 4 - labelFontSize * 0.8,
        w: labelWidth,
        h: labelFontSize * 1.2,
      };
    });

  const edges = routeEdges(boxes, spec.edges, {
    bounds: {
      left: metrics.margin,
      right: metrics.margin + contentWidth + (crosscutWidth ? metrics.rowGap + crosscutWidth : 0),
      top: metrics.margin + titleHeight,
      bottom: metrics.margin + titleHeight + contentHeight,
    },
    clearance: 6,
    // 传最终字号，保证标签的截断宽度与渲染一致
    labelFontSize: Math.max(9, metrics.fontSize - 2),
    containerLabelBoxes,
  });

  // ---- 10. 自检：让问题可见，而不是悄悄产出畸形图 ----
  for (const edge of edges) {
    if (!isOrthogonal(edge.points)) warnings.push(`连线 ${edge.from}→${edge.to} 不是正交折线`);
  }

  // 集成 SVG 校验（参考 svg-diagram-v3）
  const validationIssues = validateLayout({
    nodes: placed,
    containers,
    edges,
    width: Math.round(metrics.margin * 2 + contentWidth + (crosscutWidth ? metrics.rowGap + crosscutWidth : 0)),
    height: Math.round(metrics.margin * 2 + titleHeight + contentHeight),
    fontSize: metrics.fontSize,
  });
  for (const issue of validationIssues) {
    warnings.push(`[${issue.type}] ${issue.message}`);
  }

  if (crossings > 2) warnings.push(`连线交叉 ${crossings} 处（上限 2）`);

  // 计算容器的实际边界，确保画布足够大
  const maxContainerY = containers.length > 0
    ? Math.max(...containers.map(c => c.y + c.h))
    : 0;
  const maxContainerX = containers.length > 0
    ? Math.max(...containers.map(c => c.x + c.w))
    : 0;

  const width = Math.round(
    Math.max(
      metrics.margin * 2 + contentWidth + (crosscutWidth ? metrics.rowGap + crosscutWidth : 0),
      maxContainerX + metrics.margin
    )
  );
  const height = Math.round(
    Math.max(
      metrics.margin * 2 + titleHeight + contentHeight,
      maxContainerY + metrics.margin
    )
  );

  if (width > TARGET_WIDTH || height > MAX_HEIGHT) {
    warnings.push(`画布 ${Math.round(width)}x${Math.round(height)} 超出页面框 ${TARGET_WIDTH}x${MAX_HEIGHT}`);
  }
  if (width > 0 && metrics.fontSize / width < MIN_FONT_RATIO) {
    warnings.push(`字号占宽比 ${((metrics.fontSize / width) * 100).toFixed(2)}% 低于可读线`);
  }

  const svg = renderSvg({
    title,
    width,
    height,
    nodes: placed,
    containers,
    edges,
    metrics,
    style,
    titleHeight,
  });

  return {
    svg,
    width,
    height,
    metrics,
    adjustments: size.adjustments,
    warnings,
    nodes: placed,
    containers,
    edges,
    layers: layerIds(),
    crossings,
  };
}
