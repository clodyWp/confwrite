
/**
 * 结构化图表格式解析（containers / nodes / edges）
 *
 * 为什么需要它
 * ------------
 * 写手实际产出的是**结构化 YAML**，比提示词教的散文格式丰富得多：
 *
 *   containers:                    ← 分组（知识库原则 1）
 *     - id: main
 *       label: 主流程
 *       nodes: [s1_accept, s2_grade]
 *   nodes:
 *     - id: s2_grade
 *       label: ② 分级判定            ← 短标签（原则 3 编号、原则 6 内短）
 *       container: main            ← 分组归属（原则 7）
 *       owner: 服务台 + 二线
 *       timing: 5 分钟内
 *       high_weight: true          ← 视觉权重（原则 2）
 *       detail: 按四级定义定级…      ← 详情外置（原则 6 外详）
 *   edges:
 *     - from: s1_accept
 *       to: s2_grade
 *       label: 登记完成后即判定等级
 *       direction: forward
 *       style: dashed
 *
 * 而渲染端此前只认散文 `description` —— 上面这些字段全部被丢掉，
 * 图退化成「散文里提到的几个方框」。
 *
 * 知识库 knowledge/diagrams/layout.md 的 7 条布局原则**每一条都有对应的
 * 写手字段**（见上面注释）。所以这个解析器不是"新加功能"，
 * 而是把知识库和写手之间已经断掉的链路接上。
 *
 * 实现说明
 * --------
 * 项目没有 YAML 依赖，而写手产出的结构是规整的（固定三个段、固定缩进），
 * 所以用手写解析器，顺带避免为一个字段格式引入整包依赖。
 * 关键规则只有一条：**块标量在缩进回落到顶层时结束** —— 这也是
 * extractor 那个「description 吞掉整块 YAML」事故的教训。
 */

/** 容器 */
export interface SpecContainer {
  id: string;
  label: string;
  /** 容器包含的节点 id（取自容器的 nodes 内联数组） */
  nodes: string[];
  /**
   * 是否为横切 / 贯穿型容器
   *
   * 这类容器不属于主流程的任何一层，而是横跨全程（如「贯穿动作」）。
   * 布局时必须单独处理（右侧竖条），不能当成普通层。
   */
  crosscut?: boolean;
}

/** 节点 */
export interface SpecNode {
  id: string;
  label: string;
  /** 所属容器 id */
  container?: string;
  /** 高权重（对应知识库原则 2，全图不超过 3 个） */
  highWeight?: boolean;
  /** 责任人（只用于正文/日志，不画进图） */
  owner?: string;
  /** 时限（同上） */
  timing?: string;
  /** 详细说明（同上） */
  detail?: string;
}

/** 连线 */
export interface SpecEdge {
  from: string;
  to: string;
  label?: string;
  direction: 'forward' | 'backward' | 'bidirectional';
  style: 'solid' | 'dashed' | 'dotted';
}

/** 规范化的图表结构 —— 两个解析器（结构化 YAML / 散文描述）的共同出口 */
export interface DiagramSpec {
  containers: SpecContainer[];
  nodes: SpecNode[];
  edges: SpecEdge[];
}

/**
 * 把散文解析结果（层名 + 连接）适配成 DiagramSpec
 *
 * 散文格式里每行写着「层名：节点1、节点2」，解析器给出的是
 * `{id, label, layer}`。新引擎需要的是 DiagramSpec，所以按 layer 分组，
 * 合成**无标签的容器** —— 容器只用于确定层序，不画框（render 会跳过空标签）。
 *
 * 散文格式已不再是推荐写法（写手提示词教的是结构化格式），但旧草稿和
 * 写手偶发的散文块仍然要能出图，所以要保留这条路。
 */
export function proseToSpec(
  nodes: Array<{ id: string; label: string; layer: number }>,
  connections: Array<{ from: string; to: string; label?: string }>,
): DiagramSpec {
  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node.id);
    byLayer.set(node.layer, list);
  }

  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const containers: SpecContainer[] = layers.map((layer, i) => ({
    id: `layer_${i}`,
    label: '', // 空标签 = 只分层、不画框
    nodes: byLayer.get(layer) ?? [],
  }));

  const idToContainer = new Map<string, string>();
  for (const c of containers) {
    for (const id of c.nodes) idToContainer.set(id, c.id);
  }

  return {
    containers,
    nodes: nodes.map(n => ({
      id: n.id,
      label: n.label,
      container: idToContainer.get(n.id),
    })),
    edges: connections.map(c => ({
      from: c.from,
      to: c.to,
      label: c.label,
      direction: 'forward' as const,
      style: 'solid' as const,
    })),
  };
}

type Section = 'containers' | 'nodes' | 'edges';

const SECTIONS: Section[] = ['containers', 'nodes', 'edges'];

/** 顶层键：不缩进、形如 `key:` */
const TOP_KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):/;
/** 列表项：`- key: value` */
const ITEM_RE = /^-\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;
/** 普通字段：`key: value` */
const FIELD_RE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;
/** 块标量标记 */
const BLOCK_SCALAR = new Set(['|', '|-', '|+', '>', '>-', '>+']);

/** 横切 / 贯穿型容器的语义关键词 */
const CROSSCUT_RE = /crosscut|贯穿|横切|全程|跨阶段|纵向支撑/i;

interface RawItem {
  fields: Map<string, string>;
}

/**
 * 块里是否存在结构化段
 *
 * 必须是**顶格**的段标题 —— 散文 description 里提到 `nodes:` 不算。
 */
/**
 * 按 **section 键的相对缩进** 归一化
 *
 * 不能用"整块去公共缩进"：提取出来的块以 `<!-- diagram-start` 开头，
 * 那一行没有前导空格，于是公共缩进算出来是 0，内部仍然缩进 ——
 * 实测 hasStructuredFormat 为 true 但解析出 0 个节点。
 *
 * 这里改用 containers/nodes/edges 三个键自己缩进量的**最小值**作基线，
 * 三种情形都能覆盖：块整体缩进、只有内部缩进、完全没缩进。
 */
function normalizeSections(raw: string): string {
  const lines = raw.split('\n');
  let base = Number.POSITIVE_INFINITY;

  for (const line of lines) {
    const m = /^([ \t]*)(containers|nodes|edges):[ \t]*$/.exec(line);
    if (m) base = Math.min(base, m[1].length);
  }

  if (!Number.isFinite(base) || base === 0) return raw;

  return lines
    .map(line => {
      const lead = /^[ \t]*/.exec(line)![0].length;
      return line.trim() === '' ? line : line.slice(Math.min(base, lead));
    })
    .join('\n');
}

export function hasStructuredFormat(rawContent: string): boolean {
  return /^[ \t]*(containers|nodes|edges):[ \t]*$/m.test(normalizeSections(rawContent));
}

/** 去掉包裹的引号 */
function clean(value: string | undefined): string {
  const t = (value ?? '').trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** 解析内联数组 `[a, b, c]` */
function parseInlineList(value: string | undefined): string[] {
  const t = (value ?? '').trim();
  if (!t.startsWith('[') || !t.endsWith(']')) return [];
  return t
    .slice(1, -1)
    .split(',')
    .map(s => clean(s))
    .filter(s => s.length > 0);
}

/** 收集三个段里的原始条目 */
function collectItems(rawContent: string): Record<Section, RawItem[]> {
  const collected: Record<Section, RawItem[]> = { containers: [], nodes: [], edges: [] };

  let section: Section | null = null;
  let current: RawItem | null = null;
  let block: { key: string; item: RawItem; indent: number; lines: string[] } | null = null;

  const flushItem = (): void => {
    if (section && current) collected[section].push(current);
    current = null;
  };
  const flushBlock = (): void => {
    if (block) {
      block.item.fields.set(block.key, block.lines.join('\n').trim());
      block = null;
    }
  };

  for (const raw of rawContent.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    // 空行：属于块标量时保留（多行 detail 里的段落分隔），否则忽略
    if (!trimmed) {
      if (block) block.lines.push('');
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // 块标量内容：只要缩进比键更深就继续收集
    if (block && indent > block.indent) {
      block.lines.push(trimmed);
      continue;
    }
    flushBlock();

    // 顶层键：开始新段，或（其他顶层键，如 description）结束当前段
    if (indent === 0) {
      const m = TOP_KEY_RE.exec(trimmed);
      flushItem();
      section = m && (SECTIONS as string[]).includes(m[1]) ? (m[1] as Section) : null;
      continue;
    }

    // 不在任何段里 —— 忽略（description 的散文内容就靠这条挡住）
    if (!section) continue;

    // 列表项
    const itemMatch = ITEM_RE.exec(trimmed);
    if (itemMatch) {
      flushItem();
      current = { fields: new Map() };
      const [, key, value] = itemMatch;
      if (BLOCK_SCALAR.has(value.trim())) {
        block = { key, item: current, indent, lines: [] };
      } else {
        current.fields.set(key, value.trim());
      }
      continue;
    }

    // 条目内的普通字段
    const fieldMatch = FIELD_RE.exec(trimmed);
    if (fieldMatch && current) {
      const [, key, value] = fieldMatch;
      if (BLOCK_SCALAR.has(value.trim())) {
        block = { key, item: current, indent, lines: [] };
      } else {
        current.fields.set(key, value.trim());
      }
      continue;
    }

    // 其他缩进内容（未识别的续行）—— 忽略，不让它污染字段
  }

  flushItem();
  flushBlock();

  return collected;
}

/**
 * 是否横切 / 贯穿型容器
 *
 * 写手没有显式标注（真实产出里只有 id: crosscut、label: 贯穿动作），
 * 所以按语义判定；同时支持写手以后显式写 `crosscut: true`。
 */
function isCrosscut(id: string, label: string, explicit?: string): boolean {
  if (explicit !== undefined) return explicit.trim() === 'true';
  return CROSSCUT_RE.test(`${id} ${label}`);
}

/** 解析方向，默认 forward */
function normalizeDirection(value: string | undefined): SpecEdge['direction'] {
  const v = clean(value).toLowerCase();
  if (v === 'backward' || v === 'reverse' || v === 'back') return 'backward';
  if (v === 'bidirectional' || v === 'both' || v === 'two-way') return 'bidirectional';
  return 'forward';
}

/** 解析线型，默认 solid */
function normalizeStyle(value: string | undefined): SpecEdge['style'] {
  const v = clean(value).toLowerCase();
  if (v === 'dashed' || v === 'dash') return 'dashed';
  if (v === 'dotted' || v === 'dot') return 'dotted';
  return 'solid';
}

/**
 * 解析结构化图表格式
 *
 * 没有结构化段时返回空结构（调用方应据此回退到散文解析器）。
 */
export function parseStructuredDiagram(rawContent: string): DiagramSpec {
  const raw = collectItems(normalizeSections(rawContent));

  // ---- 节点 ----
  const nodes: SpecNode[] = [];
  const seen = new Set<string>();

  for (const item of raw.nodes) {
    const id = clean(item.fields.get('id'));
    // 重复 id 只保留第一个：否则布局会画出两个重叠的框
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const label = clean(item.fields.get('label')) || id;
    const container = clean(item.fields.get('container'));
    const owner = clean(item.fields.get('owner'));
    const timing = clean(item.fields.get('timing'));
    const detail = clean(item.fields.get('detail'));

    nodes.push({
      id,
      label,
      container: container || undefined,
      owner: owner || undefined,
      timing: timing || undefined,
      detail: detail || undefined,
      // 只有明确的 true 才算高权重（false / 缺失都留空，避免噪声）
      highWeight: clean(item.fields.get('high_weight')).toLowerCase() === 'true' || undefined,
    });
  }

  // ---- 容器 ----
  const containers: SpecContainer[] = [];
  for (const item of raw.containers) {
    const id = clean(item.fields.get('id'));
    if (!id) continue;
    const label = clean(item.fields.get('label')) || id;

    // 容器声明的 nodes 只作补充：节点自己的 container 字段是权威来源
    const declared = parseInlineList(item.fields.get('nodes'));

    containers.push({
      id,
      label,
      nodes: declared,
      crosscut: isCrosscut(id, label, item.fields.get('crosscut')) || undefined,
    });
  }

  // 节点声明了 container 但容器没声明 —— 补一个隐式容器，避免节点无处归属
  for (const node of nodes) {
    if (!node.container) continue;
    if (containers.some(c => c.id === node.container)) continue;
    containers.push({ id: node.container, label: node.container, nodes: [] });
  }

  // 把节点按 container 回填进容器的 nodes 列表（以节点字段为准）
  for (const container of containers) {
    const members = nodes.filter(n => n.container === container.id).map(n => n.id);
    if (members.length > 0) container.nodes = members;
  }

  // ---- 连线 ----
  const edges: SpecEdge[] = [];
  for (const item of raw.edges) {
    const from = clean(item.fields.get('from'));
    const to = clean(item.fields.get('to'));
    // 丢弃悬空引用：否则布局引擎会拿到不存在的节点
    if (!seen.has(from) || !seen.has(to)) continue;

    const label = clean(item.fields.get('label'));
    edges.push({
      from,
      to,
      label: label || undefined,
      direction: normalizeDirection(item.fields.get('direction')),
      style: normalizeStyle(item.fields.get('style')),
    });
  }

  return { containers, nodes, edges };
}
