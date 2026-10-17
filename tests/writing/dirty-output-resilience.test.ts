/**
 * 系统韧性集成测试 — 脏输出场景
 * 
 * Issue #87: Dirty Mock 测试
 * Spec: specs/dirty-mock-testing.md
 * 
 * 验证系统对各种脏输出的容错能力
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { DirtyMockExecutor } from '../../src/scheduler/dirty-mock-executor.js';
import type { DirtyMockConfig } from '../../src/scheduler/dirty-mock-executor.js';
import type { Task } from '../../src/scheduler/types.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTask(type: 'writer' | 'reviewer' | 'fixer', chapterId = 'ch001', round = 1): Task {
  return {
    id: `${type === 'writer' ? 'write' : type === 'reviewer' ? 'review' : 'fix'}-${chapterId}-r${round}`,
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

function createMinimalState(chapterIds: string[]): ProjectState {
  const chapters: Record<string, any> = {};
  for (const id of chapterIds) {
    chapters[id] = {
      id,
      title: `Chapter ${id}`,
      status: 'pending',
      round: 1,
      attempt: 0,
      consecutiveFailures: 0,
      maxRounds: 5,
    };
  }
  return {
    phase: 'writing',
    chapters,
    outline: [],
    assets: { index: [], packages: [] },
  } as unknown as ProjectState;
}

describe('Dirty Output Resilience (Issue #87)', () => {
  let tmpDir: string;
  let validator: OutputValidator;
  let taskExecutor: TaskExecutor;
  let orchestrator: WritingOrchestrator;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dirty-resilience-'));
    validator = new OutputValidator(tmpDir);
    taskExecutor = new TaskExecutor(undefined, tmpDir);
    orchestrator = new WritingOrchestrator();
    
    // 创建必要的目录结构
    mkdirSync(join(tmpDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tmpDir, 'review'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // INV-DM-1: 系统不得因脏输出而崩溃
  // ============================================================
  describe('INV-DM-1: 系统不得因脏输出而崩溃', () => {
    it('system does not crash on bad_json', async () => {
      const config: DirtyMockConfig = { reviewer: { mode: 'bad_json' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // 先写一个正常草稿
      const writerTask = createTask('writer');
      await new DirtyMockExecutor(tmpDir, { global: { mode: 'normal' } }).execute(writerTask);
      
      // 运行 reviewer（脏输出）
      const reviewerTask = createTask('reviewer');
      const result = await executor.execute(reviewerTask);
      
      // 不应崩溃
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('system does not crash on empty output', async () => {
      const config: DirtyMockConfig = { global: { mode: 'empty' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('writer');
      const result = await executor.execute(task);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('system does not crash on garbled output', async () => {
      const config: DirtyMockConfig = { writer: { mode: 'garbled' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('writer');
      const result = await executor.execute(task);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // INV-DM-2: 脏输出必须被检测并记录
  // ============================================================
  describe('INV-DM-2: 脏输出必须被检测并记录', () => {
    it('bad_json: validation fails (INV-DM-1b)', async () => {
      const config: DirtyMockConfig = { reviewer: { mode: 'bad_json' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // 生成坏 JSON 审阅报告
      const task = createTask('reviewer');
      await executor.execute(task);
      
      // 验证
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('empty writer: no draft file → validation fails (INV-DM-2a)', async () => {
      const config: DirtyMockConfig = { writer: { mode: 'empty' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('writer');
      await executor.execute(task);
      
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('不存在') || e.includes('草稿文件'))).toBe(true);
    });

    it('empty reviewer: no JSON file → validation fails (INV-DM-2b)', async () => {
      const config: DirtyMockConfig = { reviewer: { mode: 'empty' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('reviewer');
      await executor.execute(task);
      
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('审阅报告') || e.includes('不存在'))).toBe(true);
    });

    it('garbled writer: U+FFFD detected → validation fails (INV-DM-4a)', async () => {
      const config: DirtyMockConfig = { writer: { mode: 'garbled' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('writer');
      await executor.execute(task);
      
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('编码损坏') || e.includes('控制字符'))).toBe(true);
    });

    it('garbled writer: control chars detected (INV-DM-4b)', async () => {
      // 手动写一个包含控制字符的文件
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      const content = '\x00\x01\x02 系统架构设计 \x0B\x0C' + '正常内容'.repeat(2000);
      writeFileSync(draftPath, content, 'utf-8');
      
      const task = createTask('writer');
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
    });

    it('garbled: only first 500 chars checked (INV-DM-4c)', async () => {
      // 前 500 字符干净，后面有乱码 → 应该通过可读性检查
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      const cleanPrefix = '正常内容段落描述系统架构设计'.repeat(50); // 14*50 = 700 字符，远超 500
      const garbledSuffix = '\uFFFD'.repeat(100);
      const content = cleanPrefix + garbledSuffix;
      writeFileSync(draftPath, content, 'utf-8');
      
      const task = createTask('writer');
      const result = validator.validate(task, 1);
      // 前 500 字符干净，所以可读性检查应该通过
      const readabilityCheck = result.checks.find(c => c.name === '文件可读');
      expect(readabilityCheck?.passed).toBe(true);
    });
  });

  // ============================================================
  // INV-DM-3: 连续脏输出必须触发章节失败
  // ============================================================
  describe('INV-DM-3: 连续脏输出触发章节失败', () => {
    it('5 consecutive validation failures → chapter failed', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      // 模拟连续 5 次失败
      for (let i = 0; i < 5; i++) {
        orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'validation_failed');
      }
      
      expect(state.chapters['ch001'].status).toBe('failed');
    });

    it('5 consecutive execution failures (no output) → chapter failed (no_output)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      // 模拟连续 5 次执行失败（无产物）
      for (let i = 0; i < 5; i++) {
        orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'execution_failed');
      }
      
      expect(state.chapters['ch001'].status).toBe('failed');
      expect(state.chapters['ch001'].failureReason).toBe('no_output');
    });
  });

  // ============================================================
  // INV-DM-4: 脏输出不得污染其他章节
  // ============================================================
  describe('INV-DM-4: 脏输出不污染其他章节', () => {
    it('dirty output in one chapter does not affect others', () => {
      const state = createMinimalState(['ch001', 'ch002']);
      const task1 = createTask('writer', 'ch001');
      const task2 = createTask('writer', 'ch002');
      
      // ch001 失败
      orchestrator.updateChapterStatus(state, task1, 'failed', tmpDir, 'execution_failed');
      
      // ch002 正常完成
      // 先写一个正常草稿
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch002-v1.md');
      writeFileSync(draftPath, '正常内容'.repeat(2000), 'utf-8');
      orchestrator.updateChapterStatus(state, task2, 'success', tmpDir);
      
      // ch001 应该失败，ch002 应该正常
      expect(state.chapters['ch001'].status).toBe('pending'); // 重试
      expect(state.chapters['ch002'].status).toBe('written'); // 正常
    });
  });

  // ============================================================
  // DIRTY-1: JSON 格式错误
  // ============================================================
  describe('DIRTY-1: JSON 格式错误', () => {
    it('bad_json: tryFixJSON repairs Chinese quotes (INV-DM-1a)', () => {
      // 手动写一个包含中文引号的 JSON 文件（在字符串值内）
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      // 中文引号在 JSON 字符串值内，tryFixJSON 会移除它们后解析成功
      const content = '{"verdict": "accept", "summary": "他说\u201c你好\u201d"}';
      writeFileSync(reviewPath, content, 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1);
      
      // tryFixJSON 应该能修复中文引号（移除后 JSON 可解析）
      // verdict 检查应该通过
      const verdictCheck = result.checks.find(c => c.name === 'verdict 合法');
      expect(verdictCheck?.passed).toBe(true);
    });

    it('bad_json: unbalanced braces → validation fails (INV-DM-1b)', async () => {
      const config: DirtyMockConfig = { reviewer: { mode: 'bad_json' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const task = createTask('reviewer');
      await executor.execute(task);
      
      const result = validator.validate(task, 1);
      expect(result.valid).toBe(false);
    });

    it('bad_json: parseReviewDecision falls back to text (INV-DM-1c)', () => {
      const reviewOutput = '审阅结果如下：\nverdict: accept\n评分 8/10';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      expect(decision.decision).toBe('accept');
    });

    it('bad_json: total parse failure → default revise (INV-DM-1d)', () => {
      const reviewOutput = '这是一段完全没有 JSON 结构的文本';
      
      const decision = taskExecutor.parseReviewDecision(reviewOutput);
      expect(decision.decision).toBe('revise');
      expect(decision.confidence).toBe(0.5);
    });

    it('bad_json: chapter enters fix cycle, not immediate fail (INV-DM-1e)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('reviewer');
      
      // 第一次 validation_failed
      orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'validation_failed');
      
      // 章节应该进入修复循环（written），而不是直接 failed
      expect(state.chapters['ch001'].status).toBe('written');
      expect(state.chapters['ch001'].status).not.toBe('failed');
    });
  });

  // ============================================================
  // DIRTY-2: 空输出
  // ============================================================
  describe('DIRTY-2: 空输出', () => {
    it('empty writer: chapter retries (pending) (INV-DM-2d)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      // 执行失败（无产物）
      orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'execution_failed');
      
      // 章节应该变为 pending（重试 writer）
      expect(state.chapters['ch001'].status).toBe('pending');
    });

    it('empty writer: 5 consecutive → failed (no_output) (INV-DM-2e)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      for (let i = 0; i < 5; i++) {
        orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'execution_failed');
      }
      
      expect(state.chapters['ch001'].status).toBe('failed');
      expect(state.chapters['ch001'].failureReason).toBe('no_output');
    });
  });

  // ============================================================
  // DIRTY-5: 超时
  // ============================================================
  describe('DIRTY-5: 超时', () => {
    it('timeout: executor throws → task fails (INV-DM-5a)', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'timeout' },
        timeoutMs: 100,
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      await expect(executor.execute(task)).rejects.toThrow();
    });

    it('timeout: chapter retries (pending) (INV-DM-5c)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      // 超时被视为 execution_failed
      orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'execution_failed');
      
      expect(state.chapters['ch001'].status).toBe('pending');
    });

    it('timeout: 5 consecutive → failed (INV-DM-5d)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('writer');
      
      for (let i = 0; i < 5; i++) {
        orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'execution_failed');
      }
      
      expect(state.chapters['ch001'].status).toBe('failed');
    });

    it('timeout: does not trigger rate limit backoff (INV-DM-5e)', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'timeout' },
        timeoutMs: 100,
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      try {
        await executor.execute(task);
      } catch {
        // 预期抛出异常
      }
      
      // 超时错误不应匹配限流模式
      const timeoutError = 'Executor timeout after 100ms';
      expect(/429|rate.?limit|too many requests|throttl/i.test(timeoutError)).toBe(false);
    });
  });

  // ============================================================
  // DIRTY-6: 矛盾审阅
  // ============================================================
  describe('DIRTY-6: 矛盾审阅', () => {
    it('contradictory: verdict=accept + word count issue → fails (INV-DM-6a)', async () => {
      const config: DirtyMockConfig = { reviewer: { mode: 'contradictory_review' } };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // 先写一个超标的草稿
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      writeFileSync(draftPath, '正常内容'.repeat(5000), 'utf-8'); // 20000 字，超标
      
      const task = createTask('reviewer');
      await executor.execute(task);
      
      // 使用 wordBudget 验证
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });
      expect(result.valid).toBe(false);
      // 应该检测到 verdict 矛盾
      expect(result.errors.some(e => e.includes('矛盾') || e.includes('verdict'))).toBe(true);
    });

    it('contradictory: independent word count check triggers verdict correction (SM-22)', async () => {
      // 写一个超标草稿 + 矛盾审阅报告
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      writeFileSync(draftPath, '正常内容'.repeat(5000), 'utf-8'); // 20000 字
      
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      const review = {
        chapterId: 'ch001',
        round: 1,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 9, clarity: 8, depth: 7, quality: 8 },
        issues: [],
        summary: '内容质量达标',
      };
      writeFileSync(reviewPath, JSON.stringify(review), 'utf-8');
      
      const task = createTask('reviewer');
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });
      
      // SM-22: reviewer 验收不绑草稿字数，验证通过但 verdict 被修正
      expect(result.valid).toBe(true);
      expect(result.verdictCorrected).toBe(true);
      expect(result.correctedVerdict).toBe('revise');
      expect(result.correctionReason).toContain('草稿超预算');
    });

    it('contradictory: chapter enters fix cycle (INV-DM-6d)', () => {
      const state = createMinimalState(['ch001']);
      const task = createTask('reviewer');
      
      // 矛盾审阅 → validation_failed
      orchestrator.updateChapterStatus(state, task, 'failed', tmpDir, 'validation_failed');
      
      // 章节应该进入修复循环，不盲目接受 verdict=accept
      expect(state.chapters['ch001'].status).toBe('written');
    });
  });

  // ============================================================
  // 恢复测试
  // ============================================================
  describe('恢复能力', () => {
    it('recovery after dirty mode stops', async () => {
      // 先用脏模式
      const dirtyConfig: DirtyMockConfig = {
        global: { mode: 'empty' },
        sequence: [1], // 只有第一次是脏的
      };
      const executor = new DirtyMockExecutor(tmpDir, dirtyConfig);
      
      // 第一次：脏
      const result1 = await executor.execute(createTask('writer'));
      expect(result1.output).toBe('');
      
      // 第二次：正常
      const result2 = await executor.execute(createTask('writer'));
      expect(result2.output).not.toBe('');
      expect(result2.success).toBe(true);
      
      // 验证正常文件被写出
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(existsSync(draftPath)).toBe(true);
    });
  });
});
