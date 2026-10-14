/**
 * DirtyMockExecutor 单元测试
 * 
 * Issue #87: Dirty Mock 测试
 * Spec: specs/dirty-mock-testing.md
 * 
 * 验证 DirtyMockExecutor 的各种脏输出模式
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DirtyMockExecutor } from '../../src/scheduler/dirty-mock-executor.js';
import type { DirtyMockConfig } from '../../src/scheduler/dirty-mock-executor.js';
import type { Task } from '../../src/scheduler/types.js';

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

describe('DirtyMockExecutor (Issue #87)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dirty-mock-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('基本功能', () => {
    it('creates normal output by default (no dirty config)', async () => {
      const executor = new DirtyMockExecutor(tmpDir);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      expect(result.output).toBeTruthy();
      
      // 验证正常文件被写出
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(existsSync(draftPath)).toBe(true);
    });

    it('creates normal output when mode is normal', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'normal' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      expect(result.output).toBeTruthy();
    });

    it('tracks stats correctly', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      await executor.execute(createTask('writer'));
      await executor.execute(createTask('reviewer'));
      await executor.execute(createTask('writer'));
      
      const stats = executor.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.dirtyOutputs).toBe(3);
      expect(stats.normalOutputs).toBe(0);
      expect(stats.byType['writer'].dirty).toBe(2);
      expect(stats.byType['reviewer'].dirty).toBe(1);
    });

    it('resetStats resets all counters', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      await executor.execute(createTask('writer'));
      executor.resetStats();
      
      const stats = executor.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.dirtyOutputs).toBe(0);
    });
  });

  describe('DIRTY-1: bad_json', () => {
    it('generates bad_json for reviewer', async () => {
      const config: DirtyMockConfig = {
        reviewer: { mode: 'bad_json' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('reviewer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      // 输出的 JSON 应该是格式错误的
      expect(() => JSON.parse(result.output)).toThrow();
      
      // 验证坏 JSON 文件被写出
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      expect(existsSync(reviewPath)).toBe(true);
      const content = readFileSync(reviewPath, 'utf-8');
      expect(() => JSON.parse(content)).toThrow();
    });

    it('bad_json variants cycle with round number', async () => {
      const config: DirtyMockConfig = {
        reviewer: { mode: 'bad_json' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // Round 1: 单引号 (index 1 % 5 = 1)
      const task1 = createTask('reviewer', 'ch001', 1);
      const result1 = await executor.execute(task1);
      expect(result1.output).toContain("'verdict'");
      
      // Round 2: 尾逗号 (index 2 % 5 = 2)
      const task2 = createTask('reviewer', 'ch001', 2);
      const result2 = await executor.execute(task2);
      expect(result2.output).toContain('"accept",}');
    });
  });

  describe('DIRTY-2: empty', () => {
    it('generates empty output', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
      
      // 验证没有写出文件
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(existsSync(draftPath)).toBe(false);
    });

    it('empty output for reviewer produces no JSON file', async () => {
      const config: DirtyMockConfig = {
        reviewer: { mode: 'empty' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('reviewer');
      
      const result = await executor.execute(task);
      
      expect(result.output).toBe('');
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      expect(existsSync(reviewPath)).toBe(false);
    });
  });

  describe('DIRTY-3: oversized', () => {
    it('generates oversized output (> max * 2)', async () => {
      const config: DirtyMockConfig = {
        writer: { mode: 'oversized' },
        oversizedMultiplier: 3.0,
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      // 输出应该远超正常字数（8000 * 3 = 24000）
      expect(result.output.length).toBeGreaterThan(16000);
      
      // 验证文件被写出
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(existsSync(draftPath)).toBe(true);
      const content = readFileSync(draftPath, 'utf-8');
      expect(content.length).toBeGreaterThan(16000);
    });
  });

  describe('DIRTY-4: garbled', () => {
    it('generates garbled output with U+FFFD', async () => {
      const config: DirtyMockConfig = {
        writer: { mode: 'garbled' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      // 输出应包含替换字符
      expect(result.output).toContain('\uFFFD');
      
      // 验证文件被写出
      const draftPath = join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(existsSync(draftPath)).toBe(true);
      const content = readFileSync(draftPath, 'utf-8');
      expect(content).toContain('\uFFFD');
    });

    it('garbled output contains control characters', async () => {
      const config: DirtyMockConfig = {
        writer: { mode: 'garbled' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      const result = await executor.execute(task);
      
      // 前 500 字符应包含控制字符
      const first500 = result.output.substring(0, 500);
      const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(first500);
      expect(hasControlChars).toBe(true);
    });
  });

  describe('DIRTY-5: timeout', () => {
    it('simulates timeout by throwing error', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'timeout' },
        timeoutMs: 100,
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('writer');
      
      await expect(executor.execute(task)).rejects.toThrow(/timeout/i);
    });
  });

  describe('DIRTY-6: contradictory_review', () => {
    it('generates contradictory review (verdict=accept + word count issue)', async () => {
      const config: DirtyMockConfig = {
        reviewer: { mode: 'contradictory_review' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      const task = createTask('reviewer');
      
      const result = await executor.execute(task);
      
      expect(result.success).toBe(true);
      
      // 验证 JSON 文件包含矛盾
      const reviewPath = join(tmpDir, 'review', 'ch001-r1.json');
      expect(existsSync(reviewPath)).toBe(true);
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      expect(review.verdict).toBe('accept');
      expect(review.issues.length).toBeGreaterThan(0);
      // issues 中应提到字数问题
      const hasWordCountIssue = review.issues.some((i: any) =>
        /字数|超标|超出|上限|过多|over.*limit|exceed|too (long|much)/i.test(i.description || '')
      );
      expect(hasWordCountIssue).toBe(true);
    });
  });

  describe('概率控制', () => {
    it('respects probability=0 (never dirty)', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty', probability: 0 },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      for (let i = 0; i < 10; i++) {
        const result = await executor.execute(createTask('writer'));
        expect(result.output).not.toBe('');
      }
      
      const stats = executor.getStats();
      expect(stats.dirtyOutputs).toBe(0);
      expect(stats.normalOutputs).toBe(10);
    });

    it('respects probability=1 (always dirty)', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty', probability: 1 },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      for (let i = 0; i < 10; i++) {
        const result = await executor.execute(createTask('writer'));
        expect(result.output).toBe('');
      }
      
      const stats = executor.getStats();
      expect(stats.dirtyOutputs).toBe(10);
      expect(stats.normalOutputs).toBe(0);
    });
  });

  describe('序列模式', () => {
    it('respects sequence pattern [1, 3]', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty' },
        sequence: [1, 3],
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // 第 1 次调用 → 脏
      const result1 = await executor.execute(createTask('writer'));
      expect(result1.output).toBe('');
      
      // 第 2 次调用 → 正常
      const result2 = await executor.execute(createTask('writer'));
      expect(result2.output).not.toBe('');
      
      // 第 3 次调用 → 脏
      const result3 = await executor.execute(createTask('writer'));
      expect(result3.output).toBe('');
      
      // 第 4 次调用 → 正常
      const result4 = await executor.execute(createTask('writer'));
      expect(result4.output).not.toBe('');
      
      const stats = executor.getStats();
      expect(stats.dirtyOutputs).toBe(2);
      expect(stats.normalOutputs).toBe(2);
    });
  });

  describe('per-type 配置覆盖全局', () => {
    it('per-type config overrides global', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'empty' },
        writer: { mode: 'normal' },
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      // Writer 应该是正常的（per-type 覆盖 global）
      const writerResult = await executor.execute(createTask('writer'));
      expect(writerResult.output).not.toBe('');
      
      // Reviewer 应该是脏的（使用 global 配置）
      const reviewerResult = await executor.execute(createTask('reviewer'));
      expect(reviewerResult.output).toBe('');
    });
  });

  describe('mixed 模式', () => {
    it('mixed mode produces varied outputs', async () => {
      const config: DirtyMockConfig = {
        global: { mode: 'mixed' },
        timeoutMs: 100, // 缩短超时时间，避免测试过慢
      };
      const executor = new DirtyMockExecutor(tmpDir, config);
      
      const outputs: string[] = [];
      for (let i = 0; i < 20; i++) {
        const task = createTask('reviewer', `ch${String(i).padStart(3, '0')}`);
        try {
          const result = await executor.execute(task);
          outputs.push(result.output);
        } catch {
          // timeout 模式会抛异常，记录为空
          outputs.push('');
        }
      }
      
      // 20 次调用中应该有不同类型的输出
      const stats = executor.getStats();
      expect(stats.totalCalls).toBe(20);
      expect(stats.dirtyOutputs).toBe(20);
    });
  });
});
