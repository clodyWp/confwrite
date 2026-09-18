import { describe, it, expect } from 'vitest';
import type { TaskType, TaskStatus } from '../src/state/schema.js';
import type { Task } from '../src/scheduler/types.js';
import { DEFAULT_SCHEDULER_CONFIG } from '../src/scheduler/types.js';

describe('Type consistency — scheduler re-exports from schema', () => {
  it('TaskType includes all 6 types', () => {
    // This test verifies the type includes all expected values
    // by checking that valid values compile and invalid ones don't
    const validTypes: TaskType[] = ['writer', 'reviewer', 'fixer', 'researcher', 'planner', 'diagram'];
    expect(validTypes).toHaveLength(6);
  });

  it('TaskStatus includes all 8 statuses', () => {
    const validStatuses: TaskStatus[] = [
      'queued', 'running', 'completed', 'failed',
      'retrying', 'interrupted', 'blocked', 'skipped',
    ];
    expect(validStatuses).toHaveLength(8);
  });

  it('DEFAULT_SCHEDULER_CONFIG is accessible from scheduler/types', () => {
    expect(DEFAULT_SCHEDULER_CONFIG).toBeDefined();
    expect(DEFAULT_SCHEDULER_CONFIG.maxConcurrency).toBe(2);
    expect(DEFAULT_SCHEDULER_CONFIG.tokenBucketSize).toBe(10);
    expect(DEFAULT_SCHEDULER_CONFIG.tokenRefillRate).toBe(0.5);
    expect(DEFAULT_SCHEDULER_CONFIG.retryBaseDelayMs).toBe(5000);
    expect(DEFAULT_SCHEDULER_CONFIG.retryBackoffMultiplier).toBe(2);
    expect(DEFAULT_SCHEDULER_CONFIG.retryMaxDelayMs).toBe(60000);
    expect(DEFAULT_SCHEDULER_CONFIG.taskTimeoutMs).toBe(600000);
  });

  it('Task interface has sequence field', () => {
    const task: Task = {
      id: 'test-1',
      type: 'writer',
      chapterId: 'ch001',
      status: 'queued',
      attempt: 0,
      priority: 1,
      sequence: 1,
      prompt: 'test prompt',
      dependencies: [],
    };
    expect(task.sequence).toBe(1);
  });

  it('Task interface supports all TaskType values', () => {
    const types: TaskType[] = ['writer', 'reviewer', 'fixer', 'researcher', 'planner', 'diagram'];
    for (const t of types) {
      const task: Task = {
        id: `test-${t}`,
        type: t,
        status: 'queued',
        attempt: 0,
        priority: 1,
        sequence: 1,
        prompt: '',
        dependencies: [],
      };
      expect(task.type).toBe(t);
    }
  });
});
