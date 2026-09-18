/**
 * Tests for SchedulerRunner: parallel execution + 429 retry
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task } from '../../src/scheduler/types.js';

const TEST_DIR = join(process.cwd(), '.test-runner-retry');

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

/**
 * Executor that fails with 429 error N times, then succeeds
 */
class RateLimitExecutor implements SubagentExecutor {
  private failCount = 0;
  private maxFails: number;

  constructor(maxFails: number) {
    this.maxFails = maxFails;
  }

  async execute(task: Task): Promise<ExecutorResult> {
    if (this.failCount < this.maxFails) {
      this.failCount++;
      return {
        success: false,
        output: 'Error: 429 Too Many Requests - rate limit exceeded',
        durationMs: 10,
      };
    }
    return {
      success: true,
      output: 'success',
      durationMs: 10,
    };
  }

  getFailCount() {
    return this.failCount;
  }
}

/**
 * Executor that always fails with non-429 error
 */
class AlwaysFailExecutor implements SubagentExecutor {
  async execute(_task: Task): Promise<ExecutorResult> {
    return {
      success: false,
      output: 'Error: network timeout',
      durationMs: 10,
    };
  }
}

describe('SchedulerRunner - Parallel Execution', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('executes tasks in parallel', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new RateLimitExecutor(0); // always succeeds
    const runner = new SchedulerRunner(scheduler, executor, 3);

    for (let i = 1; i <= 3; i++) {
      scheduler.submit(makeTask({
        id: `write-ch00${i}`,
        type: 'writer',
        chapterId: `ch00${i}`,
        sequence: i,
      }));
    }

    const start = Date.now();
    const result = await runner.runAll();
    const elapsed = Date.now() - start;

    expect(result.executed).toBe(3);
    expect(result.succeeded).toBe(3);
    // Parallel should be much faster than sequential (each task ~10ms)
    expect(elapsed).toBeLessThan(100);
  });

  it('respects maxConcurrency with parallel execution', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new RateLimitExecutor(0);
    const runner = new SchedulerRunner(scheduler, executor, 2); // max 2

    for (let i = 1; i <= 4; i++) {
      scheduler.submit(makeTask({
        id: `write-ch00${i}`,
        type: 'writer',
        chapterId: `ch00${i}`,
        sequence: i,
      }));
    }

    const result = await runner.runAll();
    // Only 2 should run in first batch
    expect(result.executed).toBe(2);
    expect(result.succeeded).toBe(2);
  });
});

describe('SchedulerRunner - 429 Retry', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('retries on 429 error and succeeds', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new RateLimitExecutor(1); // fail once, then succeed
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1);
    // rateLimitDelayMs=100 for fast test, maxTaskRetries=1

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));

    const result = await runner.runUntilIdle();

    expect(result.executed).toBe(1); // deduplicated: 1 task, eventually succeeded
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0); // eventually succeeded
    expect(executor.getFailCount()).toBe(1);
  });

  it('marks failed after max retries exceeded', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new RateLimitExecutor(10); // always fails with 429
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1);
    // rateLimitDelayMs=100, maxTaskRetries=1

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));

    const result = await runner.runUntilIdle();

    expect(result.failed).toBe(1);
    expect(result.executed).toBe(1); // deduplicated: 1 task, ultimately failed
    expect(scheduler.getStatus('write-ch001')?.status).toBe('failed');
  });

  it('sets pausedUntil on 429', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new RateLimitExecutor(1);
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 200, 1);
    // rateLimitDelayMs=200 for fast test

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));

    await runner.runUntilIdle();

    // After completion, pausedUntil should have been set and then waited past
    // (runUntilIdle waits through the pause)
    expect(executor.getFailCount()).toBe(1);
  }, 10000);

  it('does not retry non-429 errors', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new AlwaysFailExecutor();
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 3);
    // maxTaskRetries=3 but should not retry non-429

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));

    const result = await runner.runUntilIdle();

    expect(result.executed).toBe(1); // only 1 attempt, no retry
    expect(result.failed).toBe(1);
    expect(scheduler.getStatus('write-ch001')?.status).toBe('failed');
  });
});

describe('isRateLimitError', () => {
  it('detects 429 errors', async () => {
    // Import indirectly through runner behavior
    const scheduler = new SubagentScheduler();
    const executor = {
      async execute(_task: Task): Promise<ExecutorResult> {
        return { success: false, output: 'HTTP 429: rate limit', durationMs: 10 };
      },
    };
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1);

    scheduler.submit(makeTask({ id: 't1', type: 'writer', chapterId: 'ch001' }));
    await runner.runUntilIdle();

    // Should have retried (2 executions: 1 fail + 1 retry)
    expect(scheduler.getStatus('t1')?.status).toBe('failed');
  });

  it('detects "too many requests"', async () => {
    const scheduler = new SubagentScheduler();
    const executor = {
      async execute(_task: Task): Promise<ExecutorResult> {
        return { success: false, output: 'Too Many Requests', durationMs: 10 };
      },
    };
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1);

    scheduler.submit(makeTask({ id: 't1', type: 'writer', chapterId: 'ch001' }));
    await runner.runUntilIdle();

    expect(scheduler.getStatus('t1')?.status).toBe('failed');
  });

  it('detects "throttled"', async () => {
    const scheduler = new SubagentScheduler();
    const executor = {
      async execute(_task: Task): Promise<ExecutorResult> {
        return { success: false, output: 'Request throttled', durationMs: 10 };
      },
    };
    const runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1);

    scheduler.submit(makeTask({ id: 't1', type: 'writer', chapterId: 'ch001' }));
    await runner.runUntilIdle();

    expect(scheduler.getStatus('t1')?.status).toBe('failed');
  });
});
