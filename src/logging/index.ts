/**
 * LoggingSystem - 日志系统集成入口
 * 
 * 负责：
 * 1. 创建 EventBus 和 StatsCollector
 * 2. 订阅所有事件并格式化输出
 * 3. 提供进度报告接口
 */
import { EventBus } from './event-bus.js';
import { StatsCollector } from './stats.js';
import { Logger } from './logger.js';
import type { LogEvent } from './types.js';
import type { NotifyLevel } from '../index.js';

export type NotifyFn = (message: string, level: NotifyLevel) => void;

/**
 * 日志系统
 */
export class LoggingSystem {
  public eventBus: EventBus;
  public stats: StatsCollector;
  private notify: NotifyFn;
  private disposed = false;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.eventBus = new EventBus();
    this.stats = new StatsCollector();

    // 订阅所有事件
    this.eventBus.subscribe('*', (event) => this.handleEvent(event));
  }

  /**
   * 处理事件
   */
  private handleEvent(event: LogEvent): void {
    if (this.disposed) return;

    // 更新统计
    this.updateStats(event);

    // 格式化并输出
    const result = Logger.format(event);
    this.notify(result.message, result.level);
  }

  /**
   * 更新统计信息
   */
  private updateStats(event: LogEvent): void {
    switch (event.type) {
      case 'task.start':
        this.stats.recordTaskStart(event);
        break;
      case 'task.complete':
        this.stats.recordTaskComplete(event);
        break;
      case 'task.fail':
        this.stats.recordTaskFail(event);
        break;
    }
  }

  /**
   * 获取进度报告
   */
  getProgressReport(): string {
    const stats = this.stats.getStats();
    const progress = stats.chapterProgress;
    const percent = progress.total > 0 
      ? ((progress.completed / progress.total) * 100).toFixed(1)
      : '0';

    return [
      `📈 [进度] 阶段: ${stats.currentPhase}`,
      `   ├─ 章节: ${progress.completed}/${progress.total} (${percent}%)`,
      `   ├─ 任务: ${stats.succeeded} 成功 / ${stats.failed} 失败`,
      `   └─ 平均耗时: ${Logger.formatDuration(stats.avgDuration)}/任务`,
    ].join('\n');
  }

  /**
   * 设置当前阶段
   */
  setCurrentPhase(phase: string): void {
    this.stats.setCurrentPhase(phase);
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
    this.stats.setChapterProgress(progress);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.disposed = true;
    this.eventBus.clear();
  }
}

// 导出所有模块
export { EventBus } from './event-bus.js';
export { StatsCollector } from './stats.js';
export { Logger } from './logger.js';
export * from './types.js';
