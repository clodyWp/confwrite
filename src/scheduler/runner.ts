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
      } else {
        result.failed++;
        result.tasks.push({
          id: outcome.id,
          status: 'failed',
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

    // 发射任务开始事件
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'task.start',
        taskId: task.id,
        taskType: task.type,
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

      // 发射任务完成事件
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'task.complete',
          taskId: task.id,
          taskType: task.type,
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
      // 全局暂停
      this.pausedUntil = Date.now() + this.rateLimitDelayMs;

      // 发射限流事件
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'ratelimit',
          action: 'pause',
          duration: this.rateLimitDelayMs,
          reason: output,
        });
      }

      // 重试
      if (task.attempt < this.maxTaskRetries) {
        task.attempt++;
        this.scheduler.markRetrying(task.id);

        // 发射任务失败事件（带重试）
        if (this.eventBus) {
          this.eventBus.emit({
            type: 'task.fail',
            taskId: task.id,
            taskType: task.type,
            chapterId: task.chapterId || '',
            error: output,
            willRetry: true,
            retryDelay: this.rateLimitDelayMs,
          });
        }

        return task;
      }
    }

    // 非 429 或重试耗尽 → 失败
    this.scheduler.markFailed(task.id, output);

    // 发射任务失败事件
    if (this.eventBus) {
      this.eventBus.emit({
        type: 'task.fail',
        taskId: task.id,
        taskType: task.type,
        chapterId: task.chapterId || '',
        error: output,
        willRetry: false,
      });
    }

    return task;
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
