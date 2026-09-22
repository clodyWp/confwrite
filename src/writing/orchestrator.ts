import type { ProjectState, ChapterState } from '../state/schema.js';
import type { Task } from '../scheduler/types.js';
import type { ReviewDecision } from './task-executor.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
    outcome: 'success' | 'failed',
    projectDir?: string,
  ): void {
    if (!task.chapterId) return;
    
    const chapter = state.chapters[task.chapterId];
    if (!chapter) return;

    // 初始化新字段（兼容旧状态）
    if (chapter.consecutiveFailures === undefined) chapter.consecutiveFailures = 0;
    if (chapter.maxRounds === undefined) chapter.maxRounds = 5;

    if (outcome === 'failed') {
      chapter.consecutiveFailures += 1;
      
      // 检查是否有产物
      const hasOutput = this.checkOutputExists(task.chapterId, chapter.round, projectDir);
      
      if (task.failureReason === 'rate_limited') {
        // 429 限流：不增加轮次，等待重试
        chapter.status = 'pending';
      } else if (chapter.consecutiveFailures >= 5) {
        // 连续失败 5 次
        if (hasOutput) {
          // 有产物：标记为 completed（降级接受）
          chapter.status = 'completed';
          chapter.failureReason = 'completed_with_issues';
        } else {
          // 无产物：标记为 failed
          chapter.status = 'failed';
          chapter.failureReason = 'no_output';
        }
      } else {
        // 其他失败：保留产出，由 fixer 在下一轮修复
        chapter.status = 'reviewed';
        chapter.lastReviewVerdict = 'revise';
      }
      return;
    }

    // 任务成功
    chapter.consecutiveFailures = 0; // 成功时重置
    
    switch (task.type) {
      case 'writer':
        chapter.status = 'written';
        break;

      case 'reviewer': {
        const decision = this.parseReviewResult(task.result, task.chapterId, chapter.round, projectDir);
        chapter.lastReviewVerdict = decision.decision;
        
        // 检查轮次限制
        if (chapter.round >= chapter.maxRounds) {
          const hasOutput = this.checkOutputExists(task.chapterId, chapter.round, projectDir);
          if (hasOutput) {
            chapter.status = 'completed';
            chapter.failureReason = 'exceeded_max_rounds_with_output';
          } else {
            chapter.status = 'failed';
            chapter.failureReason = 'exceeded_max_rounds_no_output';
          }
        } else if (decision.decision === 'accept') {
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
   * 检查章节是否有产出文件
   */
  private checkOutputExists(chapterId: string, round: number, projectDir?: string): boolean {
    if (!projectDir) return false;
    const filePath = join(projectDir, 'drafts', 'chapters', `${chapterId}-v${round}.md`);
    try {
      return existsSync(filePath) && statSync(filePath).size > 0;
    } catch {
      return false;
    }
  }

  /**
   * 安全解析 Reviewer 输出
   * 
   * 优先从磁盘读取 JSON 文件（verdict 字段），失败后从 task.result 文本提取
   * 最终默认 revise（安全侧：不丢弃内容也不盲目接受）
   * 
   * 注意：LLM 输出 JSON 文件使用 `verdict` 字段，而非 `decision`
   */
  private parseReviewResult(result: string | undefined, chapterId?: string, round?: number, projectDir?: string): ReviewDecision {
    // 优先尝试从磁盘读取 JSON 文件
    if (chapterId && round && projectDir) {
      try {
        const reviewPath = join(projectDir, 'review', `${chapterId}-r${round}.json`);
        
        if (existsSync(reviewPath)) {
          const fileContent = readFileSync(reviewPath, 'utf-8');
          const parsed = JSON.parse(fileContent);
          
          // 支持 verdict 和 decision 两种字段名
          const verdict = parsed.verdict || parsed.decision;
          if (verdict && ['accept', 'reject', 'revise'].includes(verdict)) {
            return {
              decision: verdict as 'accept' | 'reject' | 'revise',
              confidence: parsed.confidence || 0.8,
              reasons: parsed.reasons || ['parsed from JSON file'],
            };
          }
        }
      } catch {
        // File read/parse failed, fall through to text parsing
      }
    }

    // Fallback: 尝试从 task.result 文本解析
    if (!result) {
      return { decision: 'revise', confidence: 0, reasons: ['empty review result'] };
    }

    // Try JSON first
    try {
      const parsed = JSON.parse(result) as any;
      // 支持 verdict 和 decision 两种字段名
      const verdict = parsed.verdict || parsed.decision;
      if (verdict && ['accept', 'reject', 'revise'].includes(verdict)) {
        return {
          decision: verdict as 'accept' | 'reject' | 'revise',
          confidence: parsed.confidence || 0.8,
          reasons: parsed.reasons || ['parsed from JSON'],
        };
      }
    } catch {
      // Not JSON, fall through to text parsing
    }

    // Fallback: extract decision from free text
    const decisionMatch = result.match(/\*\*决定\*\*:\s*(accept|reject|revise)/i)
      || result.match(/verdict:\s*(accept|reject|revise)/i)
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
