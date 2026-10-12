import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task } from '../../src/scheduler/types.js';
import { EventBus } from '../../src/logging/event-bus.js';
import type { TaskStartEvent } from '../../src/logging/types.js';

/**
 * Simple mock executor that always succeeds
 */
class MockExecutor implements SubagentExecutor {
  async execute(_task: Task): Promise<ExecutorResult> {
    return { success: true, output: 'Success', durationMs: 10 };
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

describe('SM-14: task.start 事件包含正确的 chapter.round', () => {
  let scheduler: SubagentScheduler;
  let executor: MockExecutor;
  let eventBus: EventBus;

  beforeEach(() => {
    scheduler = new SubagentScheduler();
    executor = new MockExecutor();
    eventBus = new EventBus();
  });

  it('round 字段匹配 chapter.round（不是硬编码 1）', async () => {
    // 模拟 state.chapters['ch001'].round = 3
    const chapterRoundLookup = (chapterId: string): number => {
      if (chapterId === 'ch001') return 3;
      return 0;
    };

    const runner = new SchedulerRunner(
      scheduler, executor, 3, 0, 0, 60000, 1, eventBus,
      chapterRoundLookup,
    );

    const startListener = vi.fn();
    eventBus.subscribe('task.start', startListener);

    const task = makeTask({ id: 'write-ch001-r3', type: 'writer', chapterId: 'ch001' });
    scheduler.submit(task);

    await runner.runUntilIdle();

    expect(startListener).toHaveBeenCalledTimes(1);
    const event = startListener.mock.calls[0][0] as TaskStartEvent;
    expect(event.type).toBe('task.start');
    expect(event.round).toBe(3); // 不是硬编码的 1
  });

  it('无 chapterId 时 round 为 0', async () => {
    const chapterRoundLookup = (_chapterId: string): number => 0;

    const runner = new SchedulerRunner(
      scheduler, executor, 3, 0, 0, 60000, 1, eventBus,
      chapterRoundLookup,
    );

    const startListener = vi.fn();
    eventBus.subscribe('task.start', startListener);

    // task without chapterId
    const task = makeTask({ id: 'task-no-chapter', type: 'writer', chapterId: undefined });
    scheduler.submit(task);

    await runner.runUntilIdle();

    expect(startListener).toHaveBeenCalledTimes(1);
    const event = startListener.mock.calls[0][0] as TaskStartEvent;
    expect(event.round).toBe(0);
  });

  it('无 chapterRoundLookup 时 round 默认为 0', async () => {
    // No lookup function provided — backward compatible
    const runner = new SchedulerRunner(
      scheduler, executor, 3, 0, 0, 60000, 1, eventBus,
    );

    const startListener = vi.fn();
    eventBus.subscribe('task.start', startListener);

    const task = makeTask({ id: 'write-ch001-r1', type: 'writer', chapterId: 'ch001' });
    scheduler.submit(task);

    await runner.runUntilIdle();

    expect(startListener).toHaveBeenCalledTimes(1);
    const event = startListener.mock.calls[0][0] as TaskStartEvent;
    expect(event.round).toBe(0); // default when no lookup provided
  });

  it('不同章节的 round 各自正确', async () => {
    const rounds: Record<string, number> = {
      'ch001': 2,
      'ch002': 5,
    };
    const chapterRoundLookup = (chapterId: string): number => rounds[chapterId] ?? 0;

    const runner = new SchedulerRunner(
      scheduler, executor, 3, 0, 0, 60000, 1, eventBus,
      chapterRoundLookup,
    );

    const startListener = vi.fn();
    eventBus.subscribe('task.start', startListener);

    scheduler.submit(makeTask({ id: 'write-ch001', type: 'writer', chapterId: 'ch001' }));
    scheduler.submit(makeTask({ id: 'write-ch002', type: 'writer', chapterId: 'ch002', sequence: 2 }));

    await runner.runUntilIdle();

    expect(startListener).toHaveBeenCalledTimes(2);
    const events = startListener.mock.calls.map((c: unknown[]) => c[0] as TaskStartEvent);
    const ch001Event = events.find(e => e.chapterId === 'ch001');
    const ch002Event = events.find(e => e.chapterId === 'ch002');
    expect(ch001Event?.round).toBe(2);
    expect(ch002Event?.round).toBe(5);
  });
});
