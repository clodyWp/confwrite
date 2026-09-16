/**
 * SubagentScheduler - Subagent 调度器
 * 
 * 核心职责：
 * 1. 管理任务队列（优先级 + FIFO）
 * 2. 控制并发（maxConcurrency）
 * 3. 控制频率（令牌桶）
 * 4. 自动重试（指数退避）
 * 5. 依赖管理
 * 6. 状态持久化
 */

import { TokenBucket } from './token-bucket.js';
import { PriorityQueue } from './priority-queue.js';
import { RetryEngine } from './retry.js';
import type { Task, SchedulerConfig } from './types.js';
import { DEFAULT_SCHEDULER_CONFIG } from './types.js';

export interface SchedulerState {
  tasks: Task[];
  paused: boolean;
  tokenBucket: ReturnType<TokenBucket['serialize']>;
  sequenceCounter: number;
}

export class SubagentScheduler {
  private tasks: Map<string, Task> = new Map();
  private queue: PriorityQueue<Task>;
  private tokenBucket: TokenBucket;
  private retryEngine: RetryEngine;
  private config: SchedulerConfig;
  private paused = false;
  private sequenceCounter = 0;

  constructor(config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG) {
    this.config = config;
    this.queue = new PriorityQueue<Task>();
    this.tokenBucket = new TokenBucket({
      capacity: config.tokenBucketSize,
      refillRate: config.tokenRefillRate,
    });
    this.retryEngine = new RetryEngine({
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
      multiplier: config.retryBackoffMultiplier,
      maxRetries: 3, // 默认重试 3 次
      jitter: true,
    });
  }

  /**
   * 提交任务到调度器
   */
  submit(task: Task): void {
    if (task.sequence < 0) {
      task.sequence = this.sequenceCounter++;
    } else {
      this.sequenceCounter = Math.max(this.sequenceCounter, task.sequence + 1);
    }

    this.tasks.set(task.id, task);
    
    if (task.status === 'queued' || task.status === 'retrying') {
      this.queue.enqueue(task);
    }
  }

  /**
   * 获取所有任务
   */
  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务状态
   */
  getStatus(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    retrying: number;
    blocked: number;
  } {
    const tasks = this.list();
    return {
      total: tasks.length,
      queued: tasks.filter(t => t.status === 'queued').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      retrying: tasks.filter(t => t.status === 'retrying').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
    };
  }

  /**
   * 获取就绪任务（依赖已满足 + 状态为 queued/retrying）
   */
  getReadyTasks(): Task[] {
    const ready: Task[] = [];

    for (const task of this.tasks.values()) {
      if (task.status !== 'queued' && task.status !== 'retrying') {
        continue;
      }

      if (this.areDependenciesMet(task)) {
        ready.push(task);
      }
    }

    // 按优先级排序
    return ready.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.sequence - b.sequence;
    });
  }

  /**
   * 检查任务的依赖是否已满足
   */
  private areDependenciesMet(task: Task): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    for (const depId of task.dependencies) {
      const dep = this.tasks.get(depId);
      if (!dep) {
        return false; // 依赖的任务不存在
      }
      if (dep.status !== 'completed' && dep.status !== 'skipped') {
        return false; // 依赖的任务未完成
      }
    }

    return true;
  }

  /**
   * 暂停调度器
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * 恢复调度器
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * 检查调度器是否暂停
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * 序列化状态
   */
  serialize(): SchedulerState {
    return {
      tasks: this.list(),
      paused: this.paused,
      tokenBucket: this.tokenBucket.serialize(),
      sequenceCounter: this.sequenceCounter,
    };
  }

  /**
   * 反序列化状态
   */
  static deserialize(state: SchedulerState, config: SchedulerConfig): SubagentScheduler {
    const scheduler = new SubagentScheduler(config);
    scheduler.paused = state.paused;
    scheduler.sequenceCounter = state.sequenceCounter;
    scheduler.tokenBucket = TokenBucket.deserialize(state.tokenBucket);

    for (const task of state.tasks) {
      scheduler.tasks.set(task.id, task);
      if (task.status === 'queued' || task.status === 'retrying') {
        scheduler.queue.enqueue(task);
      }
    }

    return scheduler;
  }
}
