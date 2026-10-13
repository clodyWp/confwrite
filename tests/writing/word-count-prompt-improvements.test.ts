/**
 * Issue #75 & #76 回归测试：字数控制 prompt 改进
 * 
 * Issue #75: Writer prompt 字数控制不足
 * Issue #76: 审阅者 verdict 矛盾（检测到字数超标但 verdict 为 accept）
 * 
 * 修复：
 * 1. Writer prompt 添加字数控制策略（如何压缩内容）
 * 2. Reviewer prompt 强制字数超标时必须返回 revise
 */
import { describe, it, expect } from 'vitest';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';

describe('Issue #75 & #76: 字数控制 prompt 改进', () => {
  const taskExecutor = new TaskExecutor({
    writing: { minChapterChars: 3000, maxChapterChars: 8000 }
  });

  const mockTask: Task = {
    id: 'write-ch001-r1',
    type: 'writer',
    chapterId: 'ch001',
    priority: 1,
    sequence: 1,
    status: 'queued',
    attempt: 0,
    prompt: '',
    dependencies: [],
  };

  describe('Writer prompt 字数控制策略', () => {
    it('应该包含字数控制策略', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateWriterPrompt(mockTask, '# 素材内容', 1, wordBudget);

      // 应该包含字数控制策略
      expect(prompt).toContain('字数控制策略');
      expect(prompt).toContain('删除重复论述');
      expect(prompt).toContain('合并相似观点');
      expect(prompt).toContain('用表格替代长段落');
      expect(prompt).toContain('精简示例');
    });

    it('应该强调超过上限会被拒绝', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateWriterPrompt(mockTask, '# 素材内容', 1, wordBudget);

      // 应该强调超过上限会被拒绝
      expect(prompt).toContain('超过上限的内容会被直接拒绝');
      expect(prompt).toContain('必须重新精简后提交');
    });

    it('应该明确字数范围是硬性要求', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateWriterPrompt(mockTask, '# 素材内容', 1, wordBudget);

      expect(prompt).toContain('绝对硬性要求');
      expect(prompt).toContain('5000-8000 字');
    });
  });

  describe('Reviewer prompt 字数检查', () => {
    const baseline = {
      metrics: [],
      technicalTerms: [],
      requirements: []
    };

    it('应该强制字数超标时必须返回 revise', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateReviewerPrompt(
        mockTask,
        '# 章节内容',
        baseline,
        1,
        '',
        '/tmp/test',
        wordBudget
      );

      // 应该强制字数超标时必须返回 revise
      expect(prompt).toContain('必须返回 revise');
      expect(prompt).toContain('不得返回 accept');
      expect(prompt).toContain('verdict 必须为 revise');
    });

    it('应该明确字数超标的判定规则', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateReviewerPrompt(
        mockTask,
        '# 章节内容',
        baseline,
        1,
        '',
        '/tmp/test',
        wordBudget
      );

      // 应该明确超过上限必须 revise
      expect(prompt).toContain('实际字数 > 8000 字');
      expect(prompt).toContain('必须返回 revise');
      
      // 应该明确不足下限必须 revise
      expect(prompt).toContain('实际字数 < 5000 字');
    });

    it('应该提供压缩策略建议', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateReviewerPrompt(
        mockTask,
        '# 章节内容',
        baseline,
        1,
        '',
        '/tmp/test',
        wordBudget
      );

      // 应该提供压缩策略
      expect(prompt).toContain('压缩策略');
      expect(prompt).toContain('删除重复');
    });

    it('应该强调这是硬性规则不可违反', () => {
      const wordBudget = { min: 5000, max: 8000, expected: 6500 };
      const prompt = taskExecutor.generateReviewerPrompt(
        mockTask,
        '# 章节内容',
        baseline,
        1,
        '',
        '/tmp/test',
        wordBudget
      );

      // 应该强调这是硬性规则
      expect(prompt).toContain('硬性规则');
      expect(prompt).toContain('不可违反');
    });
  });
});
