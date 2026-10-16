/**
 * Verdict Consistency Tests — VC-1 to VC-3
 * 
 * 测试 Reviewer verdict 与审阅报告内容一致性
 * 
 * @see specs/verdict-consistency.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';
import { DEFAULT_CONFIG } from '../../src/config/loader.js';

describe('Verdict Consistency (VC-*)', () => {
  let projectDir: string;
  let validator: OutputValidator;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-verdict-test-'));
    mkdirSync(join(projectDir, 'review'), { recursive: true });
    mkdirSync(join(projectDir, 'drafts', 'chapters'), { recursive: true });
    validator = new OutputValidator(projectDir, DEFAULT_CONFIG);
  });

  afterEach(() => {
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  // Helper: 创建 Reviewer 任务
  function createReviewerTask(chapterId: string): Task {
    return {
      id: `review-${chapterId}-r1`,
      type: 'reviewer',
      chapterId,
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
    };
  }

  // Helper: 创建审阅报告
  function createReviewFile(chapterId: string, round: number, content: object): void {
    const filePath = join(projectDir, 'review', `${chapterId}-r${round}.json`);
    writeFileSync(filePath, JSON.stringify(content, null, 2));
  }

  // Helper: 创建草稿文件
  function createDraftFile(chapterId: string, round: number, content: string): void {
    const filePath = join(projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    writeFileSync(filePath, content);
  }

  describe('VC-1: Verdict 一致性自动修正', () => {
    it('issues 提到字数问题，verdict=accept → 修正为 revise', () => {
      // Given: Reviewer 输出 verdict=accept，但 issues 中包含"字数超标"
      const chapterId = 'ch001';
      const round = 1;
      const wordBudget = { min: 5000, max: 8000 };
      
      // 创建草稿（字数在范围内）
      createDraftFile(chapterId, round, 'x'.repeat(6000));
      
      // 创建审阅报告：verdict=accept，但 issues 提到字数问题
      createReviewFile(chapterId, round, {
        chapterId,
        round,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
        issues: [
          {
            severity: 'medium',
            description: '字数超标，需要精简',
            location: 'section-1',
            suggestion: '删除冗余内容',
          },
        ],
        summary: '总体评价',
      });

      // When
      const task = createReviewerTask(chapterId);
      const result = validator.validate(task, round, wordBudget);

      // Then
      expect(result.verdictCorrected).toBe(true);
      expect(result.correctedVerdict).toBe('revise');
      expect(result.correctionReason).toContain('字数');
    });

    it('独立字数验证发现超标，verdict=accept → 修正为 revise', () => {
      // Given: Reviewer 输出 verdict=accept，草稿实际字数 > wordBudget.max
      const chapterId = 'ch002';
      const round = 1;
      const wordBudget = { min: 5000, max: 8000 };
      
      // 创建草稿（字数超标）
      createDraftFile(chapterId, round, 'x'.repeat(10000)); // 10000 > 8000
      
      // 创建审阅报告：verdict=accept，issues 无字数问题
      createReviewFile(chapterId, round, {
        chapterId,
        round,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
        issues: [],
        summary: '总体评价',
      });

      // When
      const task = createReviewerTask(chapterId);
      const result = validator.validate(task, round, wordBudget);

      // Then
      expect(result.verdictCorrected).toBe(true);
      expect(result.correctedVerdict).toBe('revise');
      expect(result.correctionReason).toContain('独立验证');
    });

    it('无矛盾，verdict=accept → 不修正', () => {
      // Given: Reviewer 输出 verdict=accept，issues 无字数问题，字数在范围内
      const chapterId = 'ch003';
      const round = 1;
      const wordBudget = { min: 5000, max: 8000 };
      
      // 创建草稿（字数在范围内）
      createDraftFile(chapterId, round, 'x'.repeat(6000));
      
      // 创建审阅报告：verdict=accept，无问题
      createReviewFile(chapterId, round, {
        chapterId,
        round,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
        issues: [],
        summary: '总体评价',
      });

      // When
      const task = createReviewerTask(chapterId);
      const result = validator.validate(task, round, wordBudget);

      // Then
      expect(result.verdictCorrected).toBeFalsy(); // undefined or false
      expect(result.correctedVerdict).toBeUndefined();
    });

    it('verdict=revise 时不触发修正逻辑', () => {
      // Given: verdict=revise，即使有字数问题也不修正（已经是 revise）
      const chapterId = 'ch004';
      const round = 1;
      const wordBudget = { min: 5000, max: 8000 };
      
      // 创建草稿（字数超标）
      createDraftFile(chapterId, round, 'x'.repeat(10000));
      
      // 创建审阅报告：verdict=revise
      createReviewFile(chapterId, round, {
        chapterId,
        round,
        verdict: 'revise',
        scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
        issues: [
          {
            severity: 'high',
            description: '字数超标',
            location: 'section-1',
            suggestion: '精简内容',
          },
        ],
        summary: '总体评价',
      });

      // When
      const task = createReviewerTask(chapterId);
      const result = validator.validate(task, round, wordBudget);

      // Then: verdict=revise 时不触发修正逻辑
      expect(result.verdictCorrected).toBeFalsy();
    });
  });

  describe('VC-3: 修正不影响验证结果', () => {
    it('修正后验证结果仍为 false（原始输出有矛盾）', () => {
      // Given: verdict 被自动修正为 revise
      const chapterId = 'ch005';
      const round = 1;
      const wordBudget = { min: 5000, max: 8000 };
      
      // 创建草稿（字数超标）
      createDraftFile(chapterId, round, 'x'.repeat(10000));
      
      // 创建审阅报告：verdict=accept，但有矛盾
      createReviewFile(chapterId, round, {
        chapterId,
        round,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
        issues: [
          {
            severity: 'medium',
            description: '字数超标',
            location: 'section-1',
            suggestion: '精简内容',
          },
        ],
        summary: '总体评价',
      });

      // When
      const task = createReviewerTask(chapterId);
      const result = validator.validate(task, round, wordBudget);

      // Then: 验证结果仍为 false（原始输出有矛盾）
      expect(result.valid).toBe(false);
      expect(result.verdictCorrected).toBe(true);
      expect(result.correctedVerdict).toBe('revise');
    });
  });
});
