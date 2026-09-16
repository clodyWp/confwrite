import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import type { Task, SchedulerConfig } from '../../src/scheduler/types.js';
import { DEFAULT_SCHEDULER_CONFIG } from '../../src/scheduler/types.js';

let sequenceCounter = 0;

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${sequenceCounter}`,
    type: 'writer',
    chapterId: `ch${String(sequenceCounter).padStart(3, '0')}`,
    status: 'queued',
    priority: 0,
    sequence: sequenceCounter++,
    attempt: 0,
    prompt: 'test prompt',
    dependencies: [],
    ...overrides,
  };
}

describe('SubagentScheduler', () => {
  let scheduler: SubagentScheduler;
  let config: SchedulerConfig;

  beforeEach(() => {
    sequenceCounter = 0;
    config = { ...DEFAULT_SCHEDULER_CONFIG };
    scheduler = new SubagentScheduler(config);
  });

  describe('submit', () => {
    it('adds task to queue', () => {
      const task = createTask();
      scheduler.submit(task);
      expect(scheduler.getQueueSize()).toBe(1);
    });

    it('assigns sequence number if not provided', () => {
      const task = createTask({ sequence: -1 });
      scheduler.submit(task);
      const queued = scheduler.list();
      expect(queued[0].sequence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('list', () => {
    it('returns all tasks', () => {
      scheduler.submit(createTask({ id: 'a' }));
      scheduler.submit(createTask({ id: 'b' }));
      scheduler.submit(createTask({ id: 'c' }));

      const tasks = scheduler.list();
      expect(tasks.length).toBe(3);
      expect(tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array when no tasks', () => {
      expect(scheduler.list()).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('returns task by id', () => {
      const task = createTask({ id: 'test-task' });
      scheduler.submit(task);

      const status = scheduler.getStatus('test-task');
      expect(status).toBeDefined();
      expect(status?.id).toBe('test-task');
    });

    it('returns undefined for unknown id', () => {
      expect(scheduler.getStatus('unknown')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      scheduler.submit(createTask({ id: 'a', status: 'queued' }));
      scheduler.submit(createTask({ id: 'b', status: 'queued' }));
      scheduler.submit(createTask({ id: 'c', status: 'queued' }));

      const stats = scheduler.getStats();
      expect(stats.total).toBe(3);
      expect(stats.queued).toBe(3);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('pause/resume', () => {
    it('pauses and resumes scheduler', () => {
      expect(scheduler.isPaused()).toBe(false);
      
      scheduler.pause();
      expect(scheduler.isPaused()).toBe(true);
      
      scheduler.resume();
      expect(scheduler.isPaused()).toBe(false);
    });
  });

  describe('serialize/deserialize', () => {
    it('round-trips scheduler state', () => {
      scheduler.submit(createTask({ id: 'a', status: 'queued' }));
      scheduler.submit(createTask({ id: 'b', status: 'completed' }));
      scheduler.submit(createTask({ id: 'c', status: 'failed' }));

      const serialized = scheduler.serialize();
      const restored = SubagentScheduler.deserialize(serialized, config);

      expect(restored.list().length).toBe(3);
      expect(restored.getStatus('a')?.status).toBe('queued');
      expect(restored.getStatus('b')?.status).toBe('completed');
      expect(restored.getStatus('c')?.status).toBe('failed');
    });
  });

  describe('dependency checking', () => {
    it('identifies ready tasks (no dependencies)', () => {
      scheduler.submit(createTask({ id: 'a' }));
      scheduler.submit(createTask({ id: 'b' }));

      const ready = scheduler.getReadyTasks();
      expect(ready.length).toBe(2);
    });

    it('blocks tasks with unmet dependencies', () => {
      scheduler.submit(createTask({ id: 'a', status: 'queued' }));
      scheduler.submit(createTask({ id: 'b', dependencies: ['a'] }));

      const ready = scheduler.getReadyTasks();
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe('a');
    });

    it('unblocks tasks when dependencies are completed', () => {
      scheduler.submit(createTask({ id: 'a', status: 'completed' }));
      scheduler.submit(createTask({ id: 'b', dependencies: ['a'] }));

      const ready = scheduler.getReadyTasks();
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe('b');
    });

    it('blocks tasks when dependencies are failed', () => {
      scheduler.submit(createTask({ id: 'a', status: 'failed' }));
      scheduler.submit(createTask({ id: 'b', dependencies: ['a'] }));

      const ready = scheduler.getReadyTasks();
      expect(ready.length).toBe(0);
    });
  });
});
