import { describe, it, expect } from 'vitest';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';
import type { WordBudget } from '../../src/outline/types.js';

describe('TaskExecutor - Word Budget Reference', () => {
  describe('generateWriterPrompt with wordBudget', () => {
    it('应该在prompt中包含字数预算参考', () => {
      const executor = new TaskExecutor();
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# 素材包内容';
      const wordBudget: WordBudget = {
        min: 5000,
        max: 8000,
        expected: 6500,
      };

      const prompt = executor.generateWriterPrompt(task, kitContent, 1, wordBudget);

      expect(prompt).toContain('字数预算');
      expect(prompt).toContain('5000');
      expect(prompt).toContain('8000');
      expect(prompt).toContain('6500');
    });

    it('应该在字数预算部分说明这是硬性要求', () => {
      const executor = new TaskExecutor();
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# 素材包内容';
      const wordBudget: WordBudget = {
        min: 5000,
        max: 8000,
        expected: 6500,
      };

      const prompt = executor.generateWriterPrompt(task, kitContent, 1, wordBudget);

      expect(prompt).toContain('硬性要求');
      expect(prompt).toContain('必须严格遵守');
    });

    it('应该在没有字数预算时不显示预算部分', () => {
      const executor = new TaskExecutor();
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# 素材包内容';

      const prompt = executor.generateWriterPrompt(task, kitContent, 1);

      expect(prompt).not.toContain('字数预算');
    });

    it('应该保持原有的字数门控要求', () => {
      const executor = new TaskExecutor();
      
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        attempt: 0,
        priority: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# 素材包内容';
      const wordBudget: WordBudget = {
        min: 5000,
        max: 8000,
        expected: 6500,
      };

      const prompt = executor.generateWriterPrompt(task, kitContent, 1, wordBudget);

      // 应该仍然包含门控要求
      expect(prompt).toContain('8000 字');
      expect(prompt).toContain('强制');
    });
  });
});
