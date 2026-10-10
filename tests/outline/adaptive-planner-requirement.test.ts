import { describe, it, expect } from 'vitest';
import { AdaptiveOutlinePlanner } from '../../src/outline/adaptive-planner.js';
import type { HeadingNode } from '../../src/outline/heading-tree.js';

describe('AdaptiveOutlinePlanner - requirementSource', () => {
  it('should include requirementSource from sourceNodes', () => {
    const planner = new AdaptiveOutlinePlanner();
    
    // 创建一个简单的标题树
    const root: HeadingNode = {
      level: 1,
      title: '文档标题',
      number: '',
      charCount: 100000,
      ownCharCount: 0,
      children: [
        {
          level: 2,
          title: '第1章 项目概述',
          number: '1',
          charCount: 20000,
          ownCharCount: 5000,
          children: [
            {
              level: 3,
              title: '1.1 项目背景',
              number: '1.1',
              charCount: 10000,
              ownCharCount: 10000,
              children: [],
              parent: undefined,
            },
            {
              level: 3,
              title: '1.2 项目目标',
              number: '1.2',
              charCount: 10000,
              ownCharCount: 10000,
              children: [],
              parent: undefined,
            },
          ],
          parent: undefined,
        },
      ],
      parent: undefined,
    };

    // 设置 parent 引用
    const ch1 = root.children[0];
    ch1.children[0].parent = ch1;
    ch1.children[1].parent = ch1;

    const chapters = planner.plan(root, {
      targetWords: 100000,
      wordBudget: { min: 5000, max: 8000 },
      tolerance: 0.2,
    });

    // 验证章节包含 requirementSource
    expect(chapters.length).toBeGreaterThan(0);
    
    for (const ch of chapters) {
      expect(ch.requirementSource).toBeDefined();
      expect(ch.requirementSource?.sections).toBeDefined();
      expect(ch.requirementSource?.headings).toBeDefined();
      expect(Array.isArray(ch.requirementSource?.sections)).toBe(true);
      expect(Array.isArray(ch.requirementSource?.headings)).toBe(true);
    }
  });

  it('should extract section numbers from HeadingNode', () => {
    const planner = new AdaptiveOutlinePlanner();
    
    const root: HeadingNode = {
      level: 1,
      title: '文档标题',
      number: '',
      charCount: 50000,
      ownCharCount: 0,
      children: [
        {
          level: 2,
          title: '功能需求',
          number: '2',
          charCount: 30000,
          ownCharCount: 5000,
          children: [
            {
              level: 3,
              title: '2.1 计划管理',
              number: '2.1',
              charCount: 15000,
              ownCharCount: 15000,
              children: [],
              parent: undefined,
            },
          ],
          parent: undefined,
        },
      ],
      parent: undefined,
    };

    root.children[0].children[0].parent = root.children[0];

    const chapters = planner.plan(root, {
      targetWords: 50000,
      wordBudget: { min: 5000, max: 8000 },
      tolerance: 0.2,
    });

    // 验证 requirementSource 包含正确的章节号
    const ch = chapters[0];
    expect(ch.requirementSource?.sections).toContain('2.1');
    expect(ch.requirementSource?.headings).toContain('2.1 计划管理');
  });
});
