/**
 * StatusLineRenderer — TUI 状态行渲染器
 * 
 * Spec: specs/tui-status-line.md
 * 
 * 职责：合成单行状态摘要，让用户一眼掌握全局进度。
 * 格式：[Phase] PhaseName │ 任务描述 │ 时间 │ 最新日志
 * 
 * 不变量：
 * - INV-TUI-1: 输出不含换行符
 * - INV-TUI-2: 包含当前 Phase
 * - INV-TUI-3: 包含运行时长
 * - INV-TUI-4: 最新日志为单行
 * - INV-TUI-5: 长度 <= maxWidth
 * - INV-TUI-6: 纯计算函数，无副作用
 * - INV-TUI-7: 无活跃任务时显示等待状态
 * - INV-TUI-8: 不影响 Logger.format()
 */

import type { NotifyLevel } from './types.js';

/**
 * 活跃任务信息
 */
export interface ActiveTask {
  taskId: string;
  taskType: 'writer' | 'reviewer' | 'fixer';
  chapterId: string;
  startedAt: number;
}

/**
 * 日志缓冲
 */
export interface LogBuffer {
  lastMessage: string;
  lastLevel: NotifyLevel;
  lastTimestamp: number;
  lastEventType: string;
}

/**
 * 状态行内部状态
 */
export interface StatusLineState {
  phase: string;
  phaseName: string;
  startTime: number;
  activeTasks: Map<string, ActiveTask>;
  logBuffer: LogBuffer;
  waitPoint?: { reason: string };
  maxWidth: number;
}

/**
 * Phase 显示名映射
 */
const PHASE_NAMES: Record<string, string> = {
  '0a': '初始化',
  '0b': '素材整理',
  '1': '需求分析',
  '2': '大纲规划',
  '3': '素材准备',
  '4a': '写作',
  '4b': '审阅',
  '4c': '决策',
  '4d': '修复',
  '5': '图表生成',
  '6': '组装',
  '7': '定稿',
  '8': '导出',
  'done': '完成',
};

/**
 * 任务类型 Emoji 映射
 */
const TASK_EMOJIS: Record<string, string> = {
  writer: '🚀',
  reviewer: '📝',
  fixer: '🔧',
};

/**
 * 构造选项
 */
export interface StatusLineRendererOptions {
  maxWidth?: number;
  startTimeOverride?: number;
}

/**
 * 状态行渲染器
 */
export class StatusLineRenderer {
  private state: StatusLineState;

  constructor(opts?: StatusLineRendererOptions) {
    this.state = {
      phase: '',
      phaseName: '',
      startTime: opts?.startTimeOverride ?? Date.now(),
      activeTasks: new Map(),
      logBuffer: {
        lastMessage: '等待启动...',
        lastLevel: 'info',
        lastTimestamp: Date.now(),
        lastEventType: '',
      },
      maxWidth: opts?.maxWidth ?? 120,
    };
  }

  /**
   * 更新 Phase
   */
  setPhase(phase: string, phaseName: string): void {
    this.state.phase = phase;
    this.state.phaseName = phaseName || PHASE_NAMES[phase] || '';
  }

  /**
   * 设置等待点
   */
  setWaitPoint(reason: string | undefined): void {
    if (reason) {
      this.state.waitPoint = { reason };
    } else {
      this.state.waitPoint = undefined;
    }
  }

  /**
   * 记录活跃任务
   */
  addTask(task: ActiveTask): void {
    this.state.activeTasks.set(task.taskId, task);
  }

  /**
   * 移除活跃任务
   */
  removeTask(taskId: string): void {
    this.state.activeTasks.delete(taskId);
  }

  /**
   * 更新最新日志
   */
  updateLastLog(message: string, level: NotifyLevel, eventType: string): void {
    // BUF-3: 只保留首行
    const firstLine = message.split('\n')[0] || '';
    // BUF-4: 去除开头的 emoji 前缀
    const stripped = this.stripLeadingEmoji(firstLine);

    this.state.logBuffer = {
      lastMessage: stripped || firstLine || '...',
      lastLevel: level,
      lastTimestamp: Date.now(),
      lastEventType: eventType,
    };
  }

  /**
   * 渲染状态行（纯函数，无副作用）
   * INV-TUI-6: 不产生 I/O、不修改状态、不抛出异常
   */
  render(): string {
    try {
      const phase = this.formatPhase();
      const name = this.formatPhaseName();
      const task = this.formatTask();
      const time = this.formatElapsed();
      const log = this.formatLastLog();

      const separator = ' │ ';
      const segments = [phase, name, task, time, log];

      return this.fitToWidth(segments, separator, this.state.maxWidth);
    } catch {
      // INV-TUI-6: 永不抛出
      return '[--] │ 错误 │ ... │ 0:00 │ ...';
    }
  }

  /**
   * 获取当前状态（用于调试/测试）
   */
  getState(): Readonly<StatusLineState> {
    return this.state;
  }

  // ---- Private formatting methods ----

  private formatPhase(): string {
    const phase = this.state.phase || '--';
    // Pad to 4 chars: [4a ], [0b ], [done], [--  ]
    return `[${phase.padEnd(4)}]`;
  }

  private formatPhaseName(): string {
    const name = this.state.phaseName || '';
    // Max 6 chars + truncation
    if (name.length <= 6) return name;
    return name.slice(0, 5) + '…';
  }

  private formatTask(): string {
    const tasks = this.state.activeTasks;

    if (tasks.size === 0) {
      return this.formatWaitState();
    }

    // Find the most recently started task
    let latest: ActiveTask | undefined;
    for (const task of tasks.values()) {
      if (!latest || task.startedAt > latest.startedAt) {
        latest = task;
      }
    }

    if (!latest) return '⏳ 等待推进';

    const emoji = TASK_EMOJIS[latest.taskType] || '⚙️';
    return `${emoji} ${latest.chapterId} ${latest.taskType}`;
  }

  private formatWaitState(): string {
    // INV-TUI-7: 无活跃任务时的状态描述
    if (this.state.phase === 'done') {
      return '✅ 完成';
    }
    if (this.state.waitPoint) {
      const reason = this.state.waitPoint.reason.split('\n')[0];
      return `⏳ ${reason}`;
    }
    return '⏳ 等待推进';
  }

  private formatElapsed(): string {
    const elapsed = Date.now() - this.state.startTime;
    const totalSeconds = Math.floor(elapsed / 1000);

    if (totalSeconds < 3600) {
      // M:SS format
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
      // H:MM:SS format
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  private formatLastLog(): string {
    return this.state.logBuffer.lastMessage || '...';
  }

  /**
   * 截断策略：从右向左截断
   * 1. 截断 log 段
   * 2. 截断 task 段
   * 3. 截断 name 段
   * 4. phase 和 time 不截断（核心信息）
   */
  private fitToWidth(segments: string[], separator: string, maxWidth: number): string {
    const sepLen = separator.length;
    // segments: [phase, name, task, time, log]
    const full = segments.join(separator);

    if (full.length <= maxWidth) return full;

    // Need to truncate. Priority: log > task > name (phase and time are sacred)
    let [phase, name, task, time, log] = segments;
    const fixedLen = phase.length + sepLen + time.length;
    let remaining = maxWidth - fixedLen;

    // Need at least 3 separators
    const minSeparators = 3 * sepLen;
    remaining -= minSeparators;

    if (remaining < 1) {
      // Extremely narrow: just phase + time
      return `${phase}${separator}${time}`;
    }

    // Allocate space: name gets up to 6, task gets up to 20, log gets the rest
    const nameMax = Math.min(name.length, 6);
    const taskMax = Math.min(task.length, 20);

    let nameUsed = nameMax;
    let taskUsed = taskMax;
    let logAvailable = remaining - nameUsed - taskUsed;

    if (logAvailable < 3) {
      // Not enough for log, shrink task
      logAvailable = 3;
      taskUsed = remaining - nameUsed - logAvailable;
      if (taskUsed < 3) {
        taskUsed = 3;
        nameUsed = remaining - taskUsed - logAvailable;
        if (nameUsed < 1) nameUsed = 1;
      }
    }

    // Truncate each segment
    name = this.truncate(name, nameUsed);
    task = this.truncate(task, taskUsed);
    log = this.truncate(log, logAvailable);

    return [phase, name, task, time, log].join(separator);
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    if (maxLen <= 1) return text.slice(0, maxLen);
    return text.slice(0, maxLen - 1) + '…';
  }

  /**
   * 去除开头的 emoji + 空格
   */
  private stripLeadingEmoji(text: string): string {
    return text.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]\s*/u, '');
  }
}
