/**
 * Tests for diagram validator
 * 
 * 渲染后验证检查，确保生成的图表质量合格。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateDiagram,
  type ValidationResult,
  type DiagramData,
} from '../../src/diagrams/validator.js';

const TEST_DIR = join(process.cwd(), '.test-diagram-validator');

describe('DiagramValidator', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('validateDiagram', () => {
    it('passes for valid diagram', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [
          { id: 'A', label: '模块A', layer: 0 },
          { id: 'B', label: '模块B', layer: 1 },
        ],
        connections: [
          { from: 'A', to: 'B' },
        ],
        svgContent: '<svg>...</svg>',
        pngPath: join(TEST_DIR, 'figures', 'ch01-fig1.png'),
      };

      // 创建一个有效的 PNG 文件
      writeFileSync(diagram.pngPath!, 'fake-png-content');

      const result = validateDiagram(diagram);

      expect(result.overallPassed).toBe(true);
      expect(result.checks.find(c => c.name === '文件完整性')?.passed).toBe(true);
    });

    it('detects node overlap', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [
          { id: 'A', label: '模块A', layer: 0, x: 0, y: 0, width: 100, height: 50 },
          { id: 'B', label: '模块B', layer: 0, x: 50, y: 0, width: 100, height: 50 }, // 与 A 重叠
        ],
        connections: [],
        svgContent: '<svg>...</svg>',
      };

      const result = validateDiagram(diagram);

      const overlapCheck = result.checks.find(c => c.name === '节点重叠');
      expect(overlapCheck?.passed).toBe(false);
      expect(overlapCheck?.details).toContain('重叠');
    });

    it('层数过多不再判失败（新引擎压缩到单页，压缩优先不拆图）', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: Array.from({ length: 9 }, (_, i) => ({ id: `N${i}`, label: `L${i}`, layer: i })),
        connections: [],
        svgContent: '<svg>...</svg>',
        type: 'architecture',
      };

      const result = validateDiagram(diagram);

      // 旧判据是「架构图 ≤5 层」，前提是旧渲染器层多了图会无限变高。
      // 新引擎对任意层数都会压缩（实测 11 层压到 727px），产品决策是
      // 「压缩优先、不拆图」，所以这里只如实报告，不判失败。
      const check = result.checks.find(c => c.name === '层级数量');
      expect(check?.passed).toBe(true);
      expect(check?.details).toContain('9 层');
    });

    it('detects too many connections', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [
          { id: 'A', label: 'A', layer: 0 },
          { id: 'B', label: 'B', layer: 1 },
        ],
        connections: [
          { from: 'A', to: 'B' },
          { from: 'A', to: 'B' },
          { from: 'A', to: 'B' },
          { from: 'A', to: 'B' }, // 4 条连线，2 个节点，比例 > 1.5
        ],
        svgContent: '<svg>...</svg>',
      };

      const result = validateDiagram(diagram);

      const connCheck = result.checks.find(c => c.name === '连线复杂度');
      expect(connCheck?.passed).toBe(false);
    });

    it('长标签不再判失败（引擎会折行并截断）', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [{ id: 'A', label: '这是一个非常非常长的标签文字需要折行', layer: 0 }],
        connections: [],
        svgContent: '<svg>...</svg>',
      };

      const result = validateDiagram(diagram);

      // 旧判据按「≤12 字」判失败，前提是旧渲染器不折行、超出就溢出节点框。
      // 新引擎按节点宽度折行（≤2 行，超出用 … 截断），节点宽度也按折行后
      // 最宽的一行反推 —— 长标签不会再撑破图形。是否真溢出由「文字溢出」
      // 检查按渲染结果判定，比数字数可靠。
      const labelCheck = result.checks.find(c => c.name === '标签长度');
      expect(labelCheck?.passed).toBe(true);
      expect(labelCheck?.details).toContain('最长');
    });

    it('detects missing PNG file', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [],
        connections: [],
        svgContent: '<svg>...</svg>',
        pngPath: join(TEST_DIR, 'figures', 'nonexistent.png'),
      };

      const result = validateDiagram(diagram);

      expect(result.overallPassed).toBe(false);
      const fileCheck = result.checks.find(c => c.name === '文件完整性');
      expect(fileCheck?.passed).toBe(false);
    });

    it('detects decoration characters in SVG', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [],
        connections: [],
        svgContent: '<svg>┌─────┐ │ 模块 │ └─────┘</svg>', // 包含装饰字符
      };

      const result = validateDiagram(diagram);

      const decorCheck = result.checks.find(c => c.name === '装饰字符');
      expect(decorCheck?.passed).toBe(false);
    });

    it('detects oversized SVG for Word', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [],
        connections: [],
        svgContent: '<svg width="800" height="1000">...</svg>', // 超过 Word 限制
        svgWidth: 800,
        svgHeight: 1000,
      };

      const result = validateDiagram(diagram);

      const sizeCheck = result.checks.find(c => c.name === 'Word 尺寸');
      expect(sizeCheck?.passed).toBe(false);
    });
  });

  describe('validateDiagram with constraints', () => {
    it('无约束参数时使用默认值', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [{ id: 'A', label: 'A', layer: 0 }],
        connections: [],
        svgContent: '<svg></svg>',
        svgWidth: 700,  // > 默认 680
        svgHeight: 800,
      };

      const result = validateDiagram(diagram);
      const sizeCheck = result.checks.find(c => c.name === 'Word 尺寸');
      expect(sizeCheck?.passed).toBe(false);  // 700 > 680 默认值
    });

    it('有约束参数时使用自定义值', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [{ id: 'A', label: 'A', layer: 0 }],
        connections: [],
        svgContent: '<svg></svg>',
        svgWidth: 700,  // > 默认 680，但 < 自定义 800
        svgHeight: 800,
      };

      const result = validateDiagram(diagram, { maxWidth: 800 });
      const sizeCheck = result.checks.find(c => c.name === 'Word 尺寸');
      expect(sizeCheck?.passed).toBe(true);  // 700 <= 800 自定义值
    });
  });

  describe('ValidationResult structure', () => {
    it('has all required fields', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [],
        connections: [],
        svgContent: '<svg></svg>',
      };

      const result = validateDiagram(diagram);

      expect(result).toHaveProperty('diagramId');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('overallPassed');
      expect(result.checks[0]).toHaveProperty('name');
      expect(result.checks[0]).toHaveProperty('passed');
      expect(result.checks[0]).toHaveProperty('details');
    });
  });
});
