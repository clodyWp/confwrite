/**
 * 测试：Reviewer/Fixer prompt 的字数控制策略 (Issue #68)
 * 
 * Spec: WB-6, WB-7, WB-8
 * - WB-6: Reviewer 必须同时检查字数上限和下限
 * - WB-7: Reviewer 超标时必须给出压缩指令
 * - WB-8: Fixer 必须支持精简策略
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';

describe('Issue #68: Word Count Prompt Improvements', () => {
  let executor: TaskExecutor;
  const baseline = {
    metrics: { accuracy: 8, consistency: 9 },
    technicalTerms: ['API', 'SDK'],
    requirements: ['需求1', '需求2'],
  };

  beforeEach(() => {
    executor = new TaskExecutor('/test/project');
  });

  describe('WB-6: Reviewer 必须同时检查字数上限和下限', () => {
    it('prompt 中优先级第一项应包含字数范围检查', () => {
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateReviewerPrompt(task, '章节内容', baseline, 1, '', undefined, wordBudget);

      // 优先级第一项应包含字数范围检查
      expect(prompt).toContain('字数是否在范围内');
      expect(prompt).toContain('5000-8000');
      expect(prompt).toContain('不足下限');
      expect(prompt).toContain('超过上限');
    });

    it('prompt 中应同时提到下限和上限', () => {
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateReviewerPrompt(task, '章节内容', baseline, 1, '', undefined, wordBudget);

      // 应同时包含下限和上限
      expect(prompt).toMatch(/下限|min/i);
      expect(prompt).toMatch(/上限|max/i);
    });
  });

  describe('WB-7: Reviewer 超标时必须给出压缩指令', () => {
    it('prompt 中应包含压缩指令模板', () => {
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateReviewerPrompt(task, '章节内容', baseline, 1, '', undefined, wordBudget);

      // 应包含压缩策略指导
      expect(prompt).toMatch(/压缩|精简/i);
      expect(prompt).toMatch(/删除重复|合并|表格/i);
    });

    it('prompt 应指导 Reviewer 在 issues 中给出压缩建议', () => {
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateReviewerPrompt(task, '章节内容', baseline, 1, '', undefined, wordBudget);

      // 应指导如何在 issues 中给出压缩建议
      expect(prompt).toMatch(/压缩策略|精简.*指导/i);
    });
  });

  describe('WB-8: Fixer 必须支持精简策略', () => {
    it('prompt 中应包含"如何精简内容"章节', () => {
      const task: Task = {
        id: 'fix-ch001-r1',
        type: 'fixer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateFixPrompt(task, '章节内容', '审阅反馈', 1, wordBudget);

      // 应包含精简策略
      expect(prompt).toMatch(/精简|压缩/i);
      expect(prompt).toMatch(/删除重复|合并相似|表格替代/i);
    });

    it('prompt 应强调精简时不得改变语义', () => {
      const task: Task = {
        id: 'fix-ch001-r1',
        type: 'fixer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateFixPrompt(task, '章节内容', '审阅反馈', 1, wordBudget);

      // 应强调不得改变语义
      expect(prompt).toMatch(/不得改变语义|保持语义|不改变.*意思/i);
    });

    it('prompt 应列出具体精简方法', () => {
      const task: Task = {
        id: 'fix-ch001-r1',
        type: 'fixer',
        chapterId: 'ch001',
        prompt: '',
        maxTurns: 10,
      };

      const wordBudget = { min: 5000, max: 8000 };
      const prompt = executor.generateFixPrompt(task, '章节内容', '审阅反馈', 1, wordBudget);

      // 应列出具体方法
      expect(prompt).toMatch(/删除重复/);
      expect(prompt).toMatch(/合并/);
      expect(prompt).toMatch(/表格/);
    });
  });
});