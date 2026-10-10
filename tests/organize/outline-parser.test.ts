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

    it('parses outline with multiple top-level # headings', () => {
      const content = `
# 一、项目概述
## 1.1 背景
ch001 项目背景
ch002 需求分析

# 二、技术方案
## 2.1 架构设计
ch003 总体架构
ch004 详细设计

# 三、实施计划
## 3.1 时间线
ch005 里程碑
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);

      const chapters = outline.getAllChapters();
      expect(chapters.length).toBe(5);
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003', 'ch004', 'ch005']);
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

  describe('description collection', () => {
    it('collects description text between ch markers', () => {
      const content = `# 技术方案

## 1. 项目概述
ch001 项目背景

本章需要覆盖以下内容：
- 项目发起的背景和原因
- 当前业务痛点分析

ch002 需求分析
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(2);
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[0].description).toContain('本章需要覆盖以下内容');
      expect(chapters[0].description).toContain('项目发起的背景和原因');
      expect(chapters[1].id).toBe('ch002');
      expect(chapters[1].description).toBeUndefined();
    });

    it('stops collecting description at next heading', () => {
      const content = `# 文档
ch001 标题

这是描述内容

## 下一个标题
ch002 另一个标题
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].description).toContain('这是描述内容');
      expect(chapters[0].description).not.toContain('下一个标题');
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

  describe('type extraction from description', () => {
    it('extracts type with half-width colon', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].type).toBe('functional');
    });

    it('extracts type with full-width colon', () => {
      const content = `# 方案
ch001 系统概述

本章类型：overview
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].type).toBe('overview');
    });

    it('leaves type undefined when not present', () => {
      const content = `# 方案
ch001 系统概述

本章需要覆盖系统总体架构。
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].type).toBeUndefined();
    });
  });

  describe('wordBudget extraction from description', () => {
    it('extracts wordBudget with format "字数预算: 5000-8000字"', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].wordBudget).toEqual({ min: 5000, max: 8000 });
    });

    it('extracts wordBudget with full-width colon', () => {
      const content = `# 方案
ch001 系统概述

字数预算：6000-10000字
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].wordBudget).toEqual({ min: 6000, max: 10000 });
    });

    it('extracts wordBudget with en-dash separator', () => {
      const content = `# 方案
ch001 系统概述

字数预算: 5000–8000字
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].wordBudget).toEqual({ min: 5000, max: 8000 });
    });

    it('leaves wordBudget undefined when not present', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].wordBudget).toBeUndefined();
    });
  });

  describe('importance extraction from description', () => {
    it('extracts importance with format "重要度: 3/5"', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional。重要度: 4/5。
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].importance).toBe(4);
    });

    it('extracts importance with full-width colon', () => {
      const content = `# 方案
ch001 系统概述

重要度：5/5
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].importance).toBe(5);
    });

    it('leaves importance undefined when not present', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].importance).toBeUndefined();
    });
  });

  describe('style extraction from description', () => {
    it('extracts style with format "写作风格: technical"', () => {
      const content = `# 方案
ch001 系统概述

写作风格: technical
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].style).toBe('technical');
    });

    it('extracts style with full-width colon', () => {
      const content = `# 方案
ch001 系统概述

写作风格：academic
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].style).toBe('academic');
    });

    it('leaves style undefined when not present', () => {
      const content = `# 方案
ch001 系统概述

本章类型: functional
`;

      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters[0].style).toBeUndefined();
    });
  });
});
