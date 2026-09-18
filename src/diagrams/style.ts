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
  /** 自定义颜色（当 colorScheme 为 custom 时使用） */
  customColors: ColorScheme | null;
}

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
    customColors: null,
  };
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
      customColors: parsed.customColors || defaults.customColors,
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
  
  return [
    `配色方案: ${colorNames[style.colorScheme] || style.colorScheme}`,
    `节点形状: ${shapeNames[style.nodeShape] || style.nodeShape}`,
    `布局方向: ${directionNames[style.layoutDirection] || style.layoutDirection}`,
    `字体大小: ${fontSizeNames[style.fontSize] || style.fontSize}`,
  ].join('\n');
}
