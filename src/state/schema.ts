/**
 * ConfWrite State Schema — TypeBox definitions
 * 
 * All state is persisted as JSON. Schema ensures type safety
 * and enables migration between versions.
 */
import { Type, type Static } from '@sinclair/typebox';

// ============ Chapter State ============

export const ChapterStatusEnum = Type.Union([
  Type.Literal('pending'),
  Type.Literal('writing'),
  Type.Literal('written'),
  Type.Literal('reviewing'),
  Type.Literal('reviewed'),
  Type.Literal('fixing'),
  Type.Literal('fixed'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('skipped'),
]);
export type ChapterStatus = Static<typeof ChapterStatusEnum>;

export const ChapterState = Type.Object({
  id: Type.String(),
  title: Type.String(),
  status: ChapterStatusEnum,
  version: Type.Number({ default: 0 }),
  round: Type.Number({ default: 1 }),
  attempt: Type.Number({ default: 0 }),
  outlineSection: Type.Optional(Type.String()),
  parentChapter: Type.Optional(Type.String()),
  spawnLevel: Type.Optional(Type.Number({ default: 3 })),
  createdAt: Type.Optional(Type.String({ format: 'date-time' })),
  updatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
  failedAt: Type.Optional(Type.String({ format: 'date-time' })),
  lastError: Type.Optional(Type.String()),
  lastReviewVerdict: Type.Optional(Type.Union([
    Type.Literal('accept'),
    Type.Literal('revise'),
    Type.Literal('reject'),
  ])),
});
export type ChapterState = Static<typeof ChapterState>;

// ============ Task State (Subagent Scheduler) ============

export const TaskStatusEnum = Type.Union([
  Type.Literal('queued'),
  Type.Literal('running'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('retrying'),
  Type.Literal('interrupted'),
  Type.Literal('blocked'),
  Type.Literal('skipped'),
]);
export type TaskStatus = Static<typeof TaskStatusEnum>;

export const TaskType = Type.Union([
  Type.Literal('writer'),
  Type.Literal('reviewer'),
  Type.Literal('fixer'),
  Type.Literal('researcher'),
  Type.Literal('planner'),
  Type.Literal('diagram'),
]);
// Note: TaskType already has all 6 types — no change needed
export type TaskType = Static<typeof TaskType>;

export const SubagentTask = Type.Object({
  id: Type.String(),
  type: TaskType,
  chapterId: Type.Optional(Type.String()),
  status: TaskStatusEnum,
  attempt: Type.Number({ default: 0 }),
  priority: Type.Number({ default: 0 }),
  prompt: Type.String(),
  error: Type.Optional(Type.String()),
  result: Type.Optional(Type.String()),
  startedAt: Type.Optional(Type.String({ format: 'date-time' })),
  completedAt: Type.Optional(Type.String({ format: 'date-time' })),
  dependencies: Type.Array(Type.String(), { default: [] }),
});
export type SubagentTask = Static<typeof SubagentTask>;

// ============ Phase State ============

export const PhaseEnum = Type.Union([
  Type.Literal('0a'),  // 项目初始化
  Type.Literal('0b'),  // 素材整理
  Type.Literal('1'),   // 需求分析
  Type.Literal('2'),   // 大纲规划
  Type.Literal('3'),   // 素材准备
  Type.Literal('4a'),  // 写作
  Type.Literal('4b'),  // 审阅
  Type.Literal('4c'),  // 决策
  Type.Literal('4d'),  // 修复
  Type.Literal('5'),   // 图表生成
  Type.Literal('6'),   // 组装
  Type.Literal('7'),   // 定稿
  Type.Literal('8'),   // 导出
  Type.Literal('done'),
]);
export type Phase = Static<typeof PhaseEnum>;

// ============ Scheduler State ============

export const SchedulerState = Type.Object({
  tokens: Type.Number({ default: 10 }),
  lastRefillAt: Type.Optional(Type.String({ format: 'date-time' })),
  paused: Type.Boolean({ default: false }),
  lastTick: Type.Optional(Type.String({ format: 'date-time' })),
});
export type SchedulerState = Static<typeof SchedulerState>;

// ============ Project State (Root) ============

export const ProjectState = Type.Object({
  // Metadata
  version: Type.Number({ default: 1 }),
  project: Type.String(),
  projectDir: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  lastUpdated: Type.String({ format: 'date-time' }),

  // Phase
  currentPhase: PhaseEnum,
  status: Type.Union([
    Type.Literal('init'),
    Type.Literal('organizing'),
    Type.Literal('outlining'),
    Type.Literal('writing'),
    Type.Literal('reviewing'),
    Type.Literal('assembling'),
    Type.Literal('exporting'),
    Type.Literal('done'),
    Type.Literal('failed'),
  ]),

  // Chapters
  chapters: Type.Record(Type.String(), ChapterState),
  round: Type.Number({ default: 1 }),

  // Scheduler
  scheduler: Type.Optional(SchedulerState),

  // Tasks
  tasks: Type.Optional(Type.Array(SubagentTask)),

  // Outline
  outlineVersion: Type.Optional(Type.String()),
  totalChapters: Type.Optional(Type.Number()),
  spawnLevel: Type.Optional(Type.Number({ default: 3 })),

  // Execution log
  executionLog: Type.Optional(Type.Array(
    Type.Object({
      time: Type.String({ format: 'date-time' }),
      phase: Type.Optional(Type.String()),
      action: Type.String(),
    })
  )),

  // Output
  output: Type.Optional(Type.Object({
    finalMd: Type.Optional(Type.String()),
    finalDocx: Type.Optional(Type.String()),
    stats: Type.Optional(Type.Object({
      chapters: Type.Number(),
      tables: Type.Optional(Type.Number()),
      diagrams: Type.Optional(Type.Number()),
    })),
  })),

  // Flags
  escalatedToHuman: Type.Optional(Type.Boolean({ default: false })),
});
export type ProjectState = Static<typeof ProjectState>;

// ============ Scheduler Config (not persisted, user-configurable) ============

export interface SchedulerConfig {
  maxConcurrency: number;
  tokenBucketSize: number;
  tokenRefillRate: number;       // tokens per second
  retryBaseDelayMs: number;
  retryBackoffMultiplier: number;
  retryMaxDelayMs: number;
  taskTimeoutMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrency: 3,
  tokenBucketSize: 10,
  tokenRefillRate: 0.5,          // 1 token per 2 seconds
  retryBaseDelayMs: 5000,
  retryBackoffMultiplier: 2,
  retryMaxDelayMs: 60000,
  taskTimeoutMs: 600000,          // 10 minutes
};
