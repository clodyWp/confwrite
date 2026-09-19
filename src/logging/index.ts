/**
 * LoggingSystem - 日志系统集成入口
 * 
 * 负责：
 * 1. 创建 EventBus 和 StatsCollector
 * 2. 订阅所有事件并格式化输出
 * 3. 提供进度报告接口
 * 4. 可选：持久化日志到文件
 */
import { EventBus } from './event-bus.js';
import { StatsCollector } from './stats.js';
import { Logger } from './logger.js';
import type { LogEvent } from './types.js';
import type { NotifyLevel } from '../index.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type NotifyFn = (message: string, level: NotifyLevel) => void;

/**
 * 文件日志配置
 */
export interface FileLogConfig {
  enabled: boolean;
  projectDir: string;
  filename?: string;  // 默认: confwrite-log.json
}

/**
 * 日志系统
 */
export class LoggingSystem {
  public eventBus: EventBus;
  public stats: StatsCollector;
  private notify: NotifyFn;
  private disposed = false;
  private fileLogConfig?: FileLogConfig;
  private logEntries: Array<{ timestamp: string; event: LogEvent }> = [];

  constructor(notify: NotifyFn, fileLogConfig?: FileLogConfig) {
    this.notify = notify;
    this.eventBus = new EventBus();
    this.stats = new StatsCollector();
    this.fileLogConfig = fileLogConfig;

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

    // 记录到文件日志
    if (this.fileLogConfig?.enabled) {
      this.logEntries.push({
        timestamp: new Date().toISOString(),
        event,
      });
      this.flushLog();
    }
  }

  /**
   * 刷新日志到文件
   */
  private flushLog(): void {
    if (!this.fileLogConfig?.enabled || this.logEntries.length === 0) return;

    const logsDir = join(this.fileLogConfig.projectDir, 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const filename = this.fileLogConfig.filename || 'confwrite-log.json';
    const logPath = join(logsDir, filename);

    try {
      writeFileSync(logPath, JSON.stringify(this.logEntries, null, 2), 'utf-8');
    } catch {
      // 静默处理文件写入错误
    }
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
    // 最终刷新日志
    if (this.fileLogConfig?.enabled) {
      this.flushLog();
    }
    this.eventBus.clear();
  }
}

// 导出所有模块
export { EventBus } from './event-bus.js';
export { StatsCollector } from './stats.js';
export { Logger } from './logger.js';
export * from './types.js';
