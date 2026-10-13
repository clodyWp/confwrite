import type { ProjectState, ChapterState } from '../state/schema.js';
import type { Task } from '../scheduler/types.js';
import type { ReviewDecision } from './task-executor.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EventBus } from '../logging/event-bus.js';

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
  private eventBus?: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus;
  }

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
    failureType?: 'execution_failed' | 'validation_failed',
  ): void {
    if (!task.chapterId) return;
    
    const chapter = state.chapters[task.chapterId];
    if (!chapter) return;

    // 初始化新字段（兼容旧状态）
    if (chapter.consecutiveFailures === undefined) chapter.consecutiveFailures = 0;
    if (chapter.maxRounds === undefined) chapter.maxRounds = 5;

    // SM-17: 记录旧状态用于事件发射
    const oldStatus = chapter.status;

    if (outcome === 'failed') {
      chapter.consecutiveFailures += 1;
      
      // Bug 36.1 修复：区分失败类型
      // - validation_failed（如字数超标）：即使有产物也要进入修复循环
      // - execution_failed（如 turn 耗尽）：有产物可降级接受
      if (failureType === 'validation_failed') {
        // Bug 41 修复：递增轮次，确保 maxRounds 守护生效
        chapter.round += 1;
        
        // Bug 41 修复：先检查 maxRounds（兜底机制）
        if (chapter.round >= chapter.maxRounds) {
          const hasOutput = this.checkOutputExists(task.chapterId, chapter.round - 1, projectDir);
          chapter.status = hasOutput ? 'completed' : 'failed';
          chapter.failureReason = 'exceeded_max_rounds_validation';
          this.emitChapterEvents(task.chapterId, oldStatus, chapter, projectDir);
          return;
        }
        
        // Bug 1 修复：validation_failed 时设置为 written，让 reviewer 评估
        // 而不是 reviewed（reviewed 只应该在 Phase 4b 之后出现，SM-19）
        if (chapter.consecutiveFailures >= 5) {
          chapter.status = 'failed';
          chapter.failureReason = 'validation_failed_persistently';
        } else {
          chapter.status = 'written';  // 修复：从 'reviewed' 改为 'written'
          // 不设置 lastReviewVerdict，因为还没有经过审阅
        }
        this.emitChapterEvents(task.chapterId, oldStatus, chapter, projectDir);
        return;
      }
      
      // 检查是否有产物
      const hasOutput = this.checkOutputExists(task.chapterId, chapter.round, projectDir);
      
      // Bug 32 修复：产物已存在且有效时，即使任务失败也降级接受
      // （典型场景：turn 预算耗尽，但审阅报告/章节草稿已正确写出）
      if (hasOutput) {
        chapter.status = 'completed';
        chapter.failureReason = 'completed_with_issues';
        chapter.consecutiveFailures = 0;
        this.emitChapterEvents(task.chapterId, oldStatus, chapter, projectDir);
        return;
      }
      
      if (chapter.consecutiveFailures >= 5) {
        // 连续失败 5 次且无产物
        chapter.status = 'failed';
        chapter.failureReason = 'no_output';
      } else {
        // Bug 1 修复：无输出时设置为 pending（重试 writer）
        // 而不是 reviewed（reviewed 只应该在 Phase 4b 之后出现，SM-19）
        chapter.status = 'pending';  // 修复：从 'reviewed' 改为 'pending'
      }
      this.emitChapterEvents(task.chapterId, oldStatus, chapter, projectDir);
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
        chapter.round += 1;  // Bug 51: 递增轮次，确保 maxRounds 守护生效
        
        // Bug 41 修复：fixer 成功后检查 maxRounds（兜底机制）
        if (chapter.round >= chapter.maxRounds) {
          chapter.status = 'completed';
          chapter.failureReason = 'exceeded_max_rounds';
        }
        break;
    }

    // SM-17: 方法出口统一发射事件
    this.emitChapterEvents(task.chapterId, oldStatus, chapter, projectDir);
  }

  /**
   * SM-17: 发射章节相关事件
   * - chapter.status: 状态变化时
   * - chapter.failed: 章节失败时
   * - round.exceeded: 轮次超限时
   */
  private emitChapterEvents(
    chapterId: string,
    oldStatus: string,
    chapter: ChapterState,
    projectDir?: string,
  ): void {
    if (!this.eventBus) return;

    // chapter.status: 状态变化时发射
    if (chapter.status !== oldStatus) {
      this.eventBus.emit({
        type: 'chapter.status',
        chapterId,
        from: oldStatus,
        to: chapter.status,
        version: chapter.round,
      });
    }

    // chapter.failed: 章节失败时发射
    if (chapter.status === 'failed') {
      const hasOutput = this.checkOutputExists(chapterId, chapter.round, projectDir);
      this.eventBus.emit({
        type: 'chapter.failed',
        chapterId,
        round: chapter.round,
        failureReason: (chapter.failureReason || 'unknown') as 'exceeded_max_rounds' | 'too_many_failures' | 'no_output',
        hasOutput,
        finalAction: 'failed',
      });
    }

    // round.exceeded: 轮次超限时发射
    if (chapter.round >= chapter.maxRounds) {
      const hasOutput = this.checkOutputExists(chapterId, chapter.round, projectDir);
      this.eventBus.emit({
        type: 'round.exceeded',
        chapterId,
        currentRound: chapter.round,
        maxRounds: chapter.maxRounds,
        hasOutput,
        finalAction: chapter.status === 'completed' ? 'completed' : 'failed',
      });
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
