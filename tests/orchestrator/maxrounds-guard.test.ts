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
    it('should force complete when validation_failed and consecutiveFailures >= maxRounds (SM-21)', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 5, 5);
      state.chapters['ch001'].consecutiveFailures = 4; // will become 5 after entry increment
      
      // 创建草稿文件（有产物）
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v5.md'), 'test content');
      
      const task = createTask('ch001', 'reviewer');
      
      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
      
      // 应该被强制完成，而不是继续循环
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds_validation');
    });

    it('should NOT increment round in validation_failed path (SM-21)', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 2, 5);
      
      const task = createTask('ch001', 'reviewer');
      const initialRound = state.chapters['ch001'].round;
      
      orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
      
      // SM-21: round 不应递增（consecutiveFailures 用于 maxRounds 守护）
      expect(state.chapters['ch001'].round).toBe(initialRound);
      expect(state.chapters['ch001'].consecutiveFailures).toBe(1);
    });

    it('SM-22: fixer 成功后 round >= maxRounds → 只在无可用修复路径时才强制完成', () => {
      // Given: fixer 成功，round 即将达到 maxRounds
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 4, 5);
      
      const task = createTask('ch001', 'fixer');
      task.attempt = 1;
      
      // When: 没有审阅报告 + 草稿超预算的场景（无可用修复路径）
      orchestrator.updateChapterStatus(state, task, 'success', tempDir);
      
      // Then: 应该被强制完成（因为没有其他修复路径）
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds');
    });

    it('SM-22 对照：有审阅报告 + 草稿超预算 → 当前实现仍会强制完成（限制）', () => {
      // Given: fixer 成功，round 即将达到 maxRounds，有审阅报告 + 草稿超预算
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 4, 5);
      
      // 创建审阅报告（verdict=revise，表示有修复需求）
      const reviewDir = join(tempDir, 'review');
      mkdirSync(reviewDir, { recursive: true });
      writeFileSync(
        join(reviewDir, 'ch001-r4.json'),
        JSON.stringify({
          chapterId: 'ch001',
          round: 4,
          verdict: 'revise',
          issues: [{ severity: 'medium', description: '字数超标，需要压缩' }],
        })
      );
      
      // 创建超预算的草稿（12000 字 > max 10000）
      const draftPath = join(tempDir, 'drafts', 'chapters', 'ch001-v4.md');
      writeFileSync(draftPath, 'x'.repeat(12000));
      
      const task = createTask('ch001', 'fixer');
      task.attempt = 1;
      
      // When
      orchestrator.updateChapterStatus(state, task, 'success', tempDir);
      
      // Then: 当前实现会强制完成（即使有可用修复路径）
      // 这是 maxRounds 守护的安全机制，防止无限循环
      // SM-22 的 verdict 修正在 reviewer 验证阶段生效，不影响 maxRounds 守护
      // TODO: 未来可以考虑在 maxRounds 守护中检查"修复路径可用性"
      // 例如：如果草稿超预算但 fixer 可以继续压缩，允许额外一轮
      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds');
      expect(state.chapters['ch001'].round).toBe(5);
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
    it('SM-16: should mark chapters as terminal when all exceed maxRounds (not blocked)', () => {
      const state = createTestState();
      state.chapters['ch001'] = createChapter('ch001', 5, 5);
      state.chapters['ch001'].lastReviewVerdict = 'revise';
      
      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };
      
      const result = phase4d.validate(ctx);
      
      // SM-16: 不应返回 blocked，而应标记章节为终态
      expect(result.ok).toBe(true);
      // 无产物文件，应标记为 failed
      expect(state.chapters['ch001'].status).toBe('failed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds_in_4d');
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
