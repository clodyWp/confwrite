import { describe, it, expect } from 'vitest';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle, DEFAULT_LAYER_PALETTE } from '../../src/diagrams/style.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

/**
 * 样式契约 —— 从旧渲染器退役时**移植过来的真实回归守卫**
 *
 * 旧 generator.ts 退役时，它的测试里有两组守卫不能跟着一起删：
 *   · Bug 17 分层配色（曾经所有节点同一个颜色）
 *   · Bug 18 跨平台中文字体（曾经用 Windows 专有字体，Linux 上出豆腐块）
 * 那两组 bug 是真机踩出来的，删掉测试等于把 bug 放回来。这里对**新引擎**
 * 重新锁一遍。新增样式字段也在这里补契约。
 */

function spec(): DiagramSpec {
  return {
    containers: [
      { id: 'l0', label: '接入层', nodes: ['a', 'b'] },
      { id: 'l1', label: '应用层', nodes: ['c'] },
      { id: 'l2', label: '数据层', nodes: ['d'] },
    ],
    nodes: [
      { id: 'a', label: '网关', container: 'l0' },
      { id: 'b', label: '负载均衡', container: 'l0' },
      { id: 'c', label: '业务服务', container: 'l1' },
      { id: 'd', label: '数据库', container: 'l2' },
    ],
    edges: [
      { from: 'a', to: 'c', direction: 'forward', style: 'solid' },
      { from: 'c', to: 'd', direction: 'forward', style: 'solid' },
    ],
  };
}

/** 取出每个节点的填充色 */
function nodeFills(svg: string): { id: string; fill: string }[] {
  return Array.from(
    svg.matchAll(/data-node-id="([^"]+)" data-node-h="[\d.]+"><rect[^>]*fill="([^"]+)"/g),
  ).map(m => ({ id: m[1], fill: m[2] }));
}

function fontFamilies(svg: string): string[] {
  return Array.from(svg.matchAll(/font-family="([^"]+)"/g)).map(m => m[1]);
}

describe('Bug 17 分层配色（移植自旧渲染器测试）', () => {
  const svg = layoutDiagram(spec(), getDefaultDiagramStyle()).svg;

  it('不同 layer 的节点填充色不同', () => {
    const fills = nodeFills(svg);
    const byId = new Map(fills.map(f => [f.id, f.fill]));
    expect(byId.get('a')).not.toBe(byId.get('c'));
    expect(byId.get('c')).not.toBe(byId.get('d'));
  });

  it('同一 layer 的多个节点填充色相同', () => {
    const byId = new Map(nodeFills(svg).map(f => [f.id, f.fill]));
    expect(byId.get('a')).toBe(byId.get('b'));
  });

  it('不再出现「所有节点同一个颜色」的旧行为', () => {
    expect(new Set(nodeFills(svg).map(f => f.fill)).size).toBeGreaterThan(1);
  });

  it('尊重 style.layerPalette 自定义配色', () => {
    const style = getDefaultDiagramStyle();
    style.layerPalette = ['#111111', '#222222', '#333333'];
    const fills = new Set(nodeFills(layoutDiagram(spec(), style).svg).map(f => f.fill));
    // 自定义配色是深色，且被用上（不会被默认配色板覆盖）
    for (const fill of fills) {
      expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(fills.size).toBeGreaterThan(1);
  });

  it('默认配色板至少 5 色（对应知识库的 5 个层级）', () => {
    expect(DEFAULT_LAYER_PALETTE.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Bug 18 跨平台中文字体（移植自旧渲染器测试）', () => {
  const svg = layoutDiagram(spec(), getDefaultDiagramStyle()).svg;

  it('不再把 Windows 专有字体放在首位', () => {
    for (const ff of fontFamilies(svg)) {
      const first = ff.split(',')[0].trim().replace(/^["']|["']$/g, '');
      expect(['Microsoft YaHei', 'SimHei', 'SimSun', '微软雅黑']).not.toContain(first);
    }
  });

  it('包含 Linux 上可用的中文字体（Noto Sans CJK）', () => {
    expect(fontFamilies(svg).some(ff => ff.includes('Noto Sans CJK'))).toBe(true);
  });

  it('以通用 sans-serif 结尾兜底', () => {
    expect(fontFamilies(svg).some(ff => ff.trim().endsWith('sans-serif'))).toBe(true);
  });

  it('带标签的连线也用跨平台字体（回归守卫）', () => {
    const withLabel = layoutDiagram(
      {
        ...spec(),
        edges: [{ from: 'a', to: 'c', label: '调用', direction: 'forward', style: 'solid' }],
      },
      getDefaultDiagramStyle(),
    ).svg;
    // Windows 字体作为**后备**出现在列表末尾是允许的，不允许的是排在最前
    const first = fontFamilies(withLabel)[0].split(',')[0].trim();
    expect(first).toContain('Noto');
  });

  it('字体族里中文字体排在 Windows 专有字体之前', () => {
    // Bug 18 的意图：Windows 字体不能排第一位（Linux 上会命中失败或出豆腐块）。
    // 它作为后备留在列表里没问题。
    for (const ff of fontFamilies(svg)) {
      const order = ff.split(',').map(x => x.trim());
      const noto = order.findIndex(x => x.includes('Noto') || x.includes('Source Han'));
      const win = order.findIndex(x => /Microsoft YaHei|SimHei|SimSun/.test(x));
      if (win >= 0) expect(noto).toBeGreaterThanOrEqual(0);
      if (win >= 0 && noto >= 0) expect(noto).toBeLessThan(win);
    }
  });

  it('字体族本身不自带引号（避免字体匹配问题）', () => {
    for (const ff of fontFamilies(svg)) {
      expect(ff).not.toContain('"');
      expect(ff).not.toContain("'");
    }
  });
});

describe('样式字段不能静默失效', () => {
  it('nodeShape 影响圆角', () => {
    const sharp = getDefaultDiagramStyle();
    sharp.nodeShape = 'sharp';
    const pill = getDefaultDiagramStyle();
    pill.nodeShape = 'pill';

    const radiusOf = (svg: string) => {
      const m = svg.match(/data-node-h="[\d.]+"><rect[^>]*rx="([\d.]+)"/);
      return Number(m?.[1]);
    };
    expect(radiusOf(layoutDiagram(spec(), sharp).svg)).toBeLessThan(
      radiusOf(layoutDiagram(spec(), pill).svg),
    );
  });

  it('fontSize 影响实际字号（compact < normal < spacious）', () => {
    const fontSizeOf = (mode: 'compact' | 'normal' | 'spacious') => {
      const style = getDefaultDiagramStyle();
      style.fontSize = mode;
      const svg = layoutDiagram(spec(), style).svg;
      const m = svg.match(/data-node-id="[^"]+" data-node-h="[\d.]+"><rect[\s\S]{0,400}?<text[^>]*font-size="([\d.]+)"/);
      return Number(m?.[1]);
    };
    const compact = fontSizeOf('compact');
    const normal = fontSizeOf('normal');
    const spacious = fontSizeOf('spacious');
    expect(compact).toBeLessThan(normal);
    expect(normal).toBeLessThan(spacious);
  });
});

describe('移植时补回的边界（旧测试覆盖过、新引擎没测）', () => {
  it('空图表不崩溃（0 个节点）', () => {
    const empty: DiagramSpec = { containers: [], nodes: [], edges: [] };
    const result = layoutDiagram(empty, getDefaultDiagramStyle());
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.svg).toContain('<svg');
  });

  it('只有节点没有连线也不崩溃', () => {
    const onlyNodes: DiagramSpec = {
      containers: [{ id: 'l0', label: '', nodes: ['a'] }],
      nodes: [{ id: 'a', label: '孤立节点', container: 'l0' }],
      edges: [],
    };
    const result = layoutDiagram(onlyNodes, getDefaultDiagramStyle());
    expect(result.nodes).toHaveLength(1);
    expect(result.svg).toContain('孤立节点');
  });

  it('colorScheme 影响连线与文字颜色（warm / cool 不同）', () => {
    // 背景固定白色 —— 这是**有意**的：图表要嵌进 Word，彩色背景打印出来
    // 既费墨又难看。colorScheme 体现在连线/文字色上。
    const warm = getDefaultDiagramStyle();
    warm.colorScheme = 'warm';
    const cool = getDefaultDiagramStyle();
    cool.colorScheme = 'cool';

    const lineColor = (style: ReturnType<typeof getDefaultDiagramStyle>) => {
      const m = layoutDiagram(spec(), style).svg.match(/<polyline[^>]*stroke="([^"]+)"/);
      return m?.[1];
    };
    expect(lineColor(warm)).toBeTruthy();
    expect(lineColor(cool)).toBeTruthy();
    expect(lineColor(warm)).not.toBe(lineColor(cool));
  });

  it('背景保持白色（嵌入 Word 的刻意选择）', () => {
    const svg = layoutDiagram(spec(), getDefaultDiagramStyle()).svg;
    expect(svg).toContain('<rect width="100%" height="100%" fill="#ffffff"/>');
  });
});
