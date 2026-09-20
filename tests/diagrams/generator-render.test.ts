import { describe, it, expect } from 'vitest';
import { generateSVG, type SVGNode, type SVGConnection } from '../../src/diagrams/generator.js';
import {
  getDefaultDiagramStyle,
  getLayerPalette,
  DEFAULT_LAYER_PALETTE,
  CJK_FONT_FAMILY,
} from '../../src/diagrams/style.js';

/**
 * 图表渲染质量
 *
 * 背景（实测事故）：LmERP2 项目生成的 29 张图，每张只有 2 个颜色值
 * （1 个填充色 + 白底），所有节点都是同一个橙色 #d97706。
 *
 * 而知识库 knowledge/diagrams/architecture-style.md 明确要求按层分色：
 *   接入层=蓝 / 业务应用层=绿 / 业务支撑层=橙 / 数据层=紫 / 基础设施层=灰
 *
 * 根因：generator.ts 的 generateNode 对所有节点使用 colors.primary，
 * 与 node.layer 无关 —— 渲染层本身缺少「按层取色」的能力。
 *
 * 本文件锁定「按层分色」与「跨平台中文字体」两个语义。
 */

/** 从生成的 SVG 中取出指定节点的填充色 */
function fillOf(svg: string, nodeId: string): string | null {
  const m = svg.match(new RegExp(`id="node-${nodeId}"[^>]*>[\\s\\S]*?fill="(#[0-9a-fA-F]{6})"`));
  return m ? m[1].toLowerCase() : null;
}

/** 取出 SVG 中所有 font-family 值 */
function fontFamilies(svg: string): string[] {
  return [...svg.matchAll(/font-family="([^"]+)"/g)].map(m => m[1]);
}

const nodes = (...layers: number[]): SVGNode[] =>
  layers.map((layer, i) => ({ id: `n${i}`, label: `节点${i}`, layer }));

const noConnections: SVGConnection[] = [];

describe('分层配色（Bug 17）', () => {
  const style = getDefaultDiagramStyle();

  it('不同 layer 的节点使用不同的填充色', () => {
    const r = generateSVG(nodes(0, 1, 2), noConnections, style);
    const c0 = fillOf(r.svg, 'n0');
    const c1 = fillOf(r.svg, 'n1');
    const c2 = fillOf(r.svg, 'n2');

    expect(c0).not.toBeNull();
    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(new Set([c0, c1, c2]).size).toBe(3);
  });

  it('同一 layer 的多个节点使用相同填充色', () => {
    const r = generateSVG(nodes(1, 1, 1), noConnections, style);
    const [a, b, c] = ['n0', 'n1', 'n2'].map(id => fillOf(r.svg, id));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('不再出现「所有节点同一个颜色」的旧行为', () => {
    const r = generateSVG(nodes(0, 1, 2, 3, 4), noConnections, style);
    const colors = ['n0', 'n1', 'n2', 'n3', 'n4'].map(id => fillOf(r.svg, id));
    expect(new Set(colors).size).toBe(5);
  });

  it('layer 超出配色板长度时循环取色（不崩溃、不为空）', () => {
    const r = generateSVG(nodes(0, 99), noConnections, style);
    const c0 = fillOf(r.svg, 'n0');
    const cBig = fillOf(r.svg, 'n1'); // layer=99
    expect(c0).toMatch(/^#[0-9a-f]{6}$/);
    expect(cBig).toMatch(/^#[0-9a-f]{6}$/);
    // 99 % 5 = 4 → 应等于配色板第 5 色
    expect(cBig).toBe(DEFAULT_LAYER_PALETTE[4].toLowerCase());
  });

  it('尊重 style.layerPalette 自定义配色（方案 A 预留的可配置数据）', () => {
    const custom = ['#111111', '#222222'];
    const r = generateSVG(nodes(0, 1, 2), noConnections, {
      ...getDefaultDiagramStyle(),
      layerPalette: custom,
    });
    const colors = ['n0', 'n1', 'n2'].map(id => fillOf(r.svg, id));
    expect(colors[0]).toBe('#111111');
    expect(colors[1]).toBe('#222222');
    expect(colors[2]).toBe('#111111'); // 循环
  });

  it('未配置 layerPalette 时回退到默认配色板', () => {
    const styleNoPalette = { ...getDefaultDiagramStyle(), layerPalette: undefined };
    expect(getLayerPalette(styleNoPalette as never)).toEqual(DEFAULT_LAYER_PALETTE);
  });

  it('默认配色板至少 5 色（对应知识库的 5 个层级）', () => {
    expect(DEFAULT_LAYER_PALETTE.length).toBeGreaterThanOrEqual(5);
    for (const c of DEFAULT_LAYER_PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('跨平台中文字体（Bug 18）', () => {
  const style = getDefaultDiagramStyle();

  it('不再把 Windows 专有字体放在首位', () => {
    const r = generateSVG(nodes(0), noConnections, style);
    for (const ff of fontFamilies(r.svg)) {
      const first = ff.split(',')[0].trim();
      expect(first).not.toBe('Microsoft YaHei');
      expect(first).not.toBe('SimHei');
    }
  });

  it('包含 Linux 上可用的中文字体（Noto Sans CJK）', () => {
    const r = generateSVG(nodes(0), noConnections, style);
    for (const ff of fontFamilies(r.svg)) {
      expect(ff).toContain('Noto Sans CJK');
    }
  });

  it('以通用 sans-serif 结尾兜底', () => {
    const r = generateSVG(nodes(0), noConnections, style);
    for (const ff of fontFamilies(r.svg)) {
      expect(ff.trimEnd().endsWith('sans-serif')).toBe(true);
    }
  });

  it('字体族本身不自带引号（避免 Windows/字体匹配问题）', () => {
    expect(CJK_FONT_FAMILY).not.toMatch(/["']/);
  });
});
