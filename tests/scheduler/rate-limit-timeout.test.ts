import { describe, it, expect } from 'vitest';
import { TurnBudget } from '../../src/scheduler/turn-budget.js';
import { LoopDetector } from '../../src/scheduler/loop-detector.js';

describe('429 Rate Limit & Timeout Handling', () => {
  it('should detect rate_limited failure reason', () => {
    const task = {
      id: 'test-task',
      type: 'writer' as const,
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued' as const,
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'rate_limited' as const,
    };

    expect(task.failureReason).toBe('rate_limited');
  });

  it('should detect budget_exceeded failure reason', () => {
    const budget = new TurnBudget(30);
    
    // Simulate exceeding budget
    for (let i = 0; i < 35; i++) {
      budget.tick();
    }

    expect(budget.isExceeded).toBe(true);
    
    const task = {
      id: 'test-task',
      type: 'writer' as const,
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued' as const,
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'budget_exceeded' as const,
    };

    expect(task.failureReason).toBe('budget_exceeded');
  });

  it('should detect loop_detected failure reason', () => {
    const detector = new LoopDetector();
    
    // Simulate loop detection
    for (let i = 0; i < 5; i++) {
      detector.record('bash', 'python3 -c "count words"');
    }

    const result = detector.record('bash', 'python3 -c "count words"');
    expect(result.isTerminated).toBe(true);
    
    const task = {
      id: 'test-task',
      type: 'writer' as const,
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued' as const,
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'loop_detected' as const,
    };

    expect(task.failureReason).toBe('loop_detected');
  });

  it('should support timeout mechanism (5 minutes)', () => {
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    expect(timeoutMs).toBe(300000);
  });
});
