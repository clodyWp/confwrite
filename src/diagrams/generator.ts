/**
 * SVG Generator
 * 
 * 将解析后的节点和连接关系渲染为 SVG。
 * 支持多种风格配置：配色方案、节点形状、布局方向。
 */
import { getColorScheme, type DiagramStyle, type ColorScheme } from './style.js';

/**
 * SVG 节点
 */
export interface SVGNode {
  id: string;
  label: string;
  layer: number;
}

/**
 * SVG 连接
 */
export interface SVGConnection {
  from: string;
  to: string;
  label?: string;
}

/**
 * SVG 生成结果
 */
export interface SVGResult {
  svg: string;
  width: number;
  height: number;
}

/**
 * 布局常量
 */
const LAYOUT = {
  nodeWidth: 140,
  nodeHeight: 50,
  layerSpacing: 80,
  nodeSpacing: 30,
  padding: 40,
  fontSize: 13,
  titleSize: 16,
};

/**
 * 生成 SVG
 * 
 * @param nodes 节点列表
 * @param connections 连接列表
 * @param style 风格配置
 * @returns SVG 字符串和尺寸
 */
export function generateSVG(
  nodes: SVGNode[],
  connections: SVGConnection[],
  style: DiagramStyle
): SVGResult {
  if (nodes.length === 0) {
    return {
      svg: generateEmptySVG(style),
      width: 200,
      height: 100,
    };
  }

  const colors = style.customColors || getColorScheme(style.colorScheme) || getColorScheme('warm')!;
  const positions = calculatePositions(nodes, style);
  const { width, height } = calculateCanvasSize(positions, style);

  const svgParts: string[] = [];

  // SVG 头部
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);

  // 定义箭头标记
  svgParts.push(generateArrowMarker(colors));

  // 背景
  svgParts.push(`<rect width="100%" height="100%" fill="${colors.bg}"/>`);

  // 绘制连接线（先画线，节点覆盖线头）
  for (const conn of connections) {
    const fromPos = positions[conn.from];
    const toPos = positions[conn.to];
    if (fromPos && toPos) {
      svgParts.push(generateConnection(fromPos, toPos, conn, style, colors));
    }
  }

  // 绘制节点
  for (const node of nodes) {
    const pos = positions[node.id];
    if (pos) {
      svgParts.push(generateNode(node, pos, style, colors));
    }
  }

  svgParts.push('</svg>');

  return {
    svg: svgParts.join('\n'),
    width,
    height,
  };
}

/**
 * 生成空 SVG
 */
function generateEmptySVG(style: DiagramStyle): string {
  const colors = style.customColors || getColorScheme(style.colorScheme) || getColorScheme('warm')!;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100">
  <rect width="100%" height="100%" fill="${colors.bg}"/>
  <text x="100" y="50" text-anchor="middle" fill="${colors.text}" font-size="14">无内容</text>
</svg>`;
}

/**
 * 计算节点位置
 */
function calculatePositions(
  nodes: SVGNode[],
  style: DiagramStyle
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // 按层分组
  const layers = new Map<number, SVGNode[]>();
  for (const node of nodes) {
    if (!layers.has(node.layer)) {
      layers.set(node.layer, []);
    }
    layers.get(node.layer)!.push(node);
  }

  const isHorizontal = style.layoutDirection === 'left-to-right';

  // 计算每层节点的位置
  for (const [layerIndex, layerNodes] of layers.entries()) {
    const layerSize = layerNodes.length;
    const totalWidth = layerSize * LAYOUT.nodeWidth + (layerSize - 1) * LAYOUT.nodeSpacing;
    const startX = LAYOUT.padding + (600 - totalWidth) / 2; // 居中

    for (let i = 0; i < layerNodes.length; i++) {
      const node = layerNodes[i];

      if (isHorizontal) {
        // 从左到右：layer 是 X 方向
        positions[node.id] = {
          x: LAYOUT.padding + layerIndex * (LAYOUT.nodeWidth + LAYOUT.layerSpacing),
          y: LAYOUT.padding + i * (LAYOUT.nodeHeight + LAYOUT.nodeSpacing),
        };
      } else {
        // 从上到下：layer 是 Y 方向
        positions[node.id] = {
          x: startX + i * (LAYOUT.nodeWidth + LAYOUT.nodeSpacing),
          y: LAYOUT.padding + layerIndex * (LAYOUT.nodeHeight + LAYOUT.layerSpacing),
        };
      }
    }
  }

  return positions;
}

/**
 * 计算画布尺寸
 */
function calculateCanvasSize(
  positions: Record<string, { x: number; y: number }>,
  style: DiagramStyle
): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;

  for (const pos of Object.values(positions)) {
    maxX = Math.max(maxX, pos.x + LAYOUT.nodeWidth);
    maxY = Math.max(maxY, pos.y + LAYOUT.nodeHeight);
  }

  return {
    width: maxX + LAYOUT.padding,
    height: maxY + LAYOUT.padding,
  };
}

/**
 * 生成箭头标记
 */
function generateArrowMarker(colors: ColorScheme): string {
  return `<defs>
  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="${colors.line}"/>
  </marker>
</defs>`;
}

/**
 * 生成节点 SVG
 */
function generateNode(
  node: SVGNode,
  pos: { x: number; y: number },
  style: DiagramStyle,
  colors: ColorScheme
): string {
  const { x, y } = pos;
  const w = LAYOUT.nodeWidth;
  const h = LAYOUT.nodeHeight;

  let rx = 0;
  switch (style.nodeShape) {
    case 'rounded':
      rx = 6;
      break;
    case 'pill':
      rx = h / 2;
      break;
    case 'sharp':
      rx = 0;
      break;
  }

  // 字体族不使用引号（解决 Windows 中文字体问题）
  const fontFamily = 'Microsoft YaHei, SimHei, sans-serif';

  return `<g id="node-${node.id}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${colors.primary}" stroke="${colors.line}" stroke-width="1.5"/>
  <text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" fill="${colors.bg}" font-size="${LAYOUT.fontSize}" font-family="${fontFamily}">${escapeXml(node.label)}</text>
</g>`;
}

/**
 * 生成连接线 SVG
 */
function generateConnection(
  from: { x: number; y: number },
  to: { x: number; y: number },
  conn: SVGConnection,
  style: DiagramStyle,
  colors: ColorScheme
): string {
  const isHorizontal = style.layoutDirection === 'left-to-right';

  let x1: number, y1: number, x2: number, y2: number;

  if (isHorizontal) {
    // 从左到右：从右侧连到左侧
    x1 = from.x + LAYOUT.nodeWidth;
    y1 = from.y + LAYOUT.nodeHeight / 2;
    x2 = to.x;
    y2 = to.y + LAYOUT.nodeHeight / 2;
  } else {
    // 从上到下：从底部连到顶部
    x1 = from.x + LAYOUT.nodeWidth / 2;
    y1 = from.y + LAYOUT.nodeHeight;
    x2 = to.x + LAYOUT.nodeWidth / 2;
    y2 = to.y;
  }

  const parts: string[] = [];
  parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.line}" stroke-width="1.5" marker-end="url(#arrowhead)"/>`);

  // 连接标签
  if (conn.label) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const fontFamily = 'Microsoft YaHei, SimHei, sans-serif';
    parts.push(`<text x="${midX}" y="${midY - 8}" text-anchor="middle" fill="${colors.text}" font-size="11" font-family="${fontFamily}">${escapeXml(conn.label)}</text>`);
  }

  return parts.join('\n');
}

/**
 * XML 转义
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
