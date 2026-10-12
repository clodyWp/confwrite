/**
 * Bug 41: maxRounds 守护失效导致写作循环无法终止
 * 
 * 问题：maxRounds 守护只在 WritingOrchestrator 的 reviewer 成功路径存在，
 * 但有 3 条旁路绕过它：
 * 1. validation_failed 路径
 * 2. fixer 成功路径
 * 3. Phase 状态机 (phase4c/4d)
 * 
 * 设计原则：
 * - 偏差率是目标：字数达标 → 正常结束
 * - 轮次是兜底：超限 → 强制结束（不管质量）
 * - 两者是顺序检查，不是互斥的
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { phases } from '../../src/orchestrator/phases.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';

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

function createTask(chapterId: string, type: 'writer' | 'reviewer' | 'fixer'): Task {
  return {
    id: `task-${chapterId}-${type}`,
    type,
    chapterId,
    status: 'queued',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

describe('Bug 41: maxRounds guard', () => {
  let tempDir: string;
  let orchestrator: WritingOrchestrator;

  beforeEach(() => {
    tempDir = join(process.env.TEMP || '/tmp', `maxrounds-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    orchestrator = new WritingOrchestrator();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('WritingOrchestrator.updateChapterStatus', () => {
    it('should force complete when validation_failed and round >= maxRounds', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 5, 5); // round >= maxRounds
      
      // 创建草稿文件（有产物）
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v5.md'), 'test content');
      
      const task = createTask('ch001', 'reviewer');
      
      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
      
      // 应该被强制完成，而不是继续循环
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds_validation');
    });

    it('should increment round in validation_failed path', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 2, 5);
      
      const task = createTask('ch001', 'reviewer');
      const initialRound = state.chapters['ch001'].round;
      
      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
      
      // round 应该递增
      expect(state.chapters['ch001'].round).toBe(initialRound + 1);
    });

    it('should force complete when fixer succeeds and round >= maxRounds', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 4, 5);
      
      const task = createTask('ch001', 'fixer');
      task.attempt = 1;
      
      orchestrator.updateChapterStatus(state, task, 'success', tempDir);
      
      // fixer 成功后 round 变为 5，应该被强制完成
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds');
    });
  });

  describe('Phase 4c execute', () => {
    it('should force complete chapters exceeding maxRounds', async () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 5, 5); // round >= maxRounds
      state.chapters['ch001'].lastReviewVerdict = 'revise';
      
      const phase4c = phases.get('4c')!;
      const ctx = { state, projectDir: tempDir };
      
      const result = await phase4c.execute(ctx);
      
      // 应该被强制完成
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds');
      // exceeded 独立计数，不计入 pass/revise/reject
      expect(result.params?.exceeded).toBe(1);
      expect(result.params?.pass).toBe(0);
      expect(result.params?.revise).toBe(0);
      expect(result.params?.reject).toBe(0);
    });

    it('SM-14: mixed chapters - pass, revise, reject, exceeded counted separately', async () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 2, 5);
      state.chapters['ch001'].lastReviewVerdict = 'accept';  // pass
      state.chapters['ch002'] = createChapter('ch002', 2, 5);
      state.chapters['ch002'].lastReviewVerdict = 'revise';  // revise (round < maxRounds)
      state.chapters['ch003'] = createChapter('ch003', 2, 5);
      state.chapters['ch003'].lastReviewVerdict = 'reject';  // reject
      state.chapters['ch004'] = createChapter('ch004', 5, 5);
      state.chapters['ch004'].lastReviewVerdict = 'revise';  // exceeded (round >= maxRounds)
      
      const phase4c = phases.get('4c')!;
      const ctx = { state, projectDir: tempDir };

      const result = await phase4c.execute(ctx);

      // 每个类别独立计数
      expect(result.params?.pass).toBe(1);
      expect(result.params?.revise).toBe(1);
      expect(result.params?.reject).toBe(1);
      expect(result.params?.exceeded).toBe(1);
    });

    it('should not force complete chapters within maxRounds', async () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 2, 5); // round < maxRounds
      state.chapters['ch001'].lastReviewVerdict = 'revise';
      
      const phase4c = phases.get('4c')!;
      const ctx = { state, projectDir: tempDir };
      
      await phase4c.execute(ctx);
      
      // 应该保持 reviewed 状态，等待 fixer
      expect(state.chapters['ch001'].status).toBe('reviewed');
    });
  });

  describe('Phase 4d validate', () => {
    it('should reject when all fixable chapters exceed maxRounds', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 5, 5);
      state.chapters['ch001'].lastReviewVerdict = 'revise';
      
      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };
      
      const result = phase4d.validate(ctx);
      
      // 应该返回验证失败
      expect(result.ok).toBe(false);
      expect(result.error).toContain('maxRounds');
    });

    it('should allow fix when chapters are within maxRounds', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 2, 5);
      state.chapters['ch001'].lastReviewVerdict = 'revise';
      
      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };
      
      const result = phase4d.validate(ctx);
      
      // 应该通过验证
      expect(result.ok).toBe(true);
    });
  });
});
