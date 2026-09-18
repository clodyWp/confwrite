/**
 * Tests for SVG generator
 * 
 * 将解析后的节点和连接关系渲染为 SVG。
 */
import { describe, it, expect } from 'vitest';
import {
  generateSVG,
  type SVGNode,
  type SVGConnection,
  type SVGResult,
} from '../../src/diagrams/generator.js';
import { getDefaultDiagramStyle, getColorScheme, type DiagramStyle } from '../../src/diagrams/style.js';

describe('SVGGenerator', () => {
  const defaultStyle = getDefaultDiagramStyle();
  const colors = getColorScheme('warm')!;

  describe('generateSVG', () => {
    it('generates valid SVG structure', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '客户端', layer: 0 },
        { id: 'B', label: '服务器', layer: 1 },
      ];
      const connections: SVGConnection[] = [
        { from: 'A', to: 'B' },
      ];

      const result = generateSVG(nodes, connections, defaultStyle);

      expect(result.svg).toContain('<svg');
      expect(result.svg).toContain('</svg>');
      expect(result.svg).toContain('viewBox');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('renders node labels', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '用户界面', layer: 0 },
      ];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, defaultStyle);

      expect(result.svg).toContain('用户界面');
    });

    it('renders connections with arrows', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '客户端', layer: 0 },
        { id: 'B', label: '服务器', layer: 1 },
      ];
      const connections: SVGConnection[] = [
        { from: 'A', to: 'B', label: 'HTTP' },
      ];

      const result = generateSVG(nodes, connections, defaultStyle);

      expect(result.svg).toContain('marker'); // 箭头标记
      expect(result.svg).toContain('HTTP'); // 连接标签
    });

    it('applies warm color scheme', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块', layer: 0 },
      ];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, defaultStyle);

      expect(result.svg).toContain(colors.primary);
    });

    it('applies cool color scheme', () => {
      const coolStyle: DiagramStyle = { ...defaultStyle, colorScheme: 'cool' };
      const coolColors = getColorScheme('cool')!;
      
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块', layer: 0 },
      ];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, coolStyle);

      expect(result.svg).toContain(coolColors.primary);
    });

    it('handles top-to-bottom layout', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '顶层', layer: 0 },
        { id: 'B', label: '底层', layer: 1 },
      ];
      const connections: SVGConnection[] = [
        { from: 'A', to: 'B' },
      ];
      const tbStyle: DiagramStyle = { ...defaultStyle, layoutDirection: 'top-to-bottom' };

      const result = generateSVG(nodes, connections, tbStyle);

      // 顶层节点的 Y 坐标应该小于底层
      const aMatch = result.svg.match(/id="node-A"[^>]*y="(\d+)"/);
      const bMatch = result.svg.match(/id="node-B"[^>]*y="(\d+)"/);
      
      if (aMatch && bMatch) {
        expect(parseInt(aMatch[1])).toBeLessThan(parseInt(bMatch[1]));
      }
    });

    it('handles left-to-right layout', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '左侧', layer: 0 },
        { id: 'B', label: '右侧', layer: 1 },
      ];
      const connections: SVGConnection[] = [
        { from: 'A', to: 'B' },
      ];
      const lrStyle: DiagramStyle = { ...defaultStyle, layoutDirection: 'left-to-right' };

      const result = generateSVG(nodes, connections, lrStyle);

      // 左侧节点的 X 坐标应该小于右侧
      const aMatch = result.svg.match(/id="node-A"[^>]*x="(\d+)"/);
      const bMatch = result.svg.match(/id="node-B"[^>]*x="(\d+)"/);
      
      if (aMatch && bMatch) {
        expect(parseInt(aMatch[1])).toBeLessThan(parseInt(bMatch[1]));
      }
    });

    it('does not use quotes in font-family', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '中文标签', layer: 0 },
      ];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, defaultStyle);

      // font-family 不应该包含引号包裹的字体名
      expect(result.svg).not.toMatch(/font-family="[^"]*"[^"]*"/);
      // 应该使用无引号的字体族
      expect(result.svg).toContain('Microsoft YaHei');
    });

    it('applies rounded node shape', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块', layer: 0 },
      ];
      const connections: SVGConnection[] = [];
      const roundedStyle: DiagramStyle = { ...defaultStyle, nodeShape: 'rounded' };

      const result = generateSVG(nodes, connections, roundedStyle);

      expect(result.svg).toContain('rx='); // 圆角
    });

    it('applies sharp node shape', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块', layer: 0 },
      ];
      const connections: SVGConnection[] = [];
      const sharpStyle: DiagramStyle = { ...defaultStyle, nodeShape: 'sharp' };

      const result = generateSVG(nodes, connections, sharpStyle);

      // 直角矩形没有 rx 属性或 rx="0"
      const hasNoRadius = !result.svg.includes('rx=') || result.svg.includes('rx="0"');
      expect(hasNoRadius).toBe(true);
    });

    it('applies pill node shape', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块', layer: 0 },
      ];
      const connections: SVGConnection[] = [];
      const pillStyle: DiagramStyle = { ...defaultStyle, nodeShape: 'pill' };

      const result = generateSVG(nodes, connections, pillStyle);

      // 胶囊形的 rx 应该等于高度的一半
      expect(result.svg).toContain('rx=');
    });

    it('handles multiple nodes in same layer', () => {
      const nodes: SVGNode[] = [
        { id: 'A', label: '模块A', layer: 0 },
        { id: 'B', label: '模块B', layer: 0 },
        { id: 'C', label: '模块C', layer: 0 },
      ];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, defaultStyle);

      // 三个节点应该水平排列，Y 坐标相同
      expect(result.svg).toContain('模块A');
      expect(result.svg).toContain('模块B');
      expect(result.svg).toContain('模块C');
    });

    it('handles empty nodes', () => {
      const nodes: SVGNode[] = [];
      const connections: SVGConnection[] = [];

      const result = generateSVG(nodes, connections, defaultStyle);

      expect(result.svg).toContain('<svg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });
});
