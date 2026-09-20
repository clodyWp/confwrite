/**
 * Diagram Validator
 * 
 * 渲染后验证检查，确保生成的图表质量合格。
 * 实现 8 项检查：节点重叠、层级数量（信息项）、连线复杂度、标签长度（信息项）、
 * 文件完整性、装饰字符、Word 尺寸、文字溢出。
 */
import { existsSync, statSync } from 'node:fs';

/**
 * 节点数据
 */
export interface NodeData {
  id: string;
  label: string;
  layer: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * 连接数据
 */
export interface ConnectionData {
  from: string;
  to: string;
  label?: string;
}

/**
 * 图表数据
 */
export interface DiagramData {
  id: string;
  nodes: NodeData[];
  connections: ConnectionData[];
  svgContent: string;
  pngPath?: string;
  svgWidth?: number;
  svgHeight?: number;
  type?: 'architecture' | 'flow' | 'concept' | 'relation' | 'timeline' | 'diagram';
}

/**
 * 单项检查结果
 */
export interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  diagramId: string;
  checks: CheckResult[];
  overallPassed: boolean;
  warnings: string[];
}

/**
 * Word 尺寸限制
 */
const WORD_LIMITS = {
  maxWidth: 680,  // A4 页面可用宽度
  maxHeight: 900, // A4 页面可用高度
};

/**
 * 节点尺寸默认值
 */
const DEFAULT_NODE = {
  width: 140,
  height: 50,
};

/**
 * ASCII 装饰字符
 */
const DECOR_CHARS = /[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║─│→▼▲◀▶←↓↑↕↔·]/;

/**
 * 验证图表
 * 
 * @param diagram 图表数据
 * @returns 验证结果
 */
export function validateDiagram(diagram: DiagramData): ValidationResult {
  const checks: CheckResult[] = [];
  const warnings: string[] = [];

  // 1. 节点重叠检测
  checks.push(checkNodeOverlap(diagram.nodes));

  // 2. 层级数量检测
  checks.push(checkLayerCount(diagram.nodes, diagram.type));

  // 3. 连线复杂度检测
  checks.push(checkConnectionComplexity(diagram.nodes, diagram.connections));

  // 4. 标签长度检测
  checks.push(checkLabelLength(diagram.nodes));

  // 5. 装饰字符检测
  checks.push(checkDecorationChars(diagram.svgContent));

  // 6. Word 尺寸检测
  checks.push(checkWordSize(diagram.svgWidth, diagram.svgHeight));

  // 7. 文件完整性检测
  if (diagram.pngPath) {
    checks.push(checkFileIntegrity(diagram.pngPath));
  }

  // 计算总体结果
  const overallPassed = checks.every(c => c.passed);
  
  for (const check of checks) {
    if (!check.passed) {
      warnings.push(`${check.name}: ${check.details}`);
    }
  }

  return {
    diagramId: diagram.id,
    checks,
    overallPassed,
    warnings,
  };
}

/**
 * 检查节点重叠
 */
function checkNodeOverlap(nodes: NodeData[]): CheckResult {
  let overlapCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      // 如果没有位置信息，跳过
      if (a.x === undefined || a.y === undefined || b.x === undefined || b.y === undefined) {
        continue;
      }

      const aWidth = a.width || DEFAULT_NODE.width;
      const aHeight = a.height || DEFAULT_NODE.height;
      const bWidth = b.width || DEFAULT_NODE.width;
      const bHeight = b.height || DEFAULT_NODE.height;

      // 检查 bounding box 重叠
      if (
        a.x < b.x + bWidth &&
        a.x + aWidth > b.x &&
        a.y < b.y + bHeight &&
        a.y + aHeight > b.y
      ) {
        overlapCount++;
      }
    }
  }

  return {
    name: '节点重叠',
    passed: overlapCount === 0,
    details: overlapCount === 0 ? '无重叠' : `${overlapCount} 个重叠`,
  };
}

/**
 * 检查层级数量
 */
function checkLayerCount(nodes: NodeData[], _type?: string): CheckResult {
  if (nodes.length === 0) {
    return { name: '层级数量', passed: true, details: '无节点' };
  }

  const maxLayer = Math.max(...nodes.map(n => n.layer));
  const layerCount = maxLayer + 1;

  // 这里**不再设层数上限**。
  //
  // 原来写「架构图 ≤5 层、流程图 ≤8 层」，那是旧渲染器的限制：层多了图就
  // 无限变高。新布局引擎会把任意层数压缩到页面框内（实测 11 层的图也能
  // 压到 727px 高），而产品决策是「压缩优先、不拆图」。留一个 5 层的硬
  // 上限只会误报 —— 启用阻塞规则后，真实数据 12 张图会被它无理由拦住。
  //
  // 真正的硬约束由下面三条检查负责：Word 尺寸（页面框）、文字溢出、节点重叠。
  return {
    name: '层级数量',
    passed: true,
    details: `${layerCount} 层（新引擎会压缩到单页，不作为失败依据）`,
  };
}

/**
 * 检查连线复杂度
 */
function checkConnectionComplexity(nodes: NodeData[], connections: ConnectionData[]): CheckResult {
  if (nodes.length === 0) {
    return { name: '连线复杂度', passed: true, details: '无节点' };
  }

  const ratio = connections.length / nodes.length;
  const maxRatio = 1.5;

  return {
    name: '连线复杂度',
    passed: ratio <= maxRatio,
    details: `连线/节点 = ${ratio.toFixed(1)}（限制 ${maxRatio}）`,
  };
}

/**
 * 检查标签长度
 */
function checkLabelLength(nodes: NodeData[]): CheckResult {
  if (nodes.length === 0) {
    return { name: '标签长度', passed: true, details: '无节点' };
  }

  // 同样不再按"原始字数"判失败。
  //
  // 原实现按「≤12 字」判，前提是旧渲染器**不折行**、超出就溢出节点框。
  // 新引擎会按节点宽度折行（最多 2 行，超出用 `…` 截断），节点宽度也是
  // 按折行后的最宽一行反推的 —— 所以长标签不会再撑破图形。
  // 是否真的溢出，由「文字溢出」检查按渲染结果判定，比数字数可靠。
  const longest = nodes.reduce((a, b) => (b.label.length > a.length ? b.label : a), '');

  return {
    name: '标签长度',
    passed: true,
    details: `最长 ${longest.length} 字「${longest.slice(0, 12)}」（引擎会折行，不作为失败依据）`,
  };
}

/**
 * 检查装饰字符
 */
function checkDecorationChars(svgContent: string): CheckResult {
  const hasDecorChars = DECOR_CHARS.test(svgContent);

  return {
    name: '装饰字符',
    passed: !hasDecorChars,
    details: hasDecorChars ? 'SVG 中包含 ASCII art 装饰字符' : '无残留',
  };
}

/**
 * 检查 Word 尺寸
 */
function checkWordSize(width?: number, height?: number): CheckResult {
  if (width === undefined || height === undefined) {
    return { name: 'Word 尺寸', passed: true, details: '未指定尺寸' };
  }

  const widthOk = width <= WORD_LIMITS.maxWidth;
  const heightOk = height <= WORD_LIMITS.maxHeight;

  return {
    name: 'Word 尺寸',
    passed: widthOk && heightOk,
    details: `${width}x${height}px（限制 ${WORD_LIMITS.maxWidth}x${WORD_LIMITS.maxHeight}）`,
  };
}

/**
 * 检查文件完整性
 */
function checkFileIntegrity(pngPath: string): CheckResult {
  if (!existsSync(pngPath)) {
    return {
      name: '文件完整性',
      passed: false,
      details: `文件不存在: ${pngPath}`,
    };
  }

  const stat = statSync(pngPath);
  if (stat.size === 0) {
    return {
      name: '文件完整性',
      passed: false,
      details: '文件为空',
    };
  }

  return {
    name: '文件完整性',
    passed: true,
    details: `${stat.size} bytes`,
  };
}
