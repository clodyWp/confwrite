/**
 * SM-22 集成测试：草稿超预算 + verdict=accept → 流程推进到 fixer
 * 
 * 不变量：任何任务的验收条件不得引用该任务无权修改的产物
 * 
 * 场景：
 * 1. Writer 生成 12000 字草稿（超预算 max=10000）
 * 2. Reviewer 给出 verdict=accept（内容质量合格）
 * 3. OutputValidator 检测到草稿超预算，修正 verdict 为 revise
 * 4. 流程应该推进到 fixer（压缩草稿），而不是强制完成
 * 
 * @see specs/module-contracts.md §2.5 SM-22
 * @see issue-154-review-loop-deadlock.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { Task } from '../../src/scheduler/types.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import { DEFAULT_CONFIG } from '../../src/config/loader.js';

describe('SM-22 集成测试：草稿超预算流程', () => {
  let projectDir: string;
  let validator: OutputValidator;
  let orchestrator: WritingOrchestrator;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-sm22-integration-'));
    mkdirSync(join(projectDir, 'review'), { recursive: true });
    mkdirSync(join(projectDir, 'drafts', 'chapters'), { recursive: true });
    validator = new OutputValidator(projectDir, DEFAULT_CONFIG);
    orchestrator = new WritingOrchestrator();
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

  function createTestState(): ProjectState {
    return {
      slug: 'test',
      title: 'Test',
      currentPhase: '4b',
      status: 'writing',
      round: 1,
      totalChapters: 1,
      targetWords: 5000,
      chapters: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function createChapter(id: string, round: number, maxRounds: number): ChapterState {
    return {
      id,
      title: `Chapter ${id}`,
      status: 'reviewed',
      version: 1,
      round,
      attempt: 0,
      maxRounds,
      consecutiveFailures: 0,
      lastReviewVerdict: 'revise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it('SM-22 集成：草稿 12000 字 + verdict=accept → OutputValidator 修正 verdict 为 revise', () => {
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
      summary: '内容质量合格，但篇幅较长',
    });

    // When: OutputValidator 验证 reviewer 输出
    const task = createReviewerTask(chapterId);
    const result = validator.validate(task, round, wordBudget);

    // Then: 
    // 1. reviewer 验收通过（SM-22: 不因草稿字数判 validation_failed）
    expect(result.valid).toBe(true);
    
    // 2. verdict 被自动修正为 revise（通过 VC-1 路由给 fixer）
    expect(result.verdictCorrected).toBe(true);
    expect(result.correctedVerdict).toBe('revise');
    expect(result.correctionReason).toContain('草稿超预算');
    
    // 3. wordBudgetViolated 标记为 true
    expect(result.wordBudgetViolated).toBe(true);
  });

  it('SM-22 集成：verdict 修正后，章节应该推进到 fixer（不强制完成）', () => {
    // Given: 草稿超预算，verdict 被修正为 revise
    const chapterId = 'ch001';
    const round = 1;
    const maxRounds = 5;
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

    // When: 验证并更新章节状态
    const task = createReviewerTask(chapterId);
    const validationResult = validator.validate(task, round, wordBudget);
    
    // 模拟 orchestrator 使用修正后的 verdict
    const state = createTestState();
    state.chapters[chapterId] = createChapter(chapterId, round, maxRounds);
    
    // 如果有修正的 verdict，使用修正后的值
    const effectiveVerdict = validationResult.verdictCorrected 
      ? validationResult.correctedVerdict 
      : 'accept';
    
    state.chapters[chapterId].lastReviewVerdict = effectiveVerdict;
    
    // 模拟 phase 4c 决策
    if (effectiveVerdict === 'revise' && round < maxRounds) {
      // 应该保持 reviewed 状态，等待 fixer
      state.chapters[chapterId].status = 'reviewed';
    } else if (effectiveVerdict === 'accept') {
      state.chapters[chapterId].status = 'completed';
    }

    // Then: 章节应该保持 reviewed 状态（等待 fixer），而不是被强制完成
    expect(state.chapters[chapterId].status).toBe('reviewed');
    expect(state.chapters[chapterId].lastReviewVerdict).toBe('revise');
    expect(state.chapters[chapterId].status).not.toBe('completed');
  });

  it('SM-22 集成：草稿在预算内 + verdict=accept → 正常完成（不修正 verdict）', () => {
    // Given: 草稿在预算内（7000 字，min=5000, max=10000）
    const chapterId = 'ch002';
    const round = 1;
    const wordBudget = { min: 5000, max: 10000 };

    createDraftFile(chapterId, round, 7000);
    createReviewFile(chapterId, round, {
      chapterId,
      round,
      verdict: 'accept',
      scores: { accuracy: 8, consistency: 8, clarity: 8, depth: 7, quality: 8 },
      issues: [],
      summary: '内容质量合格，篇幅适中',
    });

    // When
    const task = createReviewerTask(chapterId);
    const result = validator.validate(task, round, wordBudget);

    // Then: 验收通过，无需修正
    expect(result.valid).toBe(true);
    expect(result.verdictCorrected).toBeFalsy();
    expect(result.wordBudgetViolated).toBeFalsy();
  });

  it('SM-22 集成：草稿不足下限 + verdict=accept → 修正 verdict 为 revise', () => {
    // Given: 草稿不足下限（3000 < min 5000）
    const chapterId = 'ch003';
    const round = 1;
    const wordBudget = { min: 5000, max: 10000 };

    createDraftFile(chapterId, round, 3000);
    createReviewFile(chapterId, round, {
      chapterId,
      round,
      verdict: 'accept',
      scores: { accuracy: 7, consistency: 7, clarity: 7, depth: 6, quality: 7 },
      issues: [],
      summary: '内容质量基本合格',
    });

    // When
    const task = createReviewerTask(chapterId);
    const result = validator.validate(task, round, wordBudget);

    // Then: verdict 被修正为 revise
    expect(result.valid).toBe(true);
    expect(result.verdictCorrected).toBe(true);
    expect(result.correctedVerdict).toBe('revise');
    expect(result.wordBudgetViolated).toBe(true);
  });
});
