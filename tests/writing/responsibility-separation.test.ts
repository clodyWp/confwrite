import { describe, it, expect, beforeEach } from 'vitest';
import { TaskExecutor, MIN_CHAPTER_CHARS } from '../../src/writing/task-executor.js';
import type { Task } from '../../src/scheduler/types.js';

/**
 * 职责分离 × ch 级篇幅 —— 两条独立约束必须同时成立
 *
 * 背景：这两个改进来自两条**独立的**分支，各自单独看都有问题，
 * 合并时必须同时满足，否则会丢掉其中一个（这是真实发生过的风险）：
 *
 * ┌────────────────────────┬──────────────────────────────────────┐
 * │ `feat/ch-level-length` │ ✅ 篇幅口径修正为 ch 级（8000 字）      │
 * │                        │ ❌ 没有职责分离：writer 仍会自查字数    │
 * ├────────────────────────┼──────────────────────────────────────┤
 * │ `feat/responsibility-  │ ✅ 职责分离：writer 写完即止、         │
 * │  separation`           │    reviewer 拥有篇幅检查权、fixer 按    │
 * │                        │    报告扩充                            │
 * │                        │ ❌ 篇幅写「每个子节建议 3000-5000 字」  │
 * │                        │    —— 同一个层级笔误（仍在小节层）      │
 * └────────────────────────┴──────────────────────────────────────┘
 *
 * 本文件锁定「两者同时成立」。在任一条单独分支上都会失败：
 * - 在 ch-level 分支上：职责分离的断言失败
 * - 在 responsibility-separation 分支上：ch 级口径的断言失败
 *
 * 另外，职责分离**不改变**篇幅下限：下限是硬性要求（ch 级、一次回答可达），
 * 而「不由 writer 自己反复测量」是流程分工。二者不矛盾——
 * 循环的成因是「要求不可能达成」，不是「要求是硬的」。
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

const baseline = {
  metrics: { words: 1000, characters: 1000, headings: 3, images: 0 },
  technicalTerms: [],
  requirements: [],
};

describe('职责分离 × ch 级篇幅', () => {
  let executor: TaskExecutor;

  beforeEach(() => {
    executor = new TaskExecutor();
  });

  // ── 约束一：篇幅口径必须在 ch 层 ──────────────────────────────

  describe('约束一：篇幅口径（ch 级）', () => {
    it('writer 的篇幅要求是整节合计，并显式排除内部小节', () => {
      const p = executor.generateWriterPrompt(baseTask, '# kit');
      // Bug 41 修复：默认 minChapterChars 改为 5000
      expect(p).toContain('5000 字');
      expect(p).toMatch(/整个章节（本 ch）|整节/);
      expect(p).toContain('不按'); // 「不按内部小节分别计算」
    });

    it('reviewer 的篇幅检查按整节合计，并显式排除内部小节', () => {
      const p = executor.generateReviewerPrompt(baseTask, '# 正文', baseline);
      // Bug 41 修复：默认 minChapterChars 改为 5000
      expect(p).toContain('5000 字');
      expect(p).toContain('不按');
    });

    it('fixer 的篇幅要求是整节合计', () => {
      const p = executor.generateFixPrompt(baseTask, '# 正文', '# 报告', 1);
      // Bug 41 修复：默认 minChapterChars 改为 5000
      expect(p).toContain('5000 字');
      expect(p).toMatch(/整个章节|整节/);
    });

    it('三份 prompt 都不得出现「每个子节 … 字」这种小节级口径', () => {
      const prompts = [
        executor.generateWriterPrompt(baseTask, '# kit'),
        executor.generateReviewerPrompt(baseTask, '# 正文', baseline),
        executor.generateFixPrompt(baseTask, '# 正文', '# 报告', 1),
      ];
      for (const p of prompts) {
        // 曾经的事故措辞（含 5000 和 3000-5000 两种版本）
        expect(p).not.toMatch(/每个子节[^\n]{0,20}\d{4}\s*字/);
        expect(p).not.toContain('每个子节（## 或 ### 下的内容）整体不少于');
      }
    });
  });

  // ── 约束二：职责分离 ─────────────────────────────────────────

  describe('约束二：职责分离', () => {
    it('writer 明确「写完就结束、不自查字数」', () => {
      const p = executor.generateWriterPrompt(baseTask, '# kit');
      expect(p).toMatch(/写完[^\n]{0,10}结束|写完即止/);
      expect(p).toContain('不要检查字数');
    });

    it('writer 声明篇幅检查由审阅阶段负责', () => {
      const p = executor.generateWriterPrompt(baseTask, '# kit');
      expect(p).toMatch(/审阅(阶段)?[^\n]{0,20}(负责|检查)/);
    });

    it('reviewer 声明篇幅检查是自己的核心职责', () => {
      const p = executor.generateReviewerPrompt(baseTask, '# 正文', baseline);
      expect(p).toMatch(/篇幅检查[^\n]{0,20}(核心职责|Reviewer)/);
    });

    it('reviewer 要求给出实际字数与差额', () => {
      const p = executor.generateReviewerPrompt(baseTask, '# 正文', baseline);
      expect(p).toMatch(/实际字数|差额|需要扩充/);
    });

    it('fixer 按审阅报告指出的不足来扩充，并给出扩充方向', () => {
      const p = executor.generateFixPrompt(baseTask, '# 正文', '# 报告', 1);
      expect(p).toMatch(/审阅报告[^\n]{0,30}(字数不足|指出的)/);
      expect(p).toMatch(/扩充方向|如何扩充|通过以下方式/);
    });

    it('fixer 也明确「写完就结束、不自查字数」', () => {
      const p = executor.generateFixPrompt(baseTask, '# 正文', '# 报告', 1);
      expect(p).toContain('不要检查字数');
    });
  });

  // ── 约束三：两条约束不互相削弱 ────────────────────────────────

  describe('约束三：职责分离不得削弱篇幅下限', () => {
    it('writer 的完成标准仍包含硬性字数下限，而不只是「建议」', () => {
      const p = executor.generateWriterPrompt(baseTask, '# kit');
      expect(p).toMatch(new RegExp(`≥\\s*\\$?\\{?${MIN_CHAPTER_CHARS}|不少于\\s*\\$?\\{?${MIN_CHAPTER_CHARS}`));
    });

    it('篇幅要求不得被降级为「建议 3000-5000 字」这种模糊区间', () => {
      const prompts = [
        executor.generateWriterPrompt(baseTask, '# kit'),
        executor.generateReviewerPrompt(baseTask, '# 正文', baseline),
        executor.generateFixPrompt(baseTask, '# 正文', '# 报告', 1),
      ];
      for (const p of prompts) {
        // 「建议 3000-5000 字」既错层级、又把硬下限降成区间
        expect(p).not.toMatch(/建议\s*3000-5000|3000-5000\s*字/);
      }
    });
  });
});
