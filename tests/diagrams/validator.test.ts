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

    it('detects too many layers', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [
          { id: 'A', label: 'L0', layer: 0 },
          { id: 'B', label: 'L1', layer: 1 },
          { id: 'C', label: 'L2', layer: 2 },
          { id: 'D', label: 'L3', layer: 3 },
          { id: 'E', label: 'L4', layer: 4 },
          { id: 'F', label: 'L5', layer: 5 },
          { id: 'G', label: 'L6', layer: 6 }, // 超过 5 层
        ],
        connections: [],
        svgContent: '<svg>...</svg>',
        type: 'architecture',
      };

      const result = validateDiagram(diagram);

      const layerCheck = result.checks.find(c => c.name === '层级数量');
      expect(layerCheck?.passed).toBe(false);
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

    it('detects long labels that may overflow', () => {
      const diagram: DiagramData = {
        id: 'ch01-fig1',
        nodes: [
          { id: 'A', label: '这是一个非常非常长的标签文字', layer: 0 },
        ],
        connections: [],
        svgContent: '<svg>...</svg>',
      };

      const result = validateDiagram(diagram);

      const labelCheck = result.checks.find(c => c.name === '标签长度');
      expect(labelCheck?.passed).toBe(false);
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
