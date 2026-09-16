import { describe, it, expect, beforeEach } from 'vitest';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import type { Task } from '../../src/scheduler/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    type: 'writer',
    chapterId: 'ch001',
    status: 'queued',
    attempt: 0,
    priority: 1,
    sequence: 1,
    prompt: 'test prompt',
    dependencies: [],
    ...overrides,
  };
}

describe('SubagentScheduler — mark lifecycle', () => {
  let scheduler: SubagentScheduler;

  beforeEach(() => {
    scheduler = new SubagentScheduler();
  });

  it('markRunning sets status=running and startedAt', () => {
    const task = makeTask();
    scheduler.submit(task);

    scheduler.markRunning('test-task-1');

    const t = scheduler.getTask('test-task-1');
    expect(t).toBeDefined();
    expect(t!.status).toBe('running');
    expect(t!.startedAt).toBeDefined();
    expect(typeof t!.startedAt).toBe('number');
  });

  it('markRunning on non-existent id does not throw', () => {
    expect(() => scheduler.markRunning('non-existent')).not.toThrow();
  });

  it('markCompleted sets status=completed, result, completedAt', () => {
    const task = makeTask();
    scheduler.submit(task);
    scheduler.markRunning('test-task-1');

    scheduler.markCompleted('test-task-1', 'chapter content written');

    const t = scheduler.getTask('test-task-1');
    expect(t!.status).toBe('completed');
    expect(t!.result).toBe('chapter content written');
    expect(t!.completedAt).toBeDefined();
  });

  it('markFailed sets status=failed and error', () => {
    const task = makeTask();
    scheduler.submit(task);
    scheduler.markRunning('test-task-1');

    scheduler.markFailed('test-task-1', 'subagent timeout');

    const t = scheduler.getTask('test-task-1');
    expect(t!.status).toBe('failed');
    expect(t!.error).toBe('subagent timeout');
  });

  it('full lifecycle: queued → running → completed', () => {
    const task = makeTask();
    scheduler.submit(task);

    expect(scheduler.getTask('test-task-1')!.status).toBe('queued');

    scheduler.markRunning('test-task-1');
    expect(scheduler.getTask('test-task-1')!.status).toBe('running');

    scheduler.markCompleted('test-task-1', 'done');
    expect(scheduler.getTask('test-task-1')!.status).toBe('completed');
  });

  it('full lifecycle: queued → running → failed', () => {
    const task = makeTask();
    scheduler.submit(task);

    scheduler.markRunning('test-task-1');
    scheduler.markFailed('test-task-1', 'error occurred');

    const t = scheduler.getTask('test-task-1');
    expect(t!.status).toBe('failed');
    expect(t!.error).toBe('error occurred');
    expect(t!.completedAt).toBeUndefined();
  });

  it('getTask returns undefined for non-existent id', () => {
    expect(scheduler.getTask('non-existent')).toBeUndefined();
  });
});
