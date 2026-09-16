/**
 * Scheduler Types
 *
 * Single source of truth for TaskType, TaskStatus, SchedulerConfig:
 *   → state/schema.ts (TypeBox runtime validation)
 *
 * This file re-exports those and adds the Task interface
 * (not in schema because it's a runtime working type).
 */

// Re-export canonical types from schema
export type { TaskType, TaskStatus, SchedulerConfig } from '../state/schema.js';
export { DEFAULT_SCHEDULER_CONFIG } from '../state/schema.js';

import type { TaskType, TaskStatus } from '../state/schema.js';

export interface Task {
  id: string;
  type: TaskType;
  chapterId?: string;
  status: TaskStatus;
  priority: number;
  sequence: number; // insertion order for FIFO
  attempt: number;
  prompt: string;
  dependencies: string[];
  error?: string;
  result?: string;
  startedAt?: number;
  completedAt?: number;
}
