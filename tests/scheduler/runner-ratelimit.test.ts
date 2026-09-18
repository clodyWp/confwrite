/**
 * SchedulerRunner 限流集成测试
 * 
 * 验证 WindowRateLimiter 正确集成到 Runner
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import type { Task } from '../../src/scheduler/types.js';

const TEST_DIR = join(process.cwd(), '.test-runner-ratelimit');

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    type: 'writer',
    chapterId: 'ch001',
    status: 'queued',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: 'Write chapter ch001',
    dependencies: [],
    ...overrides,
  };
}

describe('SchedulerRunner with RateLimiter', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'review'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('无配额时等待后继续执行', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    
    // 配置：100ms 窗口，最多 1 个批次（并行后每批 record 1 次）
    const runner = new SchedulerRunner(scheduler, executor, 2, 100, 1);

    // 提交 4 个任务，maxConcurrency=2 → 分 2 批
    scheduler.submit(makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' }));
    scheduler.submit(makeTask({ id: 'write-ch002-r1', type: 'writer', chapterId: 'ch002', sequence: 2 }));
    scheduler.submit(makeTask({ id: 'write-ch003-r1', type: 'writer', chapterId: 'ch003', sequence: 3 }));
    scheduler.submit(makeTask({ id: 'write-ch004-r1', type: 'writer', chapterId: 'ch004', sequence: 4 }));

    const start = Date.now();
    const result = await runner.runUntilIdle();
    const elapsed = Date.now() - start;

    // 所有任务都应该成功
    expect(result.executed).toBe(4);
    expect(result.succeeded).toBe(4);
    expect(result.failed).toBe(0);

    // 第一批 record 后窗口满（1/1），第二批需等待 100ms
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it('不限流时（windowMs=0）立即执行', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    
    // 不限流
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0);

    scheduler.submit(makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' }));
    scheduler.submit(makeTask({ id: 'write-ch002-r1', type: 'writer', chapterId: 'ch002', sequence: 2 }));
    scheduler.submit(makeTask({ id: 'write-ch003-r1', type: 'writer', chapterId: 'ch003', sequence: 3 }));

    const start = Date.now();
    const result = await runner.runUntilIdle();
    const elapsed = Date.now() - start;

    expect(result.executed).toBe(3);
    expect(result.succeeded).toBe(3);
    
    // 不限流，应该很快完成
    expect(elapsed).toBeLessThan(100);
  });

  it('配额充足时不等待', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    
    // 10秒窗口，最多 10 个任务（配额充足）
    const runner = new SchedulerRunner(scheduler, executor, 3, 10000, 10);

    scheduler.submit(makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' }));
    scheduler.submit(makeTask({ id: 'write-ch002-r1', type: 'writer', chapterId: 'ch002', sequence: 2 }));

    const start = Date.now();
    const result = await runner.runUntilIdle();
    const elapsed = Date.now() - start;

    expect(result.executed).toBe(2);
    expect(result.succeeded).toBe(2);
    
    // 配额充足，应该很快完成
    expect(elapsed).toBeLessThan(50);
  });
});
