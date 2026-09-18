import type {
  TaskStartEvent,
  TaskCompleteEvent,
  TaskFailEvent,
} from './types.js';

/**
 * 统计信息
 */
export interface Stats {
  currentPhase: string;
  chapterProgress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  concurrency: {
    current: number;
    max: number;
  };
  running: number;
  executed: number;
  succeeded: number;
  failed: number;
  retries: number;
  avgDuration: number;
  startTime: number;
}

/**
 * 统计收集器
 */
export class StatsCollector {
  private stats: Stats;
  private totalDuration: number = 0;

  constructor() {
    this.stats = {
      currentPhase: '',
      chapterProgress: {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
      },
      concurrency: {
        current: 0,
        max: 0,
      },
      running: 0,
      executed: 0,
      succeeded: 0,
      failed: 0,
      retries: 0,
      avgDuration: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 记录任务开始
   */
  recordTaskStart(event: TaskStartEvent): void {
    this.stats.running++;
    this.stats.executed++;
    this.stats.concurrency.current = event.concurrency.current;
    this.stats.concurrency.max = event.concurrency.max;
  }

  /**
   * 记录任务完成
   */
  recordTaskComplete(event: TaskCompleteEvent): void {
    this.stats.running--;
    this.stats.succeeded++;
    this.totalDuration += event.duration;
    this.stats.avgDuration = Math.round(this.totalDuration / this.stats.succeeded);
  }

  /**
   * 记录任务失败
   */
  recordTaskFail(event: TaskFailEvent): void {
    this.stats.running--;
    this.stats.failed++;
    if (event.willRetry) {
      this.stats.retries++;
    }
  }

  /**
   * 设置章节进度
   */
  setChapterProgress(progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  }): void {
    this.stats.chapterProgress = progress;
  }

  /**
   * 设置当前阶段
   */
  setCurrentPhase(phase: string): void {
    this.stats.currentPhase = phase;
  }

  /**
   * 获取统计信息
   */
  getStats(): Stats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.stats = {
      currentPhase: '',
      chapterProgress: {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
      },
      concurrency: {
        current: 0,
        max: 0,
      },
      running: 0,
      executed: 0,
      succeeded: 0,
      failed: 0,
      retries: 0,
      avgDuration: 0,
      startTime: Date.now(),
    };
    this.totalDuration = 0;
  }
}
