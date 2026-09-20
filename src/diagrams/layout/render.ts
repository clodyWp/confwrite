/**
 * SVG 渲染
 *
 * 绘制顺序（后画的盖在上面）：
 *   背景 → 容器包围框 → 连线 → 节点 → 标题
 *
 * 设计约束来自知识库 knowledge/diagrams/layout.md：
 *   原则 1 分组压缩   —— 容器画成浅色底 + 虚线框 + 左上角标签
 *   原则 2 视觉权重   —— 高权重节点：更深填充 + 粗边框 + 加高
 *   原则 3 路径引导   —— 层序自上而下（编号由写手写在 label 里）
 *   原则 4 重复模式   —— 同层节点同宽同高同色
 *   原则 6 标注外置   —— 节点内只放 label，详细内容本来就在正文
 *   原则 7 边界清晰   —— 容器内外留白不同
 */

import { CJK_FONT_FAMILY, getColorScheme, getLayerPalette, type DiagramStyle } from '../style.js';
import { textWidth, type LayoutMetrics } from './metrics.js';
import type { Point, RoutedEdge } from './route.js';

export interface PlacedNode {
  id: string;
  /** 已折行的标签（最多两行） */
  label: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  highWeight: boolean;
}

export interface PlacedContainer {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 横切/贯穿型：画在右侧竖条 */
  crosscut: boolean;
}

export interface RenderInput {
  title?: string;
  width: number;
  height: number;
  nodes: PlacedNode[];
  containers: PlacedContainer[];
  edges: RoutedEdge[];
  metrics: LayoutMetrics;
  style: DiagramStyle;
  /** 标题占用的高度（用于定位标题基线） */
  titleHeight: number;
}

/** XML 转义 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 颜色加深（高权重节点用"同色系更深"，保住层级识别的语义） */
function darken(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 节点圆角半径（按风格） */
function cornerRadius(style: DiagramStyle): number {
  if (style.nodeShape === 'sharp') return 0;
  if (style.nodeShape === 'pill') return 24;
  return 6;
}

function dashArray(style: RoutedEdge['style']): string {
  if (style === 'dashed') return ' stroke-dasharray="6 4"';
  if (style === 'dotted') return ' stroke-dasharray="2 3"';
  return '';
}

/**
 * 渲染 SVG
 */
export function renderSvg(input: RenderInput): string {
  const { metrics, style } = input;
  const scheme = getColorScheme(style.colorScheme);
  const palette = getLayerPalette(style);
  const lineColor = scheme?.line ?? '#a8a29e';
  const textColor = scheme?.text ?? '#1e293b';
  const radius = cornerRadius(style);
  const lineHeight = metrics.fontSize * 1.25;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${input.width} ${input.height}" ` +
      `width="${input.width}" height="${input.height}">`,
  );

  parts.push(
    `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">` +
      `<polygon points="0 0, 10 3.5, 0 7" fill="${lineColor}"/></marker>` +
      `<marker id="arrowhead-start" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">` +
      `<polygon points="10 0, 0 3.5, 10 7" fill="${lineColor}"/></marker></defs>`,
  );

  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  // ---- 标题 ----
  if (input.title) {
    parts.push(
      `<text x="${input.width / 2}" y="${metrics.margin + metrics.fontSize + 4}" text-anchor="middle" ` +
        `fill="${textColor}" font-size="${metrics.fontSize + 2}" font-weight="600" ` +
        `font-family="${CJK_FONT_FAMILY}">${escapeXml(input.title)}</text>`,
    );
  }

  // ---- 容器（原则 1 / 7）----
  for (const container of input.containers) {
    const fill = container.crosscut ? '#94a3b8' : palette[0];
    parts.push(
      `<rect x="${container.x}" y="${container.y}" width="${container.w}" height="${container.h}" ` +
        `rx="8" fill="${fill}" fill-opacity="0.07" stroke="${fill}" stroke-opacity="0.45" ` +
        `stroke-width="1.2" stroke-dasharray="5 4"/>`,
    );
    // 标签宽度兜底：超出容器宽度就截断，绝不伸出画布
    const labelFontSize = metrics.fontSize - 1;
    const labelBudget = container.w - 16;
    let label = container.label;
    if (textWidth(label, labelFontSize) > labelBudget) {
      const budget = labelBudget - textWidth('…', labelFontSize);
      let cut = '';
      for (const ch of label) {
        if (textWidth(cut + ch, labelFontSize) > budget) break;
        cut += ch;
      }
      label = cut ? `${cut}…` : '…';
    }

    parts.push(
      `<text x="${container.x + 8}" y="${container.y + metrics.fontSize + 4}" fill="${textColor}" ` +
        `font-size="${labelFontSize}" font-weight="600" font-family="${CJK_FONT_FAMILY}">` +
        `${escapeXml(label)}</text>`,
    );
  }

  // ---- 连线（全正交）----
  for (const edge of input.edges) {
    const path = edge.points.map(p => `${p.x},${p.y}`).join(' ');
    const dash = dashArray(edge.style);
    const startMarker = edge.bidirectional ? ' marker-start="url(#arrowhead-start)"' : '';
    parts.push(
      `<polyline points="${path}" fill="none" stroke="${lineColor}" stroke-width="1.5"${dash}` +
        ` marker-end="url(#arrowhead)"${startMarker}/>`,
    );

    if (edge.label && edge.labelAt) {
      // 白描边做底，避免标签压在连线上看不清。
      // 竖直段旁的标签用 start 对齐（贴着线的右侧），水平段上的居中。
      const anchor = edge.labelAnchor ?? 'middle';
      parts.push(
        `<text x="${edge.labelAt.x}" y="${edge.labelAt.y - 4}" text-anchor="${anchor}" fill="${textColor}" ` +
          `font-size="${Math.max(9, metrics.fontSize - 2)}" font-family="${CJK_FONT_FAMILY}" ` +
          `stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeXml(edge.label)}</text>`,
      );
    }
  }

  // ---- 节点（原则 2 / 4）----
  for (const node of input.nodes) {
    const base = palette[node.layer % palette.length];
    const fill = node.highWeight ? darken(base, 0.3) : base;
    const strokeWidth = node.highWeight ? 2.5 : 1.5;

    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${radius}" ` +
        `fill="${fill}" stroke="${darken(base, 0.25)}" stroke-width="${strokeWidth}"/>`,
    );

    const startY = node.y + node.h / 2 - ((node.label.length - 1) * lineHeight) / 2 + metrics.fontSize / 3;
    node.label.forEach((line, i) => {
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${startY + i * lineHeight}" text-anchor="middle" ` +
          `fill="#ffffff" font-size="${metrics.fontSize}"` +
          `${node.highWeight ? ' font-weight="600"' : ''} ` +
          `font-family="${CJK_FONT_FAMILY}">${escapeXml(line)}</text>`,
      );
    });
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** 供自检使用：取出所有折线的顶点 */
export function extractPolylines(svg: string): Point[][] {
  return Array.from(svg.matchAll(/<polyline points="([^"]+)"/g)).map(m =>
    m[1]
      .trim()
      .split(/\s+/)
      .map(pair => {
        const [x, y] = pair.split(',').map(Number);
        return { x, y };
      }),
  );
}
