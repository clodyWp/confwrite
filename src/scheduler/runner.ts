/**
 * SchedulerRunner — 驱动调度器的执行循环
 * 
 * 循环：
 * 1. 获取就绪任务
 * 2. 检查窗口限流
 * 3. 通过 executor 并行执行
 * 4. 标记完成/失败
 * 5. 429 错误 → 全局暂停 + 重试
 */
import type { SubagentScheduler } from './index.js';
import type { SubagentExecutor } from './executor.js';
import type { Task } from './types.js';
import { WindowRateLimiter } from './window-limiter.js';
import type { EventBus } from '../logging/event-bus.js';

export interface RunResult {
  executed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  tasks: Array<{ id: string; status: string; error?: string; chapterId?: string }>;
}

/**
 * 检测是否为 429 限流错误
 */
const RATE_LIMIT_PATTERNS = /429|rate.?limit|too many requests|throttl/i;

function isRateLimitError(output: string): boolean {
  return RATE_LIMIT_PATTERNS.test(output);
}

export class SchedulerRunner {
  private scheduler: SubagentScheduler;
  private executor: SubagentExecutor;
  private maxConcurrency: number;
  private rateLimiter: WindowRateLimiter;
  private rateLimitDelayMs: number;
  private maxTaskRetries: number;
  private pausedUntil = 0;
  private consecutiveRateLimits = 0;
  private maxConsecutiveRateLimits = 7; // 连续 429 次数上限（阶段1: 2次 + 阶段2: 5次）
  private circuitBroken = false; // run 级熔断标志
  private eventBus?: EventBus;

  constructor(
    scheduler: SubagentScheduler,
    executor: SubagentExecutor,
    maxConcurrency = 3,
    rateLimitWindowMs = 0,
    rateLimitMaxTasks = 0,
    rateLimitDelayMs = 60000,
    maxTaskRetries = 1,
    eventBus?: EventBus,
  ) {
    this.scheduler = scheduler;
    this.executor = executor;
    this.maxConcurrency = maxConcurrency;
    this.rateLimiter = new WindowRateLimiter(rateLimitWindowMs, rateLimitMaxTasks);
    this.rateLimitDelayMs = rateLimitDelayMs;
    this.maxTaskRetries = maxTaskRetries;
    this.eventBus = eventBus;
  }

  /**
   * 执行所有就绪任务（并行）
   */
  async runAll(): Promise<RunResult> {
    // 熔断检查：如果已触发熔断，不再执行新任务
    if (this.circuitBroken) {
      return {
        executed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        tasks: [],
      };
    }

    // 等待 429 退避（Bug 8 修复）
    if (this.pausedUntil > Date.now()) {
      const waitMs = this.pausedUntil - Date.now();
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const readyTasks = this.scheduler.getReadyTasks();
    const batch = readyTasks.slice(0, this.maxConcurrency);

    const result: RunResult = {
      executed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      tasks: [],
    };

    if (batch.length === 0) {
      return result;
    }

    // 等待限流配额（每批次一次）
    await this.rateLimiter.waitForSlot();
    this.rateLimiter.record();

    // 并行执行
    const promises = batch.map(task => this.runTask(task));
    const outcomes = await Promise.all(promises);

    for (const outcome of outcomes) {
      result.executed++;
      if (outcome.status === 'completed') {
        result.succeeded++;
        result.tasks.push({ id: outcome.id, status: 'completed', chapterId: outcome.chapterId });
      } else if (outcome.status === 'failed') {
        result.failed++;
        result.tasks.push({
          id: outcome.id,
          status: 'failed',
          error: outcome.error,
          chapterId: outcome.chapterId,
        });
      } else {
        // retrying/queued — not terminal
        result.tasks.push({
          id: outcome.id,
          status: outcome.status,
          error: outcome.error,
          chapterId: outcome.chapterId,
        });
      }
    }

    return result;
  }

  /**
   * 执行单个任务，支持 429 重试
   */
  private async runTask(task: Task): Promise<Task> {
    const startTime = Date.now();

    // 发射任务开始事件（仅对 writer/reviewer/fixer）
    if (this.eventBus && this.isTrackableTask(task)) {
      this.eventBus.emit({
        type: 'task.start',
        taskId: task.id,
        taskType: task.type as 'writer' | 'reviewer' | 'fixer',
        chapterId: task.chapterId || '',
        round: 1, // TODO: get from task
        concurrency: {
          current: this.scheduler.getStats().running,
          max: this.maxConcurrency,
        },
      });
    }

    this.scheduler.markRunning(task.id);

    const result = await this.executor.execute(task);
    const duration = Date.now() - startTime;

    if (result.success) {
      this.scheduler.markCompleted(task.id, result.output);

      // 成功后重置连续限流计数
      this.consecutiveRateLimits = 0;

      // 发射任务完成事件（仅对 writer/reviewer/fixer）
      if (this.eventBus && this.isTrackableTask(task)) {
        this.eventBus.emit({
          type: 'task.complete',
          taskId: task.id,
          taskType: task.type as 'writer' | 'reviewer' | 'fixer',
          chapterId: task.chapterId || '',
          duration,
        });
      }

      return task;
    }

    // 失败处理
    const output = result.output || '';

    // 检测 429 限流
    if (isRateLimitError(output)) {
      this.consecutiveRateLimits++;

      // 两阶段退避（Bug 8 修复）
      // 阶段 1: 前 2 次，间隔 2 分钟（覆盖偶发抖动）
      // 阶段 2: 第 3-7 次，间隔 12 分钟（覆盖 1 小时恢复）
      // 以 rateLimitDelayMs 为基准（默认 60s → 阶段1=2min, 阶段2=12min）
      const phase1Retries = 2;
      const phase1Delay = this.rateLimitDelayMs * 2;    // 生产: 120s (2分钟)
      const phase2Delay = this.rateLimitDelayMs * 12;   // 生产: 720s (12分钟)
      const actualDelay = this.consecutiveRateLimits <= phase1Retries
        ? phase1Delay
        : phase2Delay;

      // 全局暂停
      this.pausedUntil = Date.now() + actualDelay;

      // 发射限流事件
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'ratelimit',
          action: 'pause',
          duration: actualDelay,
          reason: output,
        });
      }

      // 429 错误使用单独的重试计数（最多重试 5 次）
      const maxRateLimitRetries = this.maxConsecutiveRateLimits;
      if (this.consecutiveRateLimits <= maxRateLimitRetries) {
        // 不增加 task.attempt，因为这是限流重试，不是任务失败重试
        this.scheduler.markRetrying(task.id);

        // 发射任务失败事件（带重试，仅对 writer/reviewer/fixer）
        if (this.eventBus && this.isTrackableTask(task)) {
          this.eventBus.emit({
            type: 'task.fail',
            taskId: task.id,
            taskType: task.type as 'writer' | 'reviewer' | 'fixer',
            chapterId: task.chapterId || '',
            error: output,
            willRetry: true,
            retryDelay: actualDelay,
          });
        }

        return task;
      }

      // 超过连续限流次数上限，标记为失败并触发熔断
      this.circuitBroken = true;

      if (this.eventBus) {
        this.eventBus.emit({
          type: 'ratelimit',
          action: 'pause',
          duration: 0,
          reason: `连续 ${this.consecutiveRateLimits} 次限流，触发熔断，终止本轮剩余任务`,
        });
      }
    }

    // 非 429 或重试耗尽 → 失败
    this.scheduler.markFailed(task.id, output);

    // 发射任务失败事件（仅对 writer/reviewer/fixer）
    if (this.eventBus && this.isTrackableTask(task)) {
      this.eventBus.emit({
        type: 'task.fail',
        taskId: task.id,
        taskType: task.type as 'writer' | 'reviewer' | 'fixer',
        chapterId: task.chapterId || '',
        error: output,
        willRetry: false,
      });
    }

    return task;
  }

  /**
   * 检查任务是否是需要跟踪的类型
   */
  private isTrackableTask(task: Task): boolean {
    return task.type === 'writer' || task.type === 'reviewer' || task.type === 'fixer';
  }

  /**
   * 检查是否触发了熔断
   */
  isCircuitBroken(): boolean {
    return this.circuitBroken;
  }

  /**
   * 运行直到没有就绪任务
   */
  async runUntilIdle(): Promise<RunResult> {
    // 记录已有的终态任务，避免重复统计
    const preExisting = new Set<string>();
    for (const task of this.scheduler.list()) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'skipped') {
        preExisting.add(task.id);
      }
    }

    let iterations = 0;
    const maxIterations = 100; // safety limit

    while (iterations < maxIterations) {
      // 熔断检查：如果已触发熔断，终止剩余任务
      if (this.circuitBroken) {
        for (const task of this.scheduler.list()) {
          if (task.status === 'queued' || task.status === 'retrying') {
            this.scheduler.markFailed(task.id, 'circuit_breaker: 连续限流，本轮终止');
          }
        }
        break;
      }

      // 检查是否在全局暂停中
      if (this.pausedUntil > Date.now()) {
        const waitMs = this.pausedUntil - Date.now();
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      const readyTasks = this.scheduler.getReadyTasks();
      if (readyTasks.length === 0) break;

      await this.runAll();
      iterations++;
    }

    // 只统计本次新增的终态任务（排除之前已完成的）
    const result: RunResult = {
      executed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      tasks: [],
    };

    for (const task of this.scheduler.list()) {
      if (preExisting.has(task.id)) continue;

      if (task.status === 'completed') {
        result.succeeded++;
        result.executed++;
        result.tasks.push({ id: task.id, status: 'completed', chapterId: task.chapterId });
      } else if (task.status === 'failed') {
        result.failed++;
        result.executed++;
        result.tasks.push({ id: task.id, status: 'failed', error: task.error, chapterId: task.chapterId });
      } else if (task.status === 'skipped') {
        result.skipped++;
      }
    }

    return result;
  }
}
