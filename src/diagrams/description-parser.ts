/**
 * 图表描述解析
 *
 * 把 diagram-start 标记里的 description 文本解析为节点与连接。
 *
 * 格式规范见 src/writing/task-executor.ts 的「图表格式」示例：
 *
 *   description: |
 *     三层架构：                              ← 分段标题（全角冒号）
 *     - 客户端层：Web 浏览器、移动端 App        ← 层定义（名称：子项）
 *     - 服务层：API Gateway、用户服务           ← 层定义
 *     - 数据层：MySQL 主从、Redis 集群          ← 层定义
 *     连接关系：                              ← 分段标题
 *     - 客户端 → API Gateway（HTTP/HTTPS）      ← 连接（支持多跳）
 *
 * 历史事故（本次修复的三个 bug）：
 *   Bug 19  分段标题只认半角冒号 `:`，不认中文全角 `：`
 *           ch003 描述里 4 个分段标题命中 0 个 → 所有节点 layer 恒为 0
 *           → 分层配色完全失效（生成 29 张图全都只有一个填充色）
 *   Bug 20  「连接」分支在「列表项」分支之前且未剥离列表前缀
 *           `- 接入层 → 网关层` 的 fromLabel 变成 `- 接入层`
 *           → 图中大量标签带 `- ` 前缀
 *   Bug 21  多跳链只解析出首尾一条边
 *           `A → B → C → D` 被当成 `A → "B → C → D"`
 *
 * 另两个精度问题（一并修复）：
 *   - 链上节点挤在同一层（应用 layer+i 逐层递进）
 *   - `A → B（注解）` 把「B（注解）」当成新节点，产生重复节点；
 *     正确做法是复用已有节点 B，并把「注解」作为边的 label
 *     （ParsedConnection.label 此前从未被赋值）
 */

/** 解析后的节点 */
export interface ParsedNode {
  id: string;
  label: string;
  /** 层级索引，从 0 开始；用于分层配色与纵向排布 */
  layer: number;
}

/** 解析后的连接 */
export interface ParsedConnection {
  from: string;
  to: string;
  label?: string;
}

/** 解析输入 */
export interface ParseDescriptionInput {
  description: string;
  title?: string;
}

/** 解析结果 */
export interface ParsedDiagram {
  nodes: ParsedNode[];
  connections: ParsedConnection[];
}

/** 列表项前缀：`- ` 或 `* ` */
const LIST_PREFIX_RE = /^[-*]\s+(.*)$/;

/** 分段标题：整行只有「名称」+ 冒号（半角或全角） */
const SECTION_HEADER_RE = /^[^:：]+[:：]\s*$/;

/** 层/项定义：`名称：子项列表`（名称本身不含冒号） */
const DEFINITION_RE = /^([^:：]+)[：:]\s*(.+)$/;

/** 箭头（全角 → 与半角 ->） */
const ARROW_RE = /\s*(?:→|->)\s*/;

/** 尾部括号注解：`名称（注解）` 或 `名称(注解)` */
const TRAILING_ANNOTATION_RE = /^(.*?)[（(]([^（()）]+)[）)]\s*$/;

/** 清洗标签：去首尾空白，并防御性剥掉可能残留的列表前缀 */
function normalizeLabel(raw: string): string {
  let label = raw.trim();
  const m = label.match(LIST_PREFIX_RE);
  if (m) label = m[1].trim();
  return label;
}

/**
 * 拆分尾部括号注解
 *
 * `网关层（HTTPS/WSS/MQTT）` → { name: '网关层', annotation: 'HTTPS/WSS/MQTT' }
 * `网关层` → { name: '网关层' }
 */
function splitAnnotation(label: string): { name: string; annotation?: string } {
  const m = label.match(TRAILING_ANNOTATION_RE);
  if (!m) return { name: label };
  const name = m[1].trim();
  const annotation = m[2].trim();
  if (!name || !annotation) return { name: label };
  return { name, annotation };
}

/**
 * 把一行内容按箭头拆成多跳标签
 *
 * @returns 长度 < 2 表示不是连接关系
 */
function splitChain(content: string): string[] {
  return content
    .split(ARROW_RE)
    .map(s => normalizeLabel(s))
    .filter(s => s.length > 0);
}

/**
 * 解析图表描述为节点与连接
 */
export function parseDiagramDescription(input: ParseDescriptionInput): ParsedDiagram {
  const nodes: ParsedNode[] = [];
  const connections: ParsedConnection[] = [];
  const nodeMap = new Map<string, string>();

  /** 获取或创建节点；已存在则返回原 id（不改变其层级） */
  const getOrCreateNode = (label: string, layer: number): string => {
    const clean = normalizeLabel(label);
    const existing = nodeMap.get(clean);
    if (existing !== undefined) return existing;

    const id = `node-${nodes.length + 1}`;
    nodes.push({ id, label: clean, layer });
    nodeMap.set(clean, id);
    return id;
  };

  /**
   * 解析连接端点：剥离尾部括号注解，并优先复用已有节点
   *
   * 避免 `接入层 → 网关层（HTTPS/WSS/MQTT）` 产生一个多余的
   * 「网关层（HTTPS/WSS/MQTT）」新节点。
   */
  const resolveEndpoint = (label: string, layer: number): { id: string; annotation?: string } => {
    const { name, annotation } = splitAnnotation(normalizeLabel(label));
    const existing = nodeMap.get(name);
    const id = existing !== undefined ? existing : getOrCreateNode(name, layer);
    return annotation ? { id, annotation } : { id };
  };

  let layer = 0;

  for (const rawLine of input.description.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === '|') continue;

    // 先剥离列表前缀 —— 后续所有分支都在「无前缀」的内容上工作（Bug 20）
    const listMatch = trimmed.match(LIST_PREFIX_RE);
    const isListItem = listMatch !== null;
    const content = normalizeLabel(isListItem ? listMatch![1] : trimmed);
    if (!content) continue;

    // 分段标题：只起组织作用，让后续内容从新的一层开始（Bug 19：
    // 中文描述普遍使用全角冒号，此前完全识别不到）
    if (SECTION_HEADER_RE.test(content)) {
      layer++;
      continue;
    }

    // 连接关系：支持多跳 A → B → C，链上节点逐层递进（Bug 21）
    const hops = splitChain(content);
    if (hops.length >= 2) {
      for (let i = 0; i < hops.length - 1; i++) {
        const from = resolveEndpoint(hops[i], layer + i);
        const to = resolveEndpoint(hops[i + 1], layer + i + 1);
        const label = to.annotation ?? from.annotation;
        connections.push(label ? { from: from.id, to: to.id, label } : { from: from.id, to: to.id });
      }
      continue;
    }

    // 层/项定义：`- 层名：子项列表`
    // 形如 `- 接入层：Web SPA、移动端 APP` —— 独占一层（对应知识库的
    // 「按层分色」：接入蓝/应用绿/支撑橙/数据紫/基础灰）
    const definition = isListItem ? content.match(DEFINITION_RE) : null;
    if (definition) {
      getOrCreateNode(definition[1], layer);
      layer++;
      continue;
    }

    // 普通列表项：落在当前层
    if (isListItem) {
      getOrCreateNode(content, layer);
      continue;
    }

    // 既不是标题、连接，也不是列表项 —— 忽略（避免把叙述段落当节点）
  }

  // 兜底：没有任何节点时，用标题创建一个
  if (nodes.length === 0) {
    nodes.push({
      id: 'node-1',
      label: normalizeLabel(input.title || '图表'),
      layer: 0,
    });
  }

  return { nodes, connections };
}
