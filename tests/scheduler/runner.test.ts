/**
 * Tests for SchedulerRunner and MockSubagentExecutor
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import type { Task } from '../../src/scheduler/types.js';

const TEST_DIR = join(process.cwd(), '.test-runner');

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

describe('SchedulerRunner', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'review'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('executes ready tasks via mock executor', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    const runner = new SchedulerRunner(scheduler, executor);

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));
    scheduler.submit(makeTask({ id: 'write-ch002', type: 'writer', chapterId: 'ch002', sequence: 2 }));

    const result = await runner.runAll();
    expect(result.executed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);

    // Verify tasks marked completed
    expect(scheduler.getStatus('write-ch001')?.status).toBe('completed');
    expect(scheduler.getStatus('write-ch002')?.status).toBe('completed');
  });

  it('writes draft files for writer tasks', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    const runner = new SchedulerRunner(scheduler, executor);

    scheduler.submit(makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' }));

    await runner.runAll();

    const draftPath = join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md');
    expect(existsSync(draftPath)).toBe(true);
    const content = readFileSync(draftPath, 'utf-8');
    expect(content).toContain('ch001');
    expect(content).toContain('mermaid');
  });

  it('writes review JSON for reviewer tasks', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    const runner = new SchedulerRunner(scheduler, executor);

    scheduler.submit(makeTask({ id: 'review-ch001-r1', type: 'reviewer', chapterId: 'ch001' }));

    await runner.runAll();

    const reviewPath = join(TEST_DIR, 'review', 'ch001-r1.json');
    expect(existsSync(reviewPath)).toBe(true);
    const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    expect(review.verdict).toBe('accept');
  });

  it('runUntilIdle processes all queued tasks', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    const runner = new SchedulerRunner(scheduler, executor);

    for (let i = 1; i <= 5; i++) {
      scheduler.submit(makeTask({
        id: `write-ch00${i}`,
        type: 'writer',
        chapterId: `ch00${i}`,
        sequence: i,
      }));
    }

    const result = await runner.runUntilIdle();
    expect(result.succeeded).toBe(5);
    expect(scheduler.getStats().completed).toBe(5);
  });

  it('respects maxConcurrency limit', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(TEST_DIR);
    const runner = new SchedulerRunner(scheduler, executor, 2); // max 2 concurrent

    for (let i = 1; i <= 4; i++) {
      scheduler.submit(makeTask({
        id: `write-ch00${i}`,
        type: 'writer',
        chapterId: `ch00${i}`,
        sequence: i,
      }));
    }

    // First batch: only 2 should run
    const result = await runner.runAll();
    expect(result.executed).toBe(2);
  });
});

describe('MockSubagentExecutor', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('returns success for unknown task types', async () => {
    const executor = new MockSubagentExecutor(TEST_DIR);
    const task = makeTask({ id: 'diagram-1', type: 'diagram' });

    const result = await executor.execute(task);
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('writer creates mermaid content', async () => {
    const executor = new MockSubagentExecutor(TEST_DIR);
    const task = makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' });

    await executor.execute(task);

    expect(task.result).toBeDefined();
    expect(task.result).toContain('mermaid');
  });

  it('reviewer returns accept decision', async () => {
    const executor = new MockSubagentExecutor(TEST_DIR);
    const task = makeTask({ id: 'review-ch001-r1', type: 'reviewer', chapterId: 'ch001' });

    await executor.execute(task);

    expect(task.result).toBeDefined();
    const parsed = JSON.parse(task.result!);
    expect(parsed.decision).toBe('accept');
  });
});
