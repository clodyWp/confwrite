/**
 * Scheduler Types
 */

export type TaskType = 'writer' | 'reviewer' | 'fixer' | 'diagram';

export type TaskStatus = 
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'interrupted'
  | 'blocked'
  | 'skipped';

export interface Task {
  id: string;
  type: TaskType;
  chapterId?: string;
  status: TaskStatus;
  priority: number;
  sequence: number; // 插入顺序，用于保证 FIFO
  attempt: number;
  prompt: string;
  dependencies: string[];
  error?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface SchedulerConfig {
  maxConcurrency: number;
  tokenBucketSize: number;
  tokenRefillRate: number;
  retryBaseDelayMs: number;
  retryBackoffMultiplier: number;
  retryMaxDelayMs: number;
  taskTimeoutMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrency: 3,
  tokenBucketSize: 10,
  tokenRefillRate: 0.5,
  retryBaseDelayMs: 5000,
  retryBackoffMultiplier: 2,
  retryMaxDelayMs: 60000,
  taskTimeoutMs: 600000,
};
