/**
 * Dispatcher — 状态机动作执行层
 * 
 * 职责：
 * 1. 接收状态机返回的 action
 * 2. 读取章节素材包/草稿/审阅报告
 * 3. 通过 TaskExecutor 生成 prompt
 * 4. 创建 Task 并提交到 SubagentScheduler
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectStore } from '../state/store.js';
import type { SubagentScheduler } from '../scheduler/index.js';
import type { Task } from '../scheduler/types.js';
import type { TaskExecutor, ReviewBaseline } from '../writing/task-executor.js';
import type { WritingOrchestrator } from '../writing/orchestrator.js';

export interface DispatchResult {
  action: string;
  tasksCreated: number;
  tasks: Task[];
  message: string;
}

export class Dispatcher {
  private projectDir: string;
  private store: ProjectStore;
  private scheduler: SubagentScheduler;
  private taskExecutor: TaskExecutor;
  private writingOrchestrator: WritingOrchestrator;

  constructor(
    projectDir: string,
    store: ProjectStore,
    scheduler: SubagentScheduler,
    taskExecutor: TaskExecutor,
    writingOrchestrator: WritingOrchestrator,
  ) {
    this.projectDir = projectDir;
    this.store = store;
    this.scheduler = scheduler;
    this.taskExecutor = taskExecutor;
    this.writingOrchestrator = writingOrchestrator;
  }

  async dispatch(action: string, params: Record<string, unknown>): Promise<DispatchResult> {
    switch (action) {
      case 'spawn_writers':
        return this.dispatchWriters(params);
      case 'spawn_reviewers':
        return this.dispatchReviewers(params);
      case 'spawn_fixers':
        return this.dispatchFixers(params);
      case 'generate_diagrams':
        return { action, tasksCreated: 0, tasks: [], message: 'Phase 5: 图表生成（空壳，跳过）' };
      case 'assemble':
        return { action, tasksCreated: 0, tasks: [], message: '组装由 Assembler 直接处理' };
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async dispatchWriters(params: Record<string, unknown>): Promise<DispatchResult> {
    const chapters = params.chapters as string[];
    const tasks: Task[] = [];
    let sequence = 1;

    for (const chapterId of chapters) {
      const kitContent = this.readChapterKit(chapterId);
      const task: Task = {
        id: `write-${chapterId}`,
        type: 'writer',
        chapterId,
        priority: sequence,
        sequence: sequence++,
        status: 'queued',
        attempt: 0,
        prompt: this.taskExecutor.generateWriterPrompt(
          { id: `write-${chapterId}`, type: 'writer', chapterId, status: 'queued', prompt: '', dependencies: [] },
          kitContent,
        ),
        dependencies: [],
      };
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_writers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个写作任务`,
    };
  }

  private async dispatchReviewers(params: Record<string, unknown>): Promise<DispatchResult> {
    const chapters = params.chapters as string[];
    const round = params.round as number;
    const tasks: Task[] = [];
    let sequence = 1;

    for (const chapterId of chapters) {
      const draftContent = this.readChapterDraft(chapterId);
      const baseline = this.extractBaseline();
      const task: Task = {
        id: `review-${chapterId}-r${round}`,
        type: 'reviewer',
        chapterId,
        priority: sequence,
        sequence: sequence++,
        status: 'queued',
        attempt: 0,
        prompt: this.taskExecutor.generateReviewerPrompt(
          { id: `review-${chapterId}-r${round}`, type: 'reviewer', chapterId, status: 'queued', prompt: '', dependencies: [] },
          draftContent,
          baseline,
        ),
        dependencies: [],
      };
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_reviewers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个审阅任务`,
    };
  }

  private async dispatchFixers(params: Record<string, unknown>): Promise<DispatchResult> {
    const chapters = params.chapters as string[];
    const round = params.round as number;
    const tasks: Task[] = [];
    let sequence = 1;

    for (const chapterId of chapters) {
      const draftContent = this.readChapterDraft(chapterId);
      const reviewContent = this.readReviewReport(chapterId, round);
      const task: Task = {
        id: `fix-${chapterId}-r${round}`,
        type: 'fixer',
        chapterId,
        priority: sequence,
        sequence: sequence++,
        status: 'queued',
        attempt: 0,
        prompt: this.taskExecutor.generateFixPrompt(
          { id: `fix-${chapterId}-r${round}`, type: 'fixer', chapterId, status: 'queued', prompt: '', dependencies: [] },
          draftContent,
          reviewContent,
        ),
        dependencies: [],
      };
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_fixers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个修复任务`,
    };
  }

  /**
   * 处理任务结果：更新调度器状态 + 回写章节状态
   */
  async processTask(taskId: string, outcome: 'success' | 'failed', result: string): Promise<void> {
    const task = this.scheduler.getTask(taskId);
    if (!task) return;

    // Update scheduler state
    if (outcome === 'success') {
      this.scheduler.markCompleted(taskId, result);
    } else {
      this.scheduler.markFailed(taskId, result);
    }

    // Update chapter status in project state
    const state = this.store.load();
    if (!state) return;

    this.writingOrchestrator.updateChapterStatus(state, task, outcome);
    this.store.save(state);
  }

  private readChapterKit(chapterId: string): string {
    const kitPath = join(this.projectDir, 'assets', 'chapter-kits', `${chapterId}-kit.md`);
    if (!existsSync(kitPath)) {
      return `[素材包缺失] 章节 ${chapterId} 的素材包文件不存在: ${kitPath}`;
    }
    return readFileSync(kitPath, 'utf-8');
  }

  private readChapterDraft(chapterId: string): string {
    const draftPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}.md`);
    if (!existsSync(draftPath)) {
      return `[草稿缺失] 章节 ${chapterId} 的草稿文件不存在: ${draftPath}`;
    }
    return readFileSync(draftPath, 'utf-8');
  }

  private readReviewReport(chapterId: string, round: number): string {
    const reviewPath = join(this.projectDir, 'review', `${chapterId}-r${round}.json`);
    if (!existsSync(reviewPath)) {
      return `[审阅报告缺失] 章节 ${chapterId} 的审阅报告不存在: ${reviewPath}`;
    }
    return readFileSync(reviewPath, 'utf-8');
  }

  private extractBaseline(): ReviewBaseline {
    const baselinePath = join(this.projectDir, 'assets', 'data-baseline.json');
    if (!existsSync(baselinePath)) {
      return { metrics: {}, technicalTerms: [], requirements: [] };
    }
    try {
      const raw = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      return {
        metrics: raw.metrics || {},
        technicalTerms: raw.technicalTerms || [],
        requirements: raw.requirements || [],
      };
    } catch {
      return { metrics: {}, technicalTerms: [], requirements: [] };
    }
  }
}
