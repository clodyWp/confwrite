/**
 * Tests: SchedulerRunner 熔断机制
 * 
 * 验证连续 429 限流后触发熔断，终止本轮剩余任务
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { EventBus } from '../../src/logging/event-bus.js';
import type { Task } from '../../src/scheduler/types.js';

class Always429Executor {
  async execute(_task: Task) {
    return { success: false, output: '429 Too Many Requests' };
  }
}

class CountingExecutor {
  callCount = 0;
  async execute(_task: Task) {
    this.callCount++;
    return { success: false, output: '429 Too Many Requests' };
  }
}

function makeTask(id: string, chapterId: string): Task {
  return {
    id,
    type: 'writer',
    chapterId,
    status: 'queued',
    priority: 0,
    sequence: 0,
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

describe('SchedulerRunner Circuit Breaker', () => {
  let scheduler: SubagentScheduler;
  let runner: SchedulerRunner;
  let eventBus: EventBus;

  beforeEach(() => {
    scheduler = new SubagentScheduler();
    eventBus = new EventBus();
    runner = new SchedulerRunner(
      scheduler,
      new Always429Executor(),
      3,    // maxConcurrency
      0,    // rateLimitWindowMs
      0,    // rateLimitMaxTasks
      10,   // rateLimitDelayMs (短延迟方便测试)
      1,    // maxTaskRetries
      eventBus,
    );
  });

  it('should trigger circuit breaker after maxConsecutiveRateLimits', async () => {
    // 提交 9 个任务（3 批 × 3 并发）
    for (let i = 1; i <= 9; i++) {
      scheduler.submit(makeTask(`t${i}`, `ch${String(i).padStart(3, '0')}`));
    }

    await runner.runUntilIdle();

    // 熔断应该触发
    expect(runner.isCircuitBroken()).toBe(true);

    // 所有任务应该都是终态（failed）
    const tasks = scheduler.list();
    for (const task of tasks) {
      expect(task.status).toBe('failed');
    }
  });

  it('should not execute all tasks when circuit breaker fires early', async () => {
    // 使用计数器执行器，验证熔断后不再执行新任务
    const executor = new CountingExecutor();
    const localScheduler = new SubagentScheduler();
    const localEventBus = new EventBus();
    const localRunner = new SchedulerRunner(
      localScheduler,
      executor,
      3,    // maxConcurrency
      0,    // rateLimitWindowMs
      0,    // rateLimitMaxTasks
      10,   // rateLimitDelayMs
      1,    // maxTaskRetries
      localEventBus,
    );

    // 提交 30 个任务（10 批 × 3 并发）
    for (let i = 1; i <= 30; i++) {
      localScheduler.submit(makeTask(`t${i}`, `ch${String(i).padStart(3, '0')}`));
    }

    await localRunner.runUntilIdle();

    // 熔断应该触发
    expect(localRunner.isCircuitBroken()).toBe(true);

    // 实际执行的任务数应该远小于 30
    // maxConsecutiveRateLimits=7:
    //   batch 1: t1-t3 → consecutiveRateLimits=1,2,3 → retrying
    //   batch 2: t1-t3 → consecutiveRateLimits=4,5,6 → retrying
    //   batch 3: t1-t3 → consecutiveRateLimits=7(retrying),8,9 → circuit breaker
    //   → 熔断触发，t4-t30 不再执行
    // 实际执行: batch1(3) + batch2(3) + batch3(3) = 9 次
    expect(executor.callCount).toBeLessThan(30);
    expect(executor.callCount).toBeLessThanOrEqual(9); // 最多 3 批
  });

  it('should mark remaining queued tasks as failed when circuit breaker fires', async () => {
    // 提交 6 个任务
    for (let i = 1; i <= 6; i++) {
      scheduler.submit(makeTask(`t${i}`, `ch${String(i).padStart(3, '0')}`));
    }

    await runner.runUntilIdle();

    // 所有任务应该都是终态（failed）
    const tasks = scheduler.list();
    for (const task of tasks) {
      expect(task.status).toBe('failed');
    }

    // 部分任务应该有 circuit_breaker 错误信息
    const circuitBrokenTasks = tasks.filter(t => t.error?.includes('circuit_breaker'));
    expect(circuitBrokenTasks.length).toBeGreaterThan(0);
  });

  it('should not execute new batches after circuit breaker', async () => {
    // 提交 3 个任务
    for (let i = 1; i <= 3; i++) {
      scheduler.submit(makeTask(`t${i}`, `ch${String(i).padStart(3, '0')}`));
    }

    await runner.runUntilIdle();
    expect(runner.isCircuitBroken()).toBe(true);

    // 再提交新任务
    scheduler.submit(makeTask('t4', 'ch004'));

    // runAll 应该直接返回空结果
    const result = await runner.runAll();
    expect(result.executed).toBe(0);
  });

  it('should emit ratelimit event with circuit breaker reason', async () => {
    const events: any[] = [];
    eventBus.subscribe('ratelimit', (e) => events.push(e));

    for (let i = 1; i <= 3; i++) {
      scheduler.submit(makeTask(`t${i}`, `ch${String(i).padStart(3, '0')}`));
    }

    await runner.runUntilIdle();

    // 应该有熔断相关的限流事件
    const circuitBreakerEvent = events.find(
      (e: any) => e.reason && e.reason.includes('熔断'),
    );
    expect(circuitBreakerEvent).toBeDefined();
  });
});
