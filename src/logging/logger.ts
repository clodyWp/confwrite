import type { LogEvent, NotifyLevel } from '../index.js';

/**
 * 格式化结果
 */
export interface FormatResult {
  message: string;
  level: NotifyLevel;
}

/**
 * 日志格式化器
 */
export class Logger {
  /**
   * 格式化事件为 TUI 友好的日志消息
   */
  static format(event: LogEvent): FormatResult {
    switch (event.type) {
      case 'task.start':
        return Logger.formatTaskStart(event);
      case 'task.complete':
        return Logger.formatTaskComplete(event);
      case 'task.fail':
        return Logger.formatTaskFail(event);
      case 'chapter.status':
        return Logger.formatChapterStatus(event);
      case 'phase.transition':
        return Logger.formatPhaseTransition(event);
      case 'diagram.scan':
        return Logger.formatDiagramScan(event);
      case 'diagram.generate':
        return Logger.formatDiagramGenerate(event);
      case 'ratelimit':
        return Logger.formatRateLimit(event);
      case 'stats.progress':
        return Logger.formatProgress(event);
      default:
        return { message: JSON.stringify(event), level: 'info' };
    }
  }

  /**
   * 格式化任务开始事件
   */
  private static formatTaskStart(event: Extract<LogEvent, { type: 'task.start' }>): FormatResult {
    const taskTypeLabel = this.getTaskTypeLabel(event.taskType);
    const emoji = this.getTaskTypeEmoji(event.taskType);
    const message = `${emoji} [${taskTypeLabel}] 开始写作 ${event.chapterId} (并发 ${event.concurrency.current}/${event.concurrency.max})`;
    return { message, level: 'info' };
  }

  /**
   * 格式化任务完成事件
   */
  private static formatTaskComplete(event: Extract<LogEvent, { type: 'task.complete' }>): FormatResult {
    const taskTypeLabel = this.getTaskTypeLabel(event.taskType);
    const emoji = this.getTaskTypeEmoji(event.taskType);
    const duration = this.formatDuration(event.duration);
    const size = event.fileSize ? `, ${this.formatFileSize(event.fileSize)}` : '';
    const message = `${emoji} [${taskTypeLabel}] ${event.chapterId} 完成 (${duration}${size})`;
    return { message, level: 'info' };
  }

  /**
   * 格式化任务失败事件
   */
  private static formatTaskFail(event: Extract<LogEvent, { type: 'task.fail' }>): FormatResult {
    const taskTypeLabel = this.getTaskTypeLabel(event.taskType);
    const emoji = '❌';
    
    if (event.willRetry && event.retryDelay) {
      const delay = this.formatDuration(event.retryDelay);
      const message = `${emoji} [${taskTypeLabel}] ${event.chapterId} 失败 (${event.error})\n   └─ 将在 ${delay} 后重试`;
      return { message, level: 'warning' };
    } else {
      const message = `${emoji} [${taskTypeLabel}] ${event.chapterId} 失败: ${event.error}`;
      return { message, level: 'error' };
    }
  }

  /**
   * 格式化章节状态变化事件
   */
  private static formatChapterStatus(event: Extract<LogEvent, { type: 'chapter.status' }>): FormatResult {
    const version = event.version ? ` (v${event.version})` : '';
    const checkmark = event.to === 'completed' ? ' ✓' : '';
    const message = `📊 ${event.chapterId}: ${event.from} → ${event.to}${version}${checkmark}`;
    return { message, level: 'info' };
  }

  /**
   * 格式化阶段转换事件
   */
  private static formatPhaseTransition(event: Extract<LogEvent, { type: 'phase.transition' }>): FormatResult {
    let stats = '';
    if (event.stats) {
      const parts: string[] = [];
      if (event.stats.completedChapters !== undefined) {
        parts.push(`完成: ${event.stats.completedChapters} 章`);
      }
      if (event.stats.failedChapters !== undefined && event.stats.failedChapters > 0) {
        parts.push(`失败: ${event.stats.failedChapters} 章`);
      }
      if (parts.length > 0) {
        stats = `\n   ├─ ${parts.join('\n   ├─ ')}`;
      }
    }
    const message = `⏩ [阶段] ${event.from} → ${event.to} (${event.phaseName})\n   └─ ${event.reason}${stats}`;
    return { message, level: 'info' };
  }

  /**
   * 格式化图表扫描事件
   */
  private static formatDiagramScan(event: Extract<LogEvent, { type: 'diagram.scan' }>): FormatResult {
    const mermaidNote = event.byFormat.mermaid > 0 ? ' (兼容)' : '';
    const message = `🔍 [图表] 扫描到 ${event.total} 个图表\n   ├─ diagram-start: ${event.byFormat['diagram-start']} 个\n   └─ mermaid: ${event.byFormat.mermaid} 个${mermaidNote}`;
    return { message, level: 'info' };
  }

  /**
   * 格式化图表生成事件
   */
  private static formatDiagramGenerate(event: Extract<LogEvent, { type: 'diagram.generate' }>): FormatResult {
    if (event.action === 'cached') {
      const message = `💾 [图表] ${event.diagramId} 缓存命中`;
      return { message, level: 'info' };
    }
    
    if (event.action === 'failed') {
      const message = `❌ [图表] ${event.diagramId} 生成失败: ${event.error}`;
      return { message, level: 'error' };
    }

    // action === 'generated'
    const duration = event.duration ? ` (${this.formatDuration(event.duration)})` : '';
    const message = `🎨 [图表] ${event.diagramId} (${event.diagramType})${duration}\n   └─ ${event.outputPath}`;
    return { message, level: 'info' };
  }

  /**
   * 格式化限流事件
   */
  private static formatRateLimit(event: Extract<LogEvent, { type: 'ratelimit' }>): FormatResult {
    if (event.action === 'pause') {
      const duration = event.duration ? this.formatDuration(event.duration) : '';
      const reason = event.reason ? ` (${event.reason})` : '';
      const message = `⏸️ [限流] 检测到限流，全局暂停 ${duration}${reason}`;
      return { message, level: 'warning' };
    } else {
      const message = `▶️ [限流] 暂停结束，恢复执行`;
      return { message, level: 'info' };
    }
  }

  /**
   * 格式化进度报告事件
   */
  private static formatProgress(event: Extract<LogEvent, { type: 'stats.progress' }>): FormatResult {
    const elapsed = this.formatDuration(event.elapsed);
    const progress = `${event.chapterProgress.completed}/${event.chapterProgress.total}`;
    const percent = ((event.chapterProgress.completed / event.chapterProgress.total) * 100).toFixed(1);
    const avgDuration = this.formatDuration(event.taskStats.avgDuration);
    
    let remaining = '';
    if (event.estimatedRemaining) {
      remaining = this.formatDuration(event.estimatedRemaining * 1000);
    }

    const message = `📈 [进度] 运行 ${elapsed}\n   ├─ 阶段: ${event.currentPhase}\n   ├─ 章节: ${progress} (${percent}%)\n   ├─ 任务: ${event.taskStats.succeeded} 成功 / ${event.taskStats.failed} 失败\n   ├─ 速度: ${avgDuration}/任务\n   └─ 预计: ${remaining ? `~${remaining} 剩余` : '计算中...'}`;
    return { message, level: 'info' };
  }

  /**
   * 获取任务类型标签
   */
  private static getTaskTypeLabel(taskType: string): string {
    switch (taskType) {
      case 'writer': return 'Writer';
      case 'reviewer': return 'Reviewer';
      case 'fixer': return 'Fixer';
      default: return taskType;
    }
  }

  /**
   * 获取任务类型 Emoji
   */
  private static getTaskTypeEmoji(taskType: string): string {
    switch (taskType) {
      case 'writer': return '🚀';
      case 'reviewer': return '📝';
      case 'fixer': return '🔧';
      default: return '⚙️';
    }
  }

  /**
   * 格式化时长
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    
    const seconds = ms / 1000;
    
    if (seconds < 60) {
      // 保留一位小数
      return `${seconds.toFixed(1)}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * 格式化文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    }
    
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)}KB`;
    }
    
    const mb = kb / 1024;
    return `${mb.toFixed(1)}MB`;
  }
}
