import { describe, it, expect, beforeEach } from 'vitest';
import { TaskExecutor, MIN_CHAPTER_CHARS } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';

/**
 * 篇幅度量层级 —— ch 级
 *
 * 背景（这是一个真实事故）：
 * prompt 曾写「每个子节（## 或 ### 下的内容）整体不少于 5000 字」，
 * 度量因此发生在 **ch 的内部**（小节层）。一个 ch 被切成约 27 个小节，
 * 等于要求这一个 ch 写 27 × 5000 = 135,000 字 —— 而模型单次回答只能
 * 产出约 18,000 字。
 *
 * 实测后果：
 * - 模型进入「量字数 → 补内容 → 再量」循环，吃掉 50% 运行时间
 * - 最终每节仅 660 字，达标率 13%
 * - 为迎合该要求把章节切成 27 个碎片，结构在 37→6 节之间剧烈波动
 *
 * 正确语义：**度量发生在 ch 层** —— 本次任务产出的整个章节正文合计
 * 达到字数下限即可，不按内部小节分别计算。
 *
 * 本文件锁定该语义，防止「子节 5000 字」这个措辞回归。
 */

const baseTask: Task = {
  id: 'write-ch003-r1',
  type: 'writer',
  chapterId: 'ch003',
  priority: 1,
  sequence: 1,
  status: 'queued',
  attempt: 0,
  prompt: '',
  dependencies: [],
};

describe(' MIN_CHAPTER_CHARS', () => {
  it('是正整数', () => {
    expect(Number.isInteger(MIN_CHAPTER_CHARS)).toBe(true);
    expect(MIN_CHAPTER_CHARS).toBeGreaterThan(0);
  });

  it('不低于用户要求的 5000 字（留出余量）', () => {
    expect(MIN_CHAPTER_CHARS).toBeGreaterThanOrEqual(5000);
  });
});

describe('writer prompt 的度量层级', () => {
  let executor: TaskExecutor;
  beforeEach(() => {
    executor = new TaskExecutor();
  });

  it('声明的是「整个章节」的字数下限', () => {
    const p = executor.generateWriterPrompt(baseTask, '# kit');
    expect(p).toContain('8000');
    // 明确点出度量对象是整节，而非内部小节
    expect(p).toMatch(/整节|整个章节/);
  });

  it('明确「按整节合计，不按内部小节分别计算」', () => {
    const p = executor.generateWriterPrompt(baseTask, '# kit');
    expect(p).toMatch(/合计/);
    expect(p).toMatch(/不按|而非|不是.*分别/);
  });

  it('不再要求「每个子节」达到字数下限（事故根因）', () => {
    const p = executor.generateWriterPrompt(baseTask, '# kit');
    // 这句话是事故根因，不得回归
    expect(p).not.toMatch(/每个子节[^\n]*不少于\s*5000/);
    expect(p).not.toMatch(/每个子节[^\n]*≥\s*5000/);
  });

  it('重要提示里强调写完就结束', () => {
    const p = executor.generateWriterPrompt(baseTask, '# kit');
    const important = p.split('## 重要提示')[1] ?? '';
    expect(important).toMatch(/写完就结束/);
    expect(important).toMatch(/不要检查字数/);
  });
});

describe('reviewer prompt 的度量层级', () => {
  let executor: TaskExecutor;
  beforeEach(() => {
    executor = new TaskExecutor();
  });

  const baseline = { metrics: {}, technicalTerms: [], requirements: [] };

  it('按整节检查字数，而非按子节', () => {
    const p = executor.generateReviewerPrompt(baseTask, '# 正文', baseline);
    expect(p).toMatch(/整节|整个章节/);
    expect(p).not.toMatch(/每个子节[^\n]*(5000|≥)/);
  });

  it('要求指出实际字数与差额（可度量）', () => {
    const p = executor.generateReviewerPrompt(baseTask, '# 正文', baseline);
    expect(p).toMatch(/字数|差额/);
  });
});

describe('fixer prompt 的度量层级', () => {
  let executor: TaskExecutor;
  beforeEach(() => {
    executor = new TaskExecutor();
  });

  it('要求整节达标，而非逐子节', () => {
    const p = executor.generateFixPrompt(baseTask, '# 正文', '# 审阅报告', 1);
    expect(p).toMatch(/整节|整个章节/);
    expect(p).not.toMatch(/每个子节[^\n]*(5000|≥)/);
  });

  it('重要提示里强调修复完就结束', () => {
    const p = executor.generateFixPrompt(baseTask, '# 正文', '# 审阅报告', 1);
    const important = p.split('## 重要提示')[1] ?? '';
    expect(important).toMatch(/修复完就结束/);
    expect(important).toMatch(/不要检查字数/);
  });
});
