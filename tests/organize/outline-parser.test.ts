import { describe, it, expect } from 'vitest';
import { OutlineParser } from '../../src/organize/outline-parser.js';
import type { OutlineNode } from '../../src/organize/outline-parser.js';

describe('OutlineParser', () => {
  describe('parse', () => {
    it('parses simple outline with numbered sections', () => {
      const content = `
# 技术方案

## 1. 系统概述
### 1.1 背景
### 1.2 目标

## 2. 架构设计
### 2.1 总体架构
### 2.2 技术选型
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      expect(outline.title).toBe('技术方案');
      expect(outline.children.length).toBe(2);
      expect(outline.children[0].number).toBe('1');
      expect(outline.children[0].title).toBe('系统概述');
      expect(outline.children[0].children.length).toBe(2);
      expect(outline.children[0].children[0].number).toBe('1.1');
      expect(outline.children[0].children[1].number).toBe('1.2');
    });

    it('detects ch- markers for subagent spawn', () => {
      const content = `
# 项目方案

## 1. 概述
ch001 背景介绍
ch002 需求分析

## 2. 设计
ch003 架构设计
ch004 详细设计
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const ch001 = outline.findChapter('ch001');
      expect(ch001).toBeDefined();
      expect(ch001?.spawnLevel).toBe(true);
      expect(ch001?.title).toBe('背景介绍');

      const ch004 = outline.findChapter('ch004');
      expect(ch004).toBeDefined();
      expect(ch004?.spawnLevel).toBe(true);
    });

    it('handles multi-level hierarchy (卷/篇/章)', () => {
      const content = `
# 投标方案

## 卷一：技术方案

### 篇1：总体方案

#### 1.1 系统概述
ch001 背景
ch002 目标

#### 1.2 架构设计
ch003 总体架构

### 篇2：详细方案

#### 2.1 模块设计
ch004 模块A
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      expect(outline.title).toBe('投标方案');
      
      const vol1 = outline.children[0];
      expect(vol1.title).toBe('卷一：技术方案');
      
      const pian1 = vol1.children[0];
      expect(pian1.title).toBe('篇1：总体方案');
      
      const sections = pian1.children;
      expect(sections.length).toBe(2);
      expect(sections[0].number).toBe('1.1');
      expect(sections[1].number).toBe('1.2');
    });

    it('extracts chapter IDs from ch- markers', () => {
      const content = `
# 方案

## 1. 概述
ch001 背景
ch002 目标

## 2. 设计
ch003 架构
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const chapters = outline.getAllChapters();
      expect(chapters.length).toBe(3);
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003']);
    });

    it('handles outline without ch- markers', () => {
      const content = `
# 方案

## 1. 概述
### 1.1 背景
### 1.2 目标

## 2. 设计
### 2.1 架构
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const chapters = outline.getAllChapters();
      expect(chapters.length).toBe(0); // No ch- markers
    });

    it('preserves parent-child relationships', () => {
      const content = `
# 方案

## 1. 概述
### 1.1 背景
ch001 背景详情
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const ch001 = outline.findChapter('ch001');
      expect(ch001).toBeDefined();
      expect(ch001?.parent?.number).toBe('1.1');
      expect(ch001?.parent?.parent?.number).toBe('1');
    });

    it('handles empty outline', () => {
      const parser = new OutlineParser();
      const outline = parser.parse('');

      expect(outline.title).toBe('');
      expect(outline.children.length).toBe(0);
    });
  });

  describe('OutlineNode.findChapter', () => {
    it('finds chapter by ID recursively', () => {
      const content = `
# 方案

## 1. 概述
### 1.1 背景
ch001 背景
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const ch001 = outline.findChapter('ch001');
      expect(ch001).toBeDefined();
      expect(ch001?.id).toBe('ch001');
    });

    it('returns undefined for non-existent chapter', () => {
      const content = `
# 方案

## 1. 概述
ch001 背景
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const ch999 = outline.findChapter('ch999');
      expect(ch999).toBeUndefined();
    });
  });

  describe('OutlineNode.getAllChapters', () => {
    it('returns all chapters in order', () => {
      const content = `
# 方案

## 1. 概述
ch003 第三
ch001 第一

## 2. 设计
ch002 第二
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const chapters = outline.getAllChapters();
      expect(chapters.length).toBe(3);
      // Should be in document order, not ID order
      expect(chapters[0].id).toBe('ch003');
      expect(chapters[1].id).toBe('ch001');
      expect(chapters[2].id).toBe('ch002');
    });
  });
});
