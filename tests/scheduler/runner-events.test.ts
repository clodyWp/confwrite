import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task, SchedulerConfig } from '../../src/scheduler/types.js';
import { EventBus } from '../../src/logging/event-bus.js';
import type { TaskStartEvent, TaskCompleteEvent, TaskFailEvent } from '../../src/logging/types.js';

/**
 * Mock executor for testing
 */
class MockExecutor implements SubagentExecutor {
  private shouldFail: boolean;
  private failError: string;

  constructor(shouldFail = false, failError = 'Error') {
    this.shouldFail = shouldFail;
    this.failError = failError;
  }

  async execute(task: Task): Promise<ExecutorResult> {
    if (this.shouldFail) {
      return {
        success: false,
        output: this.failError,
        durationMs: 100,
      };
    }
    return {
      success: true,
      output: 'Success',
      durationMs: 100,
    };
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task-1',
    type: 'writer',
    chapterId: 'ch001',
    status: 'queued',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: 'Write chapter',
    dependencies: [],
    ...overrides,
  };
}

describe('SchedulerRunner with EventBus', () => {
  let scheduler: SubagentScheduler;
  let executor: MockExecutor;
  let runner: SchedulerRunner;
  let eventBus: EventBus;

  beforeEach(() => {
    scheduler = new SubagentScheduler();
    executor = new MockExecutor();
    eventBus = new EventBus();
    runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 60000, 1, eventBus);
  });

  describe('task events', () => {
    it('should emit task.start event when task begins', async () => {
      const startListener = vi.fn();
      eventBus.subscribe('task.start', startListener);

      const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
      scheduler.submit(task);

      await runner.runUntilIdle();

      expect(startListener).toHaveBeenCalledTimes(1);
      const event = startListener.mock.calls[0][0] as TaskStartEvent;
      expect(event.type).toBe('task.start');
      expect(event.taskId).toBe('write-ch001-r1');
      expect(event.taskType).toBe('writer');
      expect(event.chapterId).toBe('ch001');
    });

    it('should emit task.complete event when task succeeds', async () => {
      const completeListener = vi.fn();
      eventBus.subscribe('task.complete', completeListener);

      const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
      scheduler.submit(task);

      await runner.runUntilIdle();

      expect(completeListener).toHaveBeenCalledTimes(1);
      const event = completeListener.mock.calls[0][0] as TaskCompleteEvent;
      expect(event.type).toBe('task.complete');
      expect(event.taskId).toBe('write-ch001-r1');
      expect(event.taskType).toBe('writer');
      expect(event.chapterId).toBe('ch001');
      expect(event.duration).toBeGreaterThanOrEqual(0);
    });

    it('should emit task.fail event when task fails', async () => {
      executor = new MockExecutor(true, 'Network error');
      runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 60000, 0, eventBus); // maxRetries=0

      const failListener = vi.fn();
      eventBus.subscribe('task.fail', failListener);

      const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
      scheduler.submit(task);

      await runner.runUntilIdle();

      expect(failListener).toHaveBeenCalledTimes(1);
      const event = failListener.mock.calls[0][0] as TaskFailEvent;
      expect(event.type).toBe('task.fail');
      expect(event.taskId).toBe('write-ch001-r1');
      expect(event.error).toBe('Network error');
      expect(event.willRetry).toBe(false);
    });

    it('should emit task.fail with willRetry=true for 429 errors', async () => {
      executor = new MockExecutor(true, '429 Too Many Requests');
      // 使用很短的延迟避免测试超时
      runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 100, 1, eventBus);

      const failListener = vi.fn();
      eventBus.subscribe('task.fail', failListener);

      const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
      scheduler.submit(task);

      await runner.runUntilIdle();

      // First failure should have willRetry=true
      expect(failListener).toHaveBeenCalled();
      const firstEvent = failListener.mock.calls[0][0] as TaskFailEvent;
      expect(firstEvent.willRetry).toBe(true);
      expect(firstEvent.retryDelay).toBe(100);
    }, 10000);

    it('should include concurrency info in task.start event', async () => {
      const startListener = vi.fn();
      eventBus.subscribe('task.start', startListener);

      // Submit multiple tasks
      const task1 = makeTask({ id: 'write-ch001-r1', chapterId: 'ch001' });
      const task2 = makeTask({ id: 'write-ch002-r1', chapterId: 'ch002', sequence: 2 });
      const task3 = makeTask({ id: 'write-ch003-r1', chapterId: 'ch003', sequence: 3 });
      scheduler.submit(task1);
      scheduler.submit(task2);
      scheduler.submit(task3);

      await runner.runUntilIdle();

      // Check that concurrency info is included
      expect(startListener).toHaveBeenCalled();
      const event = startListener.mock.calls[0][0] as TaskStartEvent;
      expect(event.concurrency).toBeDefined();
      expect(event.concurrency.max).toBe(3);
    });
  });

  describe('without eventBus', () => {
    it('should work normally without eventBus', async () => {
      // Create runner without eventBus
      runner = new SchedulerRunner(scheduler, executor, 3, 0, 0, 60000, 1);

      const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
      scheduler.submit(task);

      const result = await runner.runUntilIdle();

      expect(result.executed).toBe(1);
      expect(result.succeeded).toBe(1);
    });
  });
});
