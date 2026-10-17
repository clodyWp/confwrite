/**
 * SM-22: Reviewer 验收不再绑草稿字数
 * 
 * 不变量：任何任务的验收条件不得引用该任务无权修改的产物
 * 
 * reviewer 任务只验收 review JSON 的存在性、可解析性、verdict 合法性。
 * 草稿字数是 writer 的验收范围，reviewer 不得因草稿字数判 validation_failed。
 * 当草稿超预算且 verdict=accept 时，通过 verdict 修正（VC-1）路由给 fixer。
 * 
 * @see specs/module-contracts.md §2.5 SM-22
 * @see issue-154-review-loop-deadlock.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';
import { DEFAULT_CONFIG } from '../../src/config/loader.js';

describe('SM-22: reviewer 验收不绑草稿字数', () => {
  let projectDir: string;
  let validator: OutputValidator;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-sm22-'));
    mkdirSync(join(projectDir, 'review'), { recursive: true });
    mkdirSync(join(projectDir, 'drafts', 'chapters'), { recursive: true });
    validator = new OutputValidator(projectDir, DEFAULT_CONFIG);
  });

  afterEach(() => {
    if (existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

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

  function createReviewFile(chapterId: string, round: number, content: object): void {
    const filePath = join(projectDir, 'review', `${chapterId}-r${round}.json`);
    writeFileSync(filePath, JSON.stringify(content, null, 2));
  }

  function createDraftFile(chapterId: string, round: number, charCount: number): void {
    const filePath = join(projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    writeFileSync(filePath, 'x'.repeat(charCount));
  }

  it('SM-22: 草稿 12000 字 + verdict=accept → valid=true, verdictCorrected=true, correctedVerdict=revise', () => {
    // Given: 草稿超预算（12000 > max 10000），reviewer 给了 verdict=accept
    const chapterId = 'ch001';
    const round = 1;
    const wordBudget = { min: 5000, max: 10000 };

    createDraftFile(chapterId, round, 12000);
    createReviewFile(chapterId, round, {
      chapterId,
      round,
      verdict: 'accept',
      scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
      issues: [],
      summary: '内容质量合格',
    });

    // When
    const task = createReviewerTask(chapterId);
    const result = validator.validate(task, round, wordBudget);

    // Then: reviewer 验收通过（不因草稿字数判 validation_failed）
    expect(result.valid).toBe(true);
    // 但 verdict 被自动修正为 revise（通过 VC-1 路由给 fixer）
    expect(result.verdictCorrected).toBe(true);
    expect(result.correctedVerdict).toBe('revise');
    expect(result.correctionReason).toContain('草稿超预算');
  });

  it('SM-22: 草稿 7000 字 + verdict=revise → valid=true, verdictCorrected=false', () => {
    // Given: 草稿在预算内（5000 < 7000 < 10000），reviewer 给了 verdict=revise
    const chapterId = 'ch002';
    const round = 1;
    const wordBudget = { min: 5000, max: 10000 };

    createDraftFile(chapterId, round, 7000);
    createReviewFile(chapterId, round, {
      chapterId,
      round,
      verdict: 'revise',
      scores: { accuracy: 6, consistency: 6, clarity: 6, depth: 5, quality: 6 },
      issues: [
        {
          severity: 'medium',
          description: '部分内容需要补充细节',
          location: 'section-2',
          suggestion: '增加案例分析',
        },
      ],
      summary: '需要进一步完善',
    });

    // When
    const task = createReviewerTask(chapterId);
    const result = validator.validate(task, round, wordBudget);

    // Then: 验收通过，无需修正
    expect(result.valid).toBe(true);
    expect(result.verdictCorrected).toBeFalsy();
  });
});
