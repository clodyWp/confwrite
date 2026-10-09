/**
 * Tests for knowledge-config.ts
 *
 * D3: 从知识库 frontmatter 提取图表配置参数（配色、布局约束）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseLayerPaletteFromMarkdown,
  extractLayerPaletteFromKnowledge,
  extractLayoutConstraints,
  loadKnowledgeDiagramConfig,
} from '../../src/diagrams/knowledge-config.js';

const TEST_DIR = join(process.cwd(), '.test-knowledge-config');

describe('knowledge-config', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('parseLayerPaletteFromMarkdown', () => {
    it('从 markdown 表格提取配色', () => {
      const content = `---
title: 架构图风格规范
---

# 风格

| 层级 | 颜色 |
|------|------|
| 接入层 | #2563eb |
| 业务层 | #16a34a |
| 支撑层 | #ea580c |
`;
      const palette = parseLayerPaletteFromMarkdown(content);
      expect(palette).toEqual(['#2563eb', '#16a34a', '#ea580c']);
    });

    it('无配色表格时返回 null', () => {
      const content = `---
title: 无配色文件
---

# 内容

没有配色表格。
`;
      const palette = parseLayerPaletteFromMarkdown(content);
      expect(palette).toBeNull();
    });

    it('支持直接 hex 值（带引号或不带）', () => {
      const content = `
| 层级 | 颜色 |
|------|------|
| 接入层 | '#2563eb' |
| 业务层 | "#16a34a" |
| 支撑层 | #ea580c |
`;
      const palette = parseLayerPaletteFromMarkdown(content);
      expect(palette).toEqual(['#2563eb', '#16a34a', '#ea580c']);
    });
  });

  describe('extractLayerPaletteFromKnowledge', () => {
    it('从知识库 frontmatter 的 diagramConfig.layerPalette 提取', () => {
      const knowledgeDir = join(TEST_DIR, 'knowledge', 'diagrams');
      mkdirSync(knowledgeDir, { recursive: true });
      writeFileSync(
        join(knowledgeDir, 'architecture-style.md'),
        `---
title: 架构图风格规范
diagramConfig:
  layerPalette:
    - '#2563eb'
    - '#16a34a'
    - '#ea580c'
---

# 内容
`
      );

      const palette = extractLayerPaletteFromKnowledge(TEST_DIR);
      expect(palette).toEqual(['#2563eb', '#16a34a', '#ea580c']);
    });

    it('知识库不存在时返回 null', () => {
      const palette = extractLayerPaletteFromKnowledge(TEST_DIR);
      expect(palette).toBeNull();
    });
  });

  describe('extractLayoutConstraints', () => {
    it('从 layout.md 提取约束', () => {
      const knowledgeDir = join(TEST_DIR, 'knowledge', 'diagrams');
      mkdirSync(knowledgeDir, { recursive: true });
      writeFileSync(
        join(knowledgeDir, 'layout.md'),
        `---
title: 布局方法论
diagramConfig:
  layoutConstraints:
    maxWidth: 680
    maxHeight: 900
    maxConnectionRatio: 1.5
    minGroupGapRatio: 3
---

# 内容
`
      );

      const constraints = extractLayoutConstraints(TEST_DIR);
      expect(constraints).toEqual({
        maxWidth: 680,
        maxHeight: 900,
        maxConnectionRatio: 1.5,
        minGroupGapRatio: 3,
      });
    });

    it('无约束时返回 null', () => {
      const knowledgeDir = join(TEST_DIR, 'knowledge', 'diagrams');
      mkdirSync(knowledgeDir, { recursive: true });
      writeFileSync(
        join(knowledgeDir, 'layout.md'),
        `---
title: 布局方法论
---

# 内容
`
      );

      const constraints = extractLayoutConstraints(TEST_DIR);
      expect(constraints).toBeNull();
    });
  });

  describe('loadKnowledgeDiagramConfig', () => {
    it('加载完整配置', () => {
      const knowledgeDir = join(TEST_DIR, 'knowledge', 'diagrams');
      mkdirSync(knowledgeDir, { recursive: true });

      writeFileSync(
        join(knowledgeDir, 'architecture-style.md'),
        `---
title: 架构图风格规范
diagramConfig:
  layerPalette:
    - '#2563eb'
    - '#16a34a'
---

# 内容
`
      );

      writeFileSync(
        join(knowledgeDir, 'layout.md'),
        `---
title: 布局方法论
diagramConfig:
  layoutConstraints:
    maxWidth: 700
    maxHeight: 950
---

# 内容
`
      );

      const config = loadKnowledgeDiagramConfig(TEST_DIR);
      expect(config.layerPalette).toEqual(['#2563eb', '#16a34a']);
      expect(config.layoutConstraints?.maxWidth).toBe(700);
      expect(config.layoutConstraints?.maxHeight).toBe(950);
    });

    it('知识库不存在时返回空配置', () => {
      const config = loadKnowledgeDiagramConfig(TEST_DIR);
      expect(config.layerPalette).toBeUndefined();
      expect(config.layoutConstraints).toBeUndefined();
    });
  });
});
