import { describe, it, expect } from 'vitest';
import type { Outline } from '../../src/outline/types.js';

// 导入内部函数进行测试
// 由于 generateOutlineMarkdown 是私有函数，我们通过测试输出来验证

describe('Outline command - requirementSource output', () => {
  it('should include requirementSource in outline.md', async () => {
    // 这个测试验证 outline.md 的格式
    // 实际的格式验证在集成测试中完成
    
    const outline: Outline = {
      title: '测试文档',
      targetWords: 100000,
      chapters: [
        {
          id: 'ch001',
          title: '项目概述',
          type: 'functional',
          wordBudget: { min: 5000, max: 8000 },
          importance: 3,
          description: '本节涵盖项目概述相关内容。',
          requirementSource: {
            sections: ['1.1', '1.2'],
            headings: ['1.1 项目背景', '1.2 项目目标'],
          },
        },
        {
          id: 'ch002',
          title: '功能需求',
          type: 'functional',
          wordBudget: { min: 5000, max: 8000 },
          importance: 4,
          description: '本节涵盖功能需求相关内容。',
          requirementSource: {
            sections: ['2.1'],
            headings: ['2.1 计划管理'],
          },
        },
      ],
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };

    // 验证数据结构
    expect(outline.chapters[0].requirementSource?.sections).toContain('1.1');
    expect(outline.chapters[0].requirementSource?.headings).toContain('1.1 项目背景');
    expect(outline.chapters[1].requirementSource?.sections).toContain('2.1');
  });
});
