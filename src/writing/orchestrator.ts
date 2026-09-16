import type { ProjectState, ChapterState } from '../state/schema.js';
import type { Task } from '../scheduler/types.js';
import type { ReviewDecision } from './task-executor.js';

/**
 * 下一步动作
 */
export interface NextAction {
  type: 'write' | 'review' | 'fix' | 'complete';
  tasks: Task[];
}

/**
 * 写作阶段编排器
 * 负责协调写作、审阅、修复的循环
 */
export class WritingOrchestrator {
  /**
   * 生成写作任务
   */
  generateWritingTasks(state: ProjectState): Task[] {
    const tasks: Task[] = [];
    const chapters = Object.values(state.chapters);

    // 按章节 ID 排序，确保顺序一致
    chapters.sort((a, b) => a.id.localeCompare(b.id));

    let priority = 1;
    let sequence = 1;
    for (const chapter of chapters) {
      if (chapter.status === 'pending') {
        tasks.push({
          id: `write-${chapter.id}-r${chapter.round}`,
          type: 'writer',
          chapterId: chapter.id,
          priority: priority++,
          sequence: sequence++,
          status: 'queued',
          attempt: 0,
          prompt: '', // Will be filled by task executor
          dependencies: [],
        });
      }
    }

    return tasks;
  }

  /**
   * 生成审阅任务
   */
  generateReviewTasks(state: ProjectState): Task[] {
    const tasks: Task[] = [];
    const chapters = Object.values(state.chapters);

    chapters.sort((a, b) => a.id.localeCompare(b.id));

    let priority = 1;
    let sequence = 1;
    for (const chapter of chapters) {
      if (chapter.status === 'written') {
        tasks.push({
          id: `review-${chapter.id}-r${chapter.round}`,
          type: 'reviewer',
          chapterId: chapter.id,
          priority: priority++,
          sequence: sequence++,
          status: 'queued',
          attempt: 0,
          prompt: '',
          dependencies: [],
        });
      }
    }

    return tasks;
  }

  /**
   * 生成修复任务
   */
  generateFixTasks(state: ProjectState): Task[] {
    const tasks: Task[] = [];
    const chapters = Object.values(state.chapters);

    chapters.sort((a, b) => a.id.localeCompare(b.id));

    let priority = 1;
    let sequence = 1;
    for (const chapter of chapters) {
      if (chapter.status === 'reviewed' && chapter.lastReviewVerdict === 'revise') {
        tasks.push({
          id: `fix-${chapter.id}-r${chapter.round}`,
          type: 'fixer',
          chapterId: chapter.id,
          priority: priority++,
          sequence: sequence++,
          status: 'queued',
          attempt: chapter.attempt + 1,
          prompt: '',
          dependencies: [],
        });
      }
    }

    return tasks;
  }

  /**
   * 更新章节状态
   */
  updateChapterStatus(
    state: ProjectState,
    task: Task,
    outcome: 'success' | 'failed'
  ): void {
    if (!task.chapterId) return;
    
    const chapter = state.chapters[task.chapterId];
    if (!chapter) return;

    if (outcome === 'failed') {
      // 任务失败，回退状态
      chapter.status = 'pending';
      chapter.attempt = chapter.attempt + 1;
      return;
    }

    // 任务成功
    switch (task.type) {
      case 'writer':
        chapter.status = 'written';
        break;

      case 'reviewer': {
        const decision = this.parseReviewResult(task.result);
        chapter.lastReviewVerdict = decision.decision;
        if (decision.decision === 'accept') {
          chapter.status = 'completed';
        } else if (decision.decision === 'revise') {
          chapter.status = 'reviewed'; // needs fix
        } else {
          // reject: 需要重写
          chapter.status = 'pending';
          chapter.round += 1;
        }
        break;
      }

      case 'fixer':
        chapter.status = 'written';
        chapter.attempt = task.attempt;
        break;
    }
  }

  /**
   * 安全解析 Reviewer 输出
   * 优先尝试 JSON，失败后从自由文本提取决定
   * 最终默认 revise（安全侧：不丢弃内容也不盲目接受）
   */
  private parseReviewResult(result: string | undefined): ReviewDecision {
    if (!result) {
      return { decision: 'revise', confidence: 0, reasons: ['empty review result'] };
    }

    // Try JSON first
    try {
      const parsed = JSON.parse(result) as ReviewDecision;
      if (parsed && ['accept', 'reject', 'revise'].includes(parsed.decision)) {
        return parsed;
      }
    } catch {
      // Not JSON, fall through to text parsing
    }

    // Fallback: extract decision from free text
    const decisionMatch = result.match(/\*\*决定\*\*:\s*(accept|reject|revise)/i)
      || result.match(/decision:\s*(accept|reject|revise)/i)
      || result.match(/\b(accept|reject|revise)\b/i);

    if (decisionMatch) {
      return {
        decision: decisionMatch[1].toLowerCase() as 'accept' | 'reject' | 'revise',
        confidence: 0.5,
        reasons: ['parsed from free text'],
      };
    }

    // Ultimate fallback
    return { decision: 'revise', confidence: 0, reasons: ['could not parse review decision'] };
  }

  /**
   * 检查写作阶段是否完成
   */
  isWritingPhaseComplete(state: ProjectState): boolean {
    const chapters = Object.values(state.chapters);
    
    if (chapters.length === 0) {
      return false;
    }

    return chapters.every(ch => ch.status === 'completed');
  }

  /**
   * 获取下一步动作
   */
  getNextAction(state: ProjectState): NextAction {
    // 检查是否有需要修复的章节
    const fixTasks = this.generateFixTasks(state);
    if (fixTasks.length > 0) {
      return { type: 'fix', tasks: fixTasks };
    }

    // 检查是否有需要审阅的章节
    const reviewTasks = this.generateReviewTasks(state);
    if (reviewTasks.length > 0) {
      return { type: 'review', tasks: reviewTasks };
    }

    // 检查是否有需要写作的章节
    const writeTasks = this.generateWritingTasks(state);
    if (writeTasks.length > 0) {
      return { type: 'write', tasks: writeTasks };
    }

    // 所有任务完成
    if (this.isWritingPhaseComplete(state)) {
      return { type: 'complete', tasks: [] };
    }

    // 不应该到达这里，但作为后备
    return { type: 'complete', tasks: [] };
  }
}
