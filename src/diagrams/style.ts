/**
 * Diagram Style Preferences
 * 
 * 管理图表风格偏好，包括配色方案、节点形状、布局方向等。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * 配色方案
 */
export interface ColorScheme {
  primary: string;
  secondary: string;
  tertiary: string;
  data: string;
  line: string;
  bg: string;
  text: string;
}

/**
 * 场景参数（参考 svg-diagram-v3）
 */
export interface SceneParams {
  canvasWidth: number;
  canvasHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  nodeFontSize: number;
  nodeFontWeight: number;
  titleFontSize: number;
  lineWidth: number;
  outerMargin: number;
}

/**
 * 场景参数预设
 */
export const SCENE_PARAMS: Record<string, SceneParams> = {
  pptx: {
    canvasWidth: 1280,
    canvasHeight: 720,
    nodeWidth: 180,
    nodeHeight: 80,
    nodeFontSize: 18,
    nodeFontWeight: 600,
    titleFontSize: 28,
    lineWidth: 2.5,
    outerMargin: 60,
  },
  word: {
    canvasWidth: 680,
    canvasHeight: 900,
    nodeWidth: 140,
    nodeHeight: 60,
    nodeFontSize: 13,  // 保持与原来一致
    nodeFontWeight: 500,
    titleFontSize: 18,
    lineWidth: 1.5,
    outerMargin: 40,
  },
  generic: {
    canvasWidth: 1200,
    canvasHeight: 800,
    nodeWidth: 160,
    nodeHeight: 70,
    nodeFontSize: 14,
    nodeFontWeight: 500,
    titleFontSize: 22,
    lineWidth: 2,
    outerMargin: 60,
  },
};

/**
 * 图表风格配置
 */
export interface DiagramStyle {
  /** 配色方案: warm/cool/mono/custom */
  colorScheme: 'warm' | 'cool' | 'mono' | 'custom';
  /** 节点形状: rounded/sharp/pill */
  nodeShape: 'rounded' | 'sharp' | 'pill';
  /** 布局方向: top-to-bottom/left-to-right */
  layoutDirection: 'top-to-bottom' | 'left-to-right';
  /** 字体大小: compact/normal/spacious */
  fontSize: 'compact' | 'normal' | 'spacious';
  /** 目标场景: pptx/word/generic */
  scene: 'pptx' | 'word' | 'generic';
  /** 自定义颜色（当 colorScheme 为 custom 时使用） */
  customColors: ColorScheme | null;
  /**
   * 层级配色板：按 node.layer 索引取色，超出长度时循环。
   *
   * 从知识库 knowledge/diagrams/architecture-style.md 提取：
   *   接入层=蓝 / 业务应用层=绿 / 业务支撑层=橙 / 数据层=紫 / 基础设施层=灰
   *
   * 做成可配置数据而非硬编码，便于后续（方案 B）改为直接读知识库。
   * 缺省/为空时回退到 DEFAULT_LAYER_PALETTE。
   */
  layerPalette?: string[];
}

/**
 * 默认层级配色板（低饱和度企业色调，与实际层级顺序对应）
 *
 * 顺序即 layer 索引：0=接入层 1=应用层 2=支撑层 3=数据层 4=基础设施层
 */
export const DEFAULT_LAYER_PALETTE: string[] = [
  '#2563eb', // 蓝 —— 接入层
  '#16a34a', // 绿 —— 业务应用层
  '#ea580c', // 橙 —— 业务支撑层
  '#7c3aed', // 紫 —— 数据层
  '#64748b', // 灰 —— 基础设施层
];

/**
 * 跨平台中文字体回退链
 *
 * 历史事故：曾硬编码 'Microsoft YaHei, SimHei, sans-serif'，
 * 但这两个字体在 Linux 上不存在（fc-list 0 匹配），导致声明失效。
 * 本机有 80 个中文字体（Noto Sans CJK 等）却用不上。
 *
 * 顺序：Linux 可用 → macOS → Windows → 通用兜底。
 * 不带引号（避免 Windows 下的字体匹配问题）。
 */
export const CJK_FONT_FAMILY =
  'Noto Sans CJK SC, Source Han Sans SC, PingFang SC, Microsoft YaHei, SimHei, sans-serif';

/**
 * 预定义配色方案
 */
const COLOR_SCHEMES: Record<string, ColorScheme> = {
  warm: {
    primary: '#d97706',
    secondary: '#f59e0b',
    tertiary: '#fcd34d',
    data: '#78350f',
    line: '#a8a29e',
    bg: '#ffffff',
    text: '#292524',
  },
  cool: {
    primary: '#2563eb',
    secondary: '#3b82f6',
    tertiary: '#93c5fd',
    data: '#1e3a8a',
    line: '#94a3b8',
    bg: '#ffffff',
    text: '#1e293b',
  },
  mono: {
    primary: '#374151',
    secondary: '#6b7280',
    tertiary: '#d1d5db',
    data: '#111827',
    line: '#9ca3af',
    bg: '#ffffff',
    text: '#1f2937',
  },
};

/**
 * 获取默认风格配置
 */
export function getDefaultDiagramStyle(): DiagramStyle {
  return {
    colorScheme: 'warm',
    nodeShape: 'rounded',
    layoutDirection: 'top-to-bottom',
    fontSize: 'normal',
    scene: 'word',  // 默认使用 Word 场景（文档友好）
    customColors: null,
    layerPalette: [...DEFAULT_LAYER_PALETTE],
  };
}

/**
 * 解析层级配色板
 *
 * @param style 风格配置
 * @returns 非空配色板；未配置或为空时返回默认值
 */
export function getLayerPalette(style: DiagramStyle): string[] {
  const palette = style.layerPalette;
  if (!palette || palette.length === 0) {
    return DEFAULT_LAYER_PALETTE;
  }
  return palette;
}

/**
 * 获取配色方案
 * @param scheme 配色方案名称
 * @returns 配色方案对象，custom 返回 null
 */
export function getColorScheme(scheme: string): ColorScheme | null {
  if (scheme === 'custom') {
    return null;
  }
  return COLOR_SCHEMES[scheme] || COLOR_SCHEMES.warm;
}

/**
 * 加载风格配置
 * @param projectDir 项目目录
 * @returns 风格配置，文件不存在时返回默认值
 */
export function loadDiagramStyle(projectDir: string): DiagramStyle {
  const stylePath = join(projectDir, 'assets', 'diagram-style.json');
  
  if (!existsSync(stylePath)) {
    return getDefaultDiagramStyle();
  }
  
  try {
    const content = readFileSync(stylePath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // 合并默认值，确保所有字段存在
    const defaults = getDefaultDiagramStyle();
    return {
      colorScheme: parsed.colorScheme || defaults.colorScheme,
      nodeShape: parsed.nodeShape || defaults.nodeShape,
      layoutDirection: parsed.layoutDirection || defaults.layoutDirection,
      fontSize: parsed.fontSize || defaults.fontSize,
      scene: parsed.scene || defaults.scene,
      customColors: parsed.customColors || defaults.customColors,
      // 旧项目文件没有 layerPalette 字段 → 回退默认（避免升级后图表变单色）
      layerPalette:
        Array.isArray(parsed.layerPalette) && parsed.layerPalette.length > 0
          ? parsed.layerPalette
          : defaults.layerPalette,
    };
  } catch {
    return getDefaultDiagramStyle();
  }
}

/**
 * 保存风格配置
 * @param projectDir 项目目录
 * @param style 风格配置
 */
export function saveDiagramStyle(projectDir: string, style: DiagramStyle): void {
  const stylePath = join(projectDir, 'assets', 'diagram-style.json');
  const dir = dirname(stylePath);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(stylePath, JSON.stringify(style, null, 2), 'utf-8');
}

/**
 * 生成风格配置的人类可读描述
 */
export function describeDiagramStyle(style: DiagramStyle): string {
  const colorNames: Record<string, string> = {
    warm: '暖色系（橙色为主，适合技术方案）',
    cool: '冷色系（蓝色为主，适合互联网/科技）',
    mono: '黑白灰（适合正式文档/打印）',
    custom: '自定义',
  };
  
  const shapeNames: Record<string, string> = {
    rounded: '圆角矩形',
    sharp: '直角矩形',
    pill: '胶囊形',
  };
  
  const directionNames: Record<string, string> = {
    'top-to-bottom': '从上到下',
    'left-to-right': '从左到右',
  };
  
  const fontSizeNames: Record<string, string> = {
    compact: '紧凑',
    normal: '标准',
    spacious: '宽松',
  };

  const sceneNames: Record<string, string> = {
    pptx: 'PPTX 演示',
    word: 'Word 文档',
    generic: '通用',
  };
  
  return [
    `配色方案: ${colorNames[style.colorScheme] || style.colorScheme}`,
    `节点形状: ${shapeNames[style.nodeShape] || style.nodeShape}`,
    `布局方向: ${directionNames[style.layoutDirection] || style.layoutDirection}`,
    `字体大小: ${fontSizeNames[style.fontSize] || style.fontSize}`,
    `目标场景: ${sceneNames[style.scene] || style.scene}`,
  ].join('\n');
}
