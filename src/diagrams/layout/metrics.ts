/**
 * 尺寸解算
 *
 * 目标（用户确认）：
 *   · 不拆图 —— 用压缩保证整体性
 *   · 压缩顺序：先压边距 → 再压字号
 *   · 两个硬约束：
 *       字号 / 画布宽 ≥ 1.9%   （Word 里缩到 14.8cm 宽后 ≥ 8pt 可读）
 *       画布高 / 画布宽 ≤ 1.5  （不超一页）
 *
 * 两个约束联立可以解出设计包线：
 *
 *   字号/宽 ≥ 0.019  →  宽 ≤ 字号 / 0.019
 *   13px 字号 → 宽 ≤ 684px         ← 正好是知识库的 680px
 *   宽 = 680 → 高 ≤ 1020px         ← 知识库说 900px（更保守）
 *
 * 所以策略是：**画布宽封顶 680px，过宽的层折成多行** —— 可读性自动达标，
 * 剩下只需控制高度。真机数据里最宽的层是 9 个节点并排（Kubernetes 部署拓扑），
 * 9 × 190px = 1710px 在 680px 里必须折成 3 行。
 *
 * 注意：本模块只做几何，不产出任何坐标 —— 坐标由 render 阶段决定。
 */

/** 画布宽上限（知识库 680px 的可读性推导一致） */
export const TARGET_WIDTH = 680;

/** 高宽比上限（超过就会在 Word 里跨页） */
export const MAX_ASPECT_RATIO = 1.5;

/** 字号占画布宽的最小比例（低于此值在 Word 里小于 8pt） */
export const MIN_FONT_RATIO = 0.019;

/** 压缩下限：压到这些值就不再压，交给校验器判定阻塞 */
const MIN_MARGIN = 12;
const MIN_LAYER_GAP = 12;
const MIN_FONT_SIZE = 9;

/** 间距与字号参数 */
export interface LayoutMetrics {
  fontSize: number;
  /** 节点内左右留白 */
  paddingX: number;
  /** 节点内上下留白 */
  paddingY: number;
  minNodeWidth: number;
  /** 单行标签的宽度上限，超过就折行（否则节点会宽到挤掉整层） */
  maxNodeWidth: number;
  /** 同一行内相邻节点的间距 */
  rowGap: number;
  /** 层内折行之间的间距 */
  subRowGap: number;
  /** 层与层之间的间距（也是连线通道） */
  layerGap: number;
  /** 画布边距 */
  margin: number;
  /** 容器边框到内部节点的留白 */
  containerPad: number;
  /** 容器标签占用的高度 */
  containerLabelHeight: number;
}

export const DEFAULT_METRICS: LayoutMetrics = {
  fontSize: 13,
  paddingX: 10,
  paddingY: 10,
  minNodeWidth: 96,
  maxNodeWidth: 220,
  rowGap: 20,
  subRowGap: 16,
  layerGap: 40,
  margin: 32,
  containerPad: 14,
  containerLabelHeight: 22,
};

/**
 * 文本像素宽
 *
 * CJK / 全角标点按 1em，ASCII 按约 0.55em。
 * 不做字体度量（拿不到真实字形宽度），但这个近似已经足够
 * 决定"框要不要加宽"。
 */
export function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += isWide(ch) ? fontSize : fontSize * 0.55;
  }
  return width;
}

/** 是否宽字符（CJK 及全角标点） */
function isWide(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return true; // CJK 部首、汉字、全角标点、假名等
  return false;
}

/** 贪心取字符，尽量填满 maxWidth（至少取 1 个，避免空行） */
function takeChars(chars: string[], fontSize: number, maxWidth: number): { text: string; count: number } {
  let text = '';
  let count = 0;
  for (const ch of chars) {
    if (text && textWidth(text + ch, fontSize) > maxWidth) break;
    text += ch;
    count++;
  }
  if (count === 0 && chars.length > 0) return { text: chars[0], count: 1 };
  return { text, count };
}

/** 截断并加省略号（省略号本身也占宽度） */
function truncateWithEllipsis(chars: string[], fontSize: number, maxWidth: number): string {
  const ellipsis = '…';
  const budget = maxWidth - textWidth(ellipsis, fontSize);
  let text = '';
  for (const ch of chars) {
    if (text && textWidth(text + ch, fontSize) > budget) break;
    text += ch;
  }
  return text + ellipsis;
}

/**
 * 折行：最多两行，仍放不下就在第二行截断加省略号
 *
 * 两行是上限 —— 再多的行数会把节点变成方块，破坏对齐（知识库原则 4）。
 */
export function wrapLabel(label: string, fontSize: number, maxWidth: number): string[] {
  if (maxWidth <= 0) return [label];
  if (textWidth(label, fontSize) <= maxWidth) return [label];

  const chars = [...label];
  const first = takeChars(chars, fontSize, maxWidth);
  const rest = chars.slice(first.count);
  if (rest.length === 0) return [first.text];

  const second = takeChars(rest, fontSize, maxWidth);
  if (second.count >= rest.length) return [first.text, second.text];

  return [first.text, truncateWithEllipsis(rest, fontSize, maxWidth)];
}

/**
 * 把一组宽度折成多行
 *
 * 保持顺序（折行不能打乱逻辑顺序）。单个元素超宽时独占一行 ——
 * 不会因为放不下就丢掉它。
 */
export function wrapIntoRows(widths: number[], maxRowWidth: number, gap: number): number[][] {
  const rows: number[][] = [];
  let current: number[] = [];
  let currentWidth = 0;

  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const next = current.length === 0 ? w : currentWidth + gap + w;

    if (current.length > 0 && next > maxRowWidth) {
      rows.push(current);
      current = [i];
      currentWidth = w;
    } else {
      current.push(i);
      currentWidth = next;
    }
  }

  if (current.length > 0) rows.push(current);
  return rows;
}

/** solveCanvas 的输入 */
export interface SolveInput {
  /** 层 → 行 → 节点索引（行由 wrapIntoRows 折出） */
  layers: number[][][];
  nodeWidths: number[];
  nodeHeights: number[];
  /**
   * 横切容器（右侧竖条）；没有则 null
   *
   * height 是竖条**自己需要的**最小高度（标签 + 留白 + 节点）。
   * 不够时它会把画布撑高 —— 否则内部的节点会被挤到重叠。
   */
  crosscut: { width: number; nodeCount: number; height?: number } | null;
  /** 标题占用的高度 */
  titleHeight: number;
  /**
   * 层间距的压缩下限
   *
   * 相邻两层都有容器时，中间的留白必须同时容下"上个容器的下边距 +
   * 下个容器的标签区 + 上边距"，否则两个容器框会叠在一起（实测叠 10px）。
   */
  minLayerGap?: number;
  metrics: LayoutMetrics;
}

/** solveCanvas 的结果 */
export interface CanvasSize {
  width: number;
  height: number;
  /** 实际采用的参数（可能被压缩过） */
  metrics: LayoutMetrics;
  /** 压缩/降级动作记录 —— 让决策可见，便于事后归因 */
  adjustments: string[];
}

/**
 * 解算画布尺寸
 *
 * 压缩顺序严格执行：**先压边距 → 再压层间距 → 最后压字号**
 * （用户明确要求"先压缩边距，再压缩整体的分辨率或字体"）。
 * 字号压缩受 `MIN_FONT_RATIO` 保护 —— 压到不可读就没意义了。
 */
export function solveCanvas(input: SolveInput): CanvasSize {
  const base = input.metrics;
  const metrics: LayoutMetrics = { ...base };
  const adjustments: string[] = [];

  const measure = (): { width: number; height: number } => {
    const scale = metrics.fontSize / base.fontSize;
    const heights = input.nodeHeights.map(h => h * scale);

    let contentWidth = 0;
    let contentHeight = 0;

    input.layers.forEach((rows, layerIndex) => {
      let bandHeight = 0;
      rows.forEach((row, rowIndex) => {
        const rowWidth =
          row.reduce((sum, i) => sum + input.nodeWidths[i], 0) + metrics.rowGap * Math.max(0, row.length - 1);
        contentWidth = Math.max(contentWidth, rowWidth);
        const rowHeight = Math.max(0, ...row.map(i => heights[i]));
        bandHeight += rowHeight + (rowIndex > 0 ? metrics.subRowGap : 0);
      });
      contentHeight += bandHeight + (layerIndex > 0 ? metrics.layerGap : 0);
    });

    const crosscutWidth = input.crosscut ? metrics.rowGap + input.crosscut.width : 0;
    // 竖条按自己所需高度参与画布高度计算
    const effectiveHeight = Math.max(contentHeight, input.crosscut?.height ?? 0);

    return {
      width: metrics.margin * 2 + contentWidth + crosscutWidth,
      height: metrics.margin * 2 + input.titleHeight + effectiveHeight,
    };
  };

  const overRatio = (): boolean => {
    const { width, height } = measure();
    return width > 0 && height / width > MAX_ASPECT_RATIO;
  };

  // ① 压边距
  const margin0 = metrics.margin;
  while (overRatio() && metrics.margin > MIN_MARGIN) {
    metrics.margin = Math.max(MIN_MARGIN, metrics.margin - 4);
  }
  if (metrics.margin < margin0) {
    adjustments.push(`压缩画布边距 ${margin0}→${metrics.margin}px（先压边距）`);
  }

  // ② 压层间距（不得低于容器布局所需的下限）
  const gapFloor = Math.max(MIN_LAYER_GAP, input.minLayerGap ?? 0);
  const gap0 = metrics.layerGap;
  while (overRatio() && metrics.layerGap > gapFloor) {
    metrics.layerGap = Math.max(gapFloor, metrics.layerGap - 4);
  }
  if (metrics.layerGap < gap0) {
    adjustments.push(`压缩层间距 ${gap0}→${metrics.layerGap}px`);
  }

  // ③ 压字号（受可读性下限保护）
  const font0 = metrics.fontSize;
  while (overRatio() && metrics.fontSize > MIN_FONT_SIZE) {
    const next = metrics.fontSize - 0.5;
    const { width } = measure();
    if (width > 0 && next / width < MIN_FONT_RATIO) break; // 再压就不可读了
    metrics.fontSize = next;
  }
  if (metrics.fontSize < font0) {
    adjustments.push(`压缩字号 ${font0}→${metrics.fontSize}px（受可读性下限 ${MIN_FONT_RATIO * 100}% 保护）`);
  }

  const { width, height } = measure();

  // 宽度超上限：字号/宽 会跌破可读线。折行是编排层的职责，
  // 这里只负责**如实报警** —— 静默产出超宽画布正是真机事故的成因。
  if (width > TARGET_WIDTH) {
    adjustments.push(
      `⚠️ 画布宽 ${Math.round(width)}px 超上限 ${TARGET_WIDTH}px，需要折行分栏`,
    );
  }

  // ④ 压到极限仍超一页 —— 如实记录，交给校验器判定阻塞
  if (width > 0 && height / width > MAX_ASPECT_RATIO) {
    adjustments.push(
      `⚠️ 压到极限仍超一页（高宽比 ${(height / width).toFixed(2)} > ${MAX_ASPECT_RATIO}），需要折行分栏`,
    );
  }

  return { width: Math.round(width), height: Math.round(height), metrics, adjustments };
}
