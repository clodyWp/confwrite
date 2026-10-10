/**
 * 从知识库文件提取图表配置参数
 *
 * D3: 图表知识库输入
 *
 * 优先级：assets/diagram-style.json > knowledge frontmatter > 代码默认值
 *
 * 本模块负责从知识库 markdown 文件的 frontmatter 中解析 diagramConfig 配置：
 *   - architecture-style.md → layerPalette（层级配色板）
 *   - layout.md → layoutConstraints（布局约束参数）
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 从知识库提取的图表配置 */
export interface KnowledgeDiagramConfig {
  layerPalette?: string[];
  layoutConstraints?: KnowledgeLayoutConstraints;
}

/** 从知识库提取的布局约束 */
export interface KnowledgeLayoutConstraints {
  maxWidth?: number;
  maxHeight?: number;
  maxAspectRatio?: number;
  maxConnectionRatio?: number;
  minFontRatio?: number;
  minNodeGap?: number;
  minGroupGapRatio?: number;
}

/**
 * 从 markdown 内容中解析层级配色表格
 *
 * 支持格式：
 *   | 层级 | 颜色 |
 *   |------|------|
 *   | 接入层 | #2563eb |
 *
 * 提取所有 hex 颜色值（支持带引号或不带引号）。
 *
 * @param content markdown 内容
 * @returns 配色数组，无配色表格时返回 null
 */
export function parseLayerPaletteFromMarkdown(content: string): string[] | null {
  // 查找 markdown 表格中的 hex 颜色
  const hexPattern = /(?:^|\|)\s*['"]?(#[0-9a-fA-F]{6})['"]?\s*(?:\||$)/gm;
  const colors: string[] = [];
  let match;

  // 先确认存在表格（至少有一行包含 |---|）
  if (!/\|[\s-]*-[\s-]*\|/.test(content)) {
    return null;
  }

  while ((match = hexPattern.exec(content)) !== null) {
    const color = match[1];
    if (color) {
      colors.push(color);
    }
  }

  return colors.length > 0 ? colors : null;
}

/**
 * 从知识库 architecture-style.md 提取层级配色
 *
 * @param projectDir 项目根目录
 * @returns 配色数组，不存在时返回 null
 */
export function extractLayerPaletteFromKnowledge(projectDir: string): string[] | null {
  const archStylePath = join(projectDir, 'knowledge', 'diagrams', 'architecture-style.md');
  if (!existsSync(archStylePath)) {
    return null;
  }

  try {
    const content = readFileSync(archStylePath, 'utf-8');
    const frontmatter = parseFrontmatterYaml(content);

    // 优先从 frontmatter 的 diagramConfig.layerPalette 读取
    const diagramConfig = frontmatter?.diagramConfig as Record<string, unknown> | undefined;
    const palette = diagramConfig?.layerPalette;
    if (Array.isArray(palette) && palette.length > 0) {
      return palette.map(String);
    }

    // 回退：从 markdown 表格提取
    return parseLayerPaletteFromMarkdown(content);
  } catch {
    return null;
  }
}

/**
 * 从知识库 layout.md 提取布局约束
 *
 * @param projectDir 项目根目录
 * @returns 布局约束，不存在时返回 null
 */
export function extractLayoutConstraints(projectDir: string): KnowledgeLayoutConstraints | null {
  const layoutPath = join(projectDir, 'knowledge', 'diagrams', 'layout.md');
  if (!existsSync(layoutPath)) {
    return null;
  }

  try {
    const content = readFileSync(layoutPath, 'utf-8');
    const frontmatter = parseFrontmatterYaml(content);
    const diagramConfig = frontmatter?.diagramConfig as Record<string, unknown> | undefined;
    const constraints = diagramConfig?.layoutConstraints as Record<string, unknown> | undefined;

    if (!constraints || typeof constraints !== 'object') {
      return null;
    }

    const result: KnowledgeLayoutConstraints = {};
    if (typeof constraints.maxWidth === 'number') result.maxWidth = constraints.maxWidth;
    if (typeof constraints.maxHeight === 'number') result.maxHeight = constraints.maxHeight;
    if (typeof constraints.maxAspectRatio === 'number') result.maxAspectRatio = constraints.maxAspectRatio;
    if (typeof constraints.maxConnectionRatio === 'number') result.maxConnectionRatio = constraints.maxConnectionRatio;
    if (typeof constraints.minFontRatio === 'number') result.minFontRatio = constraints.minFontRatio;
    if (typeof constraints.minNodeGap === 'number') result.minNodeGap = constraints.minNodeGap;
    if (typeof constraints.minGroupGapRatio === 'number') result.minGroupGapRatio = constraints.minGroupGapRatio;

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * 加载知识库图表配置
 *
 * @param projectDir 项目根目录
 * @returns 知识库图表配置
 */
export function loadKnowledgeDiagramConfig(projectDir: string): KnowledgeDiagramConfig {
  const config: KnowledgeDiagramConfig = {};

  const palette = extractLayerPaletteFromKnowledge(projectDir);
  if (palette) {
    config.layerPalette = palette;
  }

  const constraints = extractLayoutConstraints(projectDir);
  if (constraints) {
    config.layoutConstraints = constraints;
  }

  return config;
}

// ---- 内部工具：简易 YAML frontmatter 解析 ----

/**
 * 从 markdown 内容提取并解析 frontmatter
 *
 * 支持简易 YAML 子集：
 *   - 标量值（字符串、数字、布尔）
 *   - 嵌套对象（缩进 2 空格）
 *   - 数组（- item 语法）
 *   - 引号包裹的字符串
 */
function parseFrontmatterYaml(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yamlText = match[1];
  return parseYamlBlock(yamlText);
}

/**
 * 解析一个 YAML 文本块为嵌套对象
 */
function parseYamlBlock(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  return parseLines(lines, 0, 0).value;
}

interface ParseResult {
  value: Record<string, unknown>;
  nextLine: number;
}

/**
 * 递归解析 YAML 行，基于缩进构建嵌套结构
 */
function parseLines(lines: string[], startLine: number, baseIndent: number): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];

    // 跳过空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 计算当前行缩进
    const indent = line.length - line.trimStart().length;

    // 如果缩进小于基准，说明回到了上一层
    if (indent < baseIndent) {
      break;
    }

    const trimmed = line.trim();

    // 跳过注释
    if (trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // key: value 格式
    const colonMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (colonMatch) {
      const key = colonMatch[1];
      const valueStr = colonMatch[2].trim();

      if (valueStr === '' || valueStr === '') {
        // 值为空 → 下一层嵌套对象或数组
        // 查看下一行判断是数组还是对象
        const nextNonEmpty = findNextNonEmpty(lines, i + 1);
        if (nextNonEmpty !== -1) {
          const nextTrimmed = lines[nextNonEmpty].trim();
          if (nextTrimmed.startsWith('- ') || nextTrimmed === '-') {
            // 数组
            const arrResult = parseArray(lines, nextNonEmpty, indent + 2);
            result[key] = arrResult.value;
            i = arrResult.nextLine;
          } else {
            // 嵌套对象
            const nested = parseLines(lines, i + 1, indent + 2);
            result[key] = nested.value;
            i = nested.nextLine;
          }
        } else {
          result[key] = null;
          i++;
        }
      } else {
        // 有值
        result[key] = parseYamlValue(valueStr);
        i++;
      }
    } else {
      i++;
    }
  }

  return { value: result, nextLine: i };
}

/**
 * 解析 YAML 数组（- item 语法）
 */
function parseArray(lines: string[], startLine: number, _expectedIndent: number): { value: unknown[]; nextLine: number } {
  const arr: unknown[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // 如果不再是数组项且缩进小于等于父级，结束
    if (!trimmed.startsWith('- ') && trimmed !== '-') {
      break;
    }

    // 提取数组项值
    const itemValue = trimmed === '-' ? '' : trimmed.slice(2).trim();
    arr.push(parseYamlValue(itemValue));
    i++;
  }

  return { value: arr, nextLine: i };
}

/**
 * 解析 YAML 标量值
 */
function parseYamlValue(value: string): unknown {
  // 去除引号
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }

  // 去除行内注释
  const commentIdx = value.indexOf(' #');
  const cleanValue = commentIdx >= 0 ? value.slice(0, commentIdx).trim() : value;

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(cleanValue)) {
    return Number(cleanValue);
  }

  // 布尔
  if (cleanValue === 'true') return true;
  if (cleanValue === 'false') return false;

  // null
  if (cleanValue === 'null' || cleanValue === '~') return null;

  return cleanValue;
}

/**
 * 查找下一个非空行
 */
function findNextNonEmpty(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() !== '') return i;
  }
  return -1;
}
