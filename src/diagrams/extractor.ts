/**
 * Diagram Extractor
 * 
 * 从 Markdown 内容中提取图表描述块。
 * 支持 diagram-start/end 语义标记格式。
 */

/**
 * 图表格式类型
 */
export type DiagramFormat = 'mermaid' | 'yaml' | 'steps' | 'ascii' | 'unknown';

/**
 * 图表类型
 */
export type DiagramType = 'architecture' | 'flow' | 'concept' | 'relation' | 'timeline' | 'diagram';

/**
 * 提取出的图表块
 */
export interface DiagramBlock {
  /** 章节 ID */
  chapterId: string;
  /** 图表在章节内的索引（从 0 开始） */
  index: number;
  /** 图表类型 */
  type: DiagramType;
  /** 图表标题 */
  title: string;
  /** 图表描述内容 */
  description: string;
  /** 原始标记内容（不含 diagram-start/end 标记本身） */
  rawContent: string;
  /**
   * 完整的匹配文本（含 diagram-start/end 或 ``` 围栏本身）
   *
   * 注入器用它做精确替换（Bug 33）—— 两端必须用同一套块定位逻辑，
   * 否则提取器认的格式注入器不认，图就永远进不了文档。
   */
  rawBlock: string;
  /** 检测到的内部格式 */
  format: DiagramFormat;
}

/**
 * diagram-start/end 标记正则
 * 
 * 匹配格式：
 * <!-- diagram-start
 * type: architecture
 * title: 系统架构
 * description: |
 *   描述内容
 * diagram-end -->
 */
const DIAGRAM_BLOCK_RE = /<!--\s*diagram-start\s*\n([\s\S]*?)\n\s*diagram-end\s*-->/g;

/**
 * mermaid 代码块正则（向后兼容）
 * 
 * 匹配格式：
 * ```mermaid
 * graph TD
 *     A --> B
 * ```
 */
const MERMAID_BLOCK_RE = /```mermaid\s*\n([\s\S]*?)```/g;

/**
 * 从 Markdown 内容中提取所有图表块
 * 
 * 支持两种格式：
 * 1. diagram-start/end 标记（新格式）
 * 2. mermaid 代码块（向后兼容）
 * 
 * @param content Markdown 内容
 * @param chapterId 章节 ID
 * @returns 图表块数组
 */
export function extractDiagrams(content: string, chapterId: string): DiagramBlock[] {
  // 两种格式一次扫描、按**出现位置**排序后统一编号（Bug 33）。
  //
  // 原实现先给所有 diagram-start 编号（0..n-1），再给 mermaid 编号
  // （n..n+m-1）—— 于是当 mermaid 块出现在文档靠前位置时，fig1 指向的
  // 并不是文档里第一个图表。生成与注入两端都依赖这套编号，一旦错位
  // 就会「图生成了但对不上位置」。
  type Hit = { pos: number; block: Omit<DiagramBlock, 'index'> };
  const hits: Hit[] = [];

  DIAGRAM_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = DIAGRAM_BLOCK_RE.exec(content)) !== null) {
    const rawContent = match[1].trim();
    const parsed = parseDiagramBlock(rawContent);

    hits.push({
      pos: match.index,
      block: {
        chapterId,
        type: parsed.type,
        title: parsed.title,
        description: parsed.description,
        rawContent,
        format: detectFormat(parsed.description),
        rawBlock: match[0],
      },
    });
  }

  MERMAID_BLOCK_RE.lastIndex = 0;
  while ((match = MERMAID_BLOCK_RE.exec(content)) !== null) {
    const mermaidCode = match[1].trim();

    hits.push({
      pos: match.index,
      block: {
        chapterId,
        type: 'diagram',
        title: '', // 无标题，编号确定后回填为「图表 N」
        description: mermaidCode,
        rawContent: mermaidCode,
        format: 'mermaid',
        rawBlock: match[0],
      },
    });
  }

  hits.sort((a, b) => a.pos - b.pos);

  return hits.map((h, i) => ({
    ...h.block,
    index: i,
    title: h.block.title || `图表 ${i + 1}`,
  }));
}

/**
 * 解析图表块内容
 * 
 * 提取 type、title、description 字段
 */
function parseDiagramBlock(rawContent: string): {
  type: DiagramType;
  title: string;
  description: string;
} {
  let type: DiagramType = 'diagram';
  let title = '图表';
  let description = '';

  const lines = rawContent.split('\n');
  let inDescription = false;
  const descLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('type:')) {
      const value = trimmed.slice(5).trim();
      if (isValidDiagramType(value)) {
        type = value;
      }
    } else if (trimmed.startsWith('title:')) {
      title = trimmed.slice(6).trim() || '图表';
    } else if (trimmed.startsWith('description:')) {
      inDescription = true;
      // 检查是否有内联值（非 | 多行格式）
      const inlineValue = trimmed.slice(12).trim();
      if (inlineValue && inlineValue !== '|') {
        description = inlineValue;
        inDescription = false;
      }
    } else if (inDescription) {
      // 多行描述内容
      if (trimmed === '|') continue; // 跳过 | 标记
      descLines.push(trimmed);
    }
  }

  if (descLines.length > 0) {
    description = descLines.join('\n');
  }

  return { type, title, description };
}

/**
 * 检查是否为有效的图表类型
 */
function isValidDiagramType(value: string): value is DiagramType {
  const validTypes: DiagramType[] = ['architecture', 'flow', 'concept', 'relation', 'timeline', 'diagram'];
  return validTypes.includes(value as DiagramType);
}

/**
 * 检测图表描述的内部格式
 * 
 * 按优先级检测：
 * 1. Mermaid: 包含 --> 或 subgraph
 * 2. YAML: 包含 layout: 或 items: 或 steps:
 * 3. Steps: 包含 "1. xxx →" 模式
 * 4. ASCII: 包含 ┌┐└┘│─ 等边框字符
 * 5. Unknown: 无法识别
 * 
 * @param description 图表描述内容
 * @returns 检测到的格式
 */
export function detectFormat(description: string): DiagramFormat {
  if (!description || description.trim().length === 0) {
    return 'unknown';
  }

  // 1. Mermaid 检测
  if (/-->/.test(description) || /subgraph/i.test(description) || /^graph\s+(TD|LR|RL|BT)/m.test(description)) {
    return 'mermaid';
  }

  // 2. YAML 检测
  if (/layout\s*:/i.test(description) || /items\s*:/i.test(description) || /steps\s*:/i.test(description)) {
    return 'yaml';
  }

  // 3. Steps 检测（数字 + 箭头）
  if (/\d+\.\s*.+→/.test(description)) {
    return 'steps';
  }

  // 4. ASCII art 检测
  const asciiChars = /[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═║─│→▼▲◀▶←↓↑↕↔]/;
  if (asciiChars.test(description)) {
    return 'ascii';
  }

  return 'unknown';
}

/**
 * 从章节文件中提取所有图表（文件级 API）
 * 
 * @param filePath 章节文件路径
 * @param content 文件内容
 * @returns 图表块数组
 */
export function extractDiagramsFromFile(filePath: string, content: string): DiagramBlock[] {
  // 从文件名提取章节 ID
  const match = filePath.match(/(ch\d+)/);
  const chapterId = match ? match[1] : 'unknown';
  
  return extractDiagrams(content, chapterId);
}
