import { describe, it, expect } from 'vitest';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';
import type { ReviewBaseline } from '../../src/writing/task-executor.js';

describe('TaskExecutor - 字数控制三层防御', () => {
  const executor = new TaskExecutor();
  
  const mockTask: Task = {
    id: 'task-001',
    chapterId: 'ch001',
    type: 'write',
    status: 'pending',
    priority: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('预防层：Writer prompt 字数限制', () => {
    it('应该包含硬性字数上限说明', () => {
      const prompt = executor.generateWriterPrompt(
        mockTask,
        '素材包内容',
        1,
        { min: 5000, max: 8000, expected: 6500 }
      );

      // 应该包含硬性上限说明
      expect(prompt).toContain('硬性上限');
      expect(prompt).toContain('8000');
    });

    it('应该明确说明超过上限的后果', () => {
      const prompt = executor.generateWriterPrompt(
        mockTask,
        '素材包内容',
        1,
        { min: 5000, max: 8000, expected: 6500 }
      );

      // 应该说明超过上限会被审阅拒绝
      expect(prompt).toMatch(/超过.*拒绝|超出.*退回/i);
    });

    it('应该强调字数是强制要求而非参考', () => {
      const prompt = executor.generateWriterPrompt(
        mockTask,
        '素材包内容',
        1,
        { min: 5000, max: 8000, expected: 6500 }
      );

      // 不应该出现"仅供参考"
      expect(prompt).not.toMatch(/仅供参考/);
      // 应该出现"必须"、"强制"等词
      expect(prompt).toMatch(/必须|强制|严格/i);
    });
  });

  describe('检测层：字数检查', () => {
    it('应该检测字数超标', () => {
      const content = 'a'.repeat(10000); // 10000 字
      const result = executor.checkWordCount(content, { min: 5000, max: 8000 });
      
      expect(result.exceeds).toBe(true);
      expect(result.actual).toBe(10000);
      expect(result.max).toBe(8000);
    });

    it('应该检测字数不足', () => {
      const content = 'a'.repeat(3000); // 3000 字
      const result = executor.checkWordCount(content, { min: 5000, max: 8000 });
      
      expect(result.below).toBe(true);
      expect(result.actual).toBe(3000);
      expect(result.min).toBe(5000);
    });

    it('应该接受正常字数', () => {
      const content = 'a'.repeat(6500); // 6500 字
      const result = executor.checkWordCount(content, { min: 5000, max: 8000 });
      
      expect(result.exceeds).toBe(false);
      expect(result.below).toBe(false);
      expect(result.valid).toBe(true);
    });
  });

  describe('兜底层：Reviewer 字数检查', () => {
    const mockBaseline: ReviewBaseline = {
      metrics: { '系统可用性': '99.9%' },
      technicalTerms: ['ERP', 'MES'],
      requirements: ['需求1', '需求2'],
    };

    it('Reviewer prompt 应该包含字数检查要求', () => {
      const prompt = executor.generateReviewerPrompt(
        mockTask,
        '草稿内容',
        mockBaseline,
        1,
        '',
        undefined,
        { min: 5000, max: 8000 }
      );

      // 应该包含字数检查要求
      expect(prompt).toMatch(/字数|字符数/i);
      expect(prompt).toContain('8000');
    });

    it('Reviewer 应该对字数超标给出 revise 决定', () => {
      const prompt = executor.generateReviewerPrompt(
        mockTask,
        '草稿内容',
        mockBaseline,
        1,
        '',
        undefined,
        { min: 5000, max: 8000 }
      );

      // 应该说明字数超标时返回 revise
      expect(prompt).toMatch(/超过.*拒绝|超出.*revise/i);
    });
  });
});
