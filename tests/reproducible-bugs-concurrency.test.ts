/**
 * 可复现的 Bug 测试用例 - 并发问题
 * 
 * Issue #43: Writer/Fixer 并发始终为 0/1，未实现并行写作
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigurableMockExecutor } from '../src/scheduler/configurable-mock-executor.js';
import type { Task } from '../src/scheduler/types.js';

describe('可复现的 Bug 测试用例 - 并发问题', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Issue #43: Writer/Fixer 并发', () => {
    it('应该能够同时执行多个 Writer 任务', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
      });

      // 同时启动 3 个 Writer 任务
      const tasks: Task[] = [];
      for (let i = 1; i <= 3; i++) {
        tasks.push({
          id: `write-ch00${i}-r1`,
          type: 'writer',
          chapterId: `ch00${i}`,
          status: 'pending',
          priority: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 并行执行
      const results = await Promise.all(tasks.map(t => executor.execute(t)));

      // 验证所有任务都成功完成
      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('应该能够同时执行多个 Fixer 任务', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        fixer: { wordCount: 7000, behavior: 'normal' },
      });

      // 同时启动 3 个 Fixer 任务
      const tasks: Task[] = [];
      for (let i = 1; i <= 3; i++) {
        tasks.push({
          id: `fix-ch00${i}-r1`,
          type: 'fixer',
          chapterId: `ch00${i}`,
          status: 'pending',
          priority: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 并行执行
      const results = await Promise.all(tasks.map(t => executor.execute(t)));

      // 验证所有任务都成功完成
      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('应该能够同时执行 Writer 和 Reviewer 任务', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
        reviewer: { verdict: 'accept' },
      });

      // 同时启动 Writer 和 Reviewer 任务
      const writeTask: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const reviewTask: Task = {
        id: 'review-ch002-r1',
        type: 'reviewer',
        chapterId: 'ch002',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 并行执行
      const results = await Promise.all([
        executor.execute(writeTask),
        executor.execute(reviewTask),
      ]);

      // 验证所有任务都成功完成
      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
