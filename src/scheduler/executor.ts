/**
 * SubagentExecutor — 抽象 subagent 执行层
 * 
 * 隔离调度器与具体执行环境（pi subagent / mock / CLI）
 */
import type { Task } from './types.js';

export interface ExecutorResult {
  success: boolean;
  output: string;
  durationMs: number;
}

export interface SubagentExecutor {
  execute(task: Task): Promise<ExecutorResult>;
}
