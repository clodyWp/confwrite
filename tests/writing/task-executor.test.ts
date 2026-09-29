import { describe, it, expect, beforeEach } from 'vitest';
import { TaskExecutor, MIN_CHAPTER_CHARS } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';

describe('TaskExecutor', () => {
  let executor: TaskExecutor;

  beforeEach(() => {
    executor = new TaskExecutor();
  });

  describe('generateWriterPrompt', () => {
    it('generates prompt with chapter kit content', () => {
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = `# ch001 素材包：系统概述

## 章节信息
- **章节 ID**: ch001
- **标题**: 系统概述

## 相关文件
- **api-spec.md** (技术)
  - 摘要: API 规范文档...

## 关键数据
- **性能**: 99.9%
- **响应时间**: 100ms

## 写作提示
1. 仔细阅读相关文件
2. 确保使用正确的技术术语
`;

      const prompt = executor.generateWriterPrompt(task, kitContent);

      expect(prompt).toContain('ch001');
      expect(prompt).toContain('系统概述');
      expect(prompt).toContain('99.9%');
      expect(prompt).toContain('100ms');
    });

    it('includes writing instructions', () => {
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# ch001 素材包';
      const prompt = executor.generateWriterPrompt(task, kitContent);

      expect(prompt).toContain('深度要求');
      expect(prompt).toContain('输出格式');
      // 验证深度要求（篇幅为 ch 级，见 prompt-length-level.test.ts）
      expect(prompt).toContain(`${MIN_CHAPTER_CHARS} 字`);
      // Bug 4/5/6 fix: paragraph-level 300 char rule removed
      expect(prompt).not.toContain('每个独立成段的段落不少于 300 字');
      expect(prompt).toContain('描述→画图→总结');
    });

    it('specifies output file path', () => {
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const kitContent = '# ch001 素材包';
      const prompt = executor.generateWriterPrompt(task, kitContent);

      expect(prompt).toContain('drafts/chapters/ch001-v1.md');
    });
  });

  describe('generateReviewerPrompt', () => {
    it('generates review prompt with chapter content', () => {
      const task: Task = {
        id: 'task-2',
        type: 'reviewer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const chapterContent = '# 系统概述\n\n本章节介绍系统整体架构...';
      const baseline = {
        metrics: { '性能': '99.9%' },
        technicalTerms: ['API', 'REST'],
        requirements: ['必须支持高可用'],
      };

      const prompt = executor.generateReviewerPrompt(task, chapterContent, baseline);

      expect(prompt).toContain('审阅任务');
      expect(prompt).toContain('ch001');
      expect(prompt).toContain('99.9%');
      expect(prompt).toContain('API');
    });

    it('includes review criteria', () => {
      const task: Task = {
        id: 'task-2',
        type: 'reviewer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const chapterContent = '# 系统概述';
      const baseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const prompt = executor.generateReviewerPrompt(task, chapterContent, baseline);

      expect(prompt).toContain('审阅标准');
      expect(prompt).toContain('输出格式');
    });

    it('specifies output file path', () => {
      const task: Task = {
        id: 'task-2',
        type: 'reviewer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const chapterContent = '# 系统概述';
      const baseline = {
        metrics: {},
        technicalTerms: [],
        requirements: [],
      };

      const prompt = executor.generateReviewerPrompt(task, chapterContent, baseline);

      expect(prompt).toContain('review/ch001-r1.json');
    });
  });

  describe('generateFixPrompt', () => {
    it('generates fix prompt with review feedback', () => {
      const task: Task = {
        id: 'task-3',
        type: 'fixer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const chapterContent = '# 系统概述\n\n原始内容...';
      const reviewContent = `# ch001 审阅报告

## 问题列表
1. 数据不一致：性能指标应为 99.9%，文中写的是 99%
2. 缺少关键概念：未提及微服务架构

## 建议
- 修正性能指标
- 补充微服务相关内容
`;

      const prompt = executor.generateFixPrompt(task, chapterContent, reviewContent);

      expect(prompt).toContain('修复任务');
      expect(prompt).toContain('ch001');
      expect(prompt).toContain('99.9%');
      expect(prompt).toContain('微服务架构');
    });

    it('includes original and review content', () => {
      const task: Task = {
        id: 'task-3',
        type: 'fixer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const chapterContent = '# 系统概述';
      const reviewContent = '# 审阅报告\n\n问题：数据错误';

      const prompt = executor.generateFixPrompt(task, chapterContent, reviewContent);

      expect(prompt).toContain('原始章节内容');
      expect(prompt).toContain('审阅反馈');
      expect(prompt).toContain('修复要求');
    });
  });

  describe('parseReviewDecision', () => {
    it('parses accept decision', () => {
      const reviewOutput = `# ch001 审阅报告

## 结论
**决定**: accept

## 评分
- 内容准确性: 9/10
- 结构清晰度: 8/10

## 问题列表
无重大问题
`;

      const decision = executor.parseReviewDecision(reviewOutput);

      expect(decision.decision).toBe('accept');
      expect(decision.confidence).toBeGreaterThan(0);
    });

    it('parses reject decision', () => {
      const reviewOutput = `# ch001 审阅报告

## 结论
**决定**: reject

## 原因
内容严重偏离主题，需要重写
`;

      const decision = executor.parseReviewDecision(reviewOutput);

      expect(decision.decision).toBe('reject');
    });

    it('parses revise decision', () => {
      const reviewOutput = `# ch001 审阅报告

## 结论
**决定**: revise

## 需要修改的问题
1. 数据不一致
2. 缺少关键概念
`;

      const decision = executor.parseReviewDecision(reviewOutput);

      expect(decision.decision).toBe('revise');
    });

    it('defaults to revise for unclear decisions', () => {
      const reviewOutput = '# 审阅报告\n\n内容不完整';

      const decision = executor.parseReviewDecision(reviewOutput);

      expect(decision.decision).toBe('revise');
    });
  });
});
