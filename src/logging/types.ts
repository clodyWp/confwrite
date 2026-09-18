/**
 * 日志事件类型定义
 */

/**
 * 通知级别
 */
export type NotifyLevel = 'info' | 'warning' | 'error';

/**
 * 任务开始事件
 */
export interface TaskStartEvent {
  type: 'task.start';
  taskId: string;
  taskType: 'writer' | 'reviewer' | 'fixer';
  chapterId: string;
  round: number;
  concurrency: {
    current: number;
    max: number;
  };
}

/**
 * 任务完成事件
 */
export interface TaskCompleteEvent {
  type: 'task.complete';
  taskId: string;
  taskType: 'writer' | 'reviewer' | 'fixer';
  chapterId: string;
  duration: number;        // 毫秒
  fileSize?: number;       // 字节
  outputPath?: string;
}

/**
 * 任务失败事件
 */
export interface TaskFailEvent {
  type: 'task.fail';
  taskId: string;
  taskType: 'writer' | 'reviewer' | 'fixer';
  chapterId: string;
  error: string;
  willRetry: boolean;
  retryDelay?: number;     // 毫秒
}

/**
 * 章节状态变化事件
 */
export interface ChapterStatusChangeEvent {
  type: 'chapter.status';
  chapterId: string;
  from: string;
  to: string;
  version?: number;
}

/**
 * 阶段转换事件
 */
export interface PhaseTransitionEvent {
  type: 'phase.transition';
  from: string;
  to: string;
  phaseName: string;
  reason: string;
  stats?: {
    completedChapters?: number;
    failedChapters?: number;
  };
}

/**
 * 图表扫描事件
 */
export interface DiagramScanEvent {
  type: 'diagram.scan';
  total: number;
  byFormat: {
    'diagram-start': number;
    'mermaid': number;
  };
}

/**
 * 图表生成事件
 */
export interface DiagramGenerateEvent {
  type: 'diagram.generate';
  diagramId: string;
  chapterId: string;
  format: 'diagram-start' | 'mermaid';
  diagramType: string;
  action: 'generated' | 'cached' | 'failed';
  duration?: number;
  outputPath?: string;
  error?: string;
}

/**
 * 限流事件
 */
export interface RateLimitEvent {
  type: 'ratelimit';
  action: 'pause' | 'resume';
  duration?: number;       // 暂停时长（毫秒）
  reason?: string;
}

/**
 * 进度报告事件
 */
export interface ProgressReportEvent {
  type: 'stats.progress';
  elapsed: number;           // 运行时长（毫秒）
  currentPhase: string;
  chapterProgress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
  };
  taskStats: {
    executed: number;
    succeeded: number;
    failed: number;
    avgDuration: number;
  };
  resourceUsage: {
    concurrency: {
      current: number;
      max: number;
    };
    tokenBucket: {
      current: number;
      max: number;
    };
  };
  estimatedRemaining?: number;  // 秒
}

/**
 * 所有事件的联合类型
 */
export type LogEvent =
  | TaskStartEvent
  | TaskCompleteEvent
  | TaskFailEvent
  | ChapterStatusChangeEvent
  | PhaseTransitionEvent
  | DiagramScanEvent
  | DiagramGenerateEvent
  | RateLimitEvent
  | ProgressReportEvent;

/**
 * 事件类型字符串
 */
export type LogEventType = LogEvent['type'];
