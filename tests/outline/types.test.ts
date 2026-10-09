import { describe, it, expect } from 'vitest';
import type { OutlineChapter } from '../../src/outline/types.js';

describe('OutlineChapter type', () => {
  it('should support requirementSource field', () => {
    const chapter: OutlineChapter = {
      id: 'ch001',
      title: 'Test Chapter',
      type: 'functional',
      wordBudget: { min: 5000, max: 8000 },
      importance: 0.8,
      description: 'Test description',
      requirementSource: {
        sections: ['2.1.3.1.1', '2.1.3.1.2'],
        headings: ['新机及单元体计划单编制', '大修及检返机计划单编制'],
      },
    };

    expect(chapter.requirementSource).toBeDefined();
    expect(chapter.requirementSource?.sections).toHaveLength(2);
    expect(chapter.requirementSource?.headings).toHaveLength(2);
    expect(chapter.requirementSource?.sections[0]).toBe('2.1.3.1.1');
  });

  it('should make requirementSource optional', () => {
    const chapter: OutlineChapter = {
      id: 'ch002',
      title: 'Another Chapter',
      type: 'technical',
      wordBudget: { min: 5000, max: 8000 },
      importance: 0.6,
      description: 'Another description',
    };

    expect(chapter.requirementSource).toBeUndefined();
  });
});
