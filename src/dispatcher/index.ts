/**
 * Dispatcher — 状态机动作执行层
 * 
 * 职责：
 * 1. 接收状态机返回的 action
 * 2. 读取章节素材包/草稿/审阅报告（支持版本化文件）
 * 3. 通过 TaskExecutor 生成 prompt
 * 4. 创建 Task 并提交到 SubagentScheduler
 * 
 * 文件版本化设计（参考 bailian-agent/doc-chapters-v6）：
 * - Writer: drafts/chapters/${chapterId}-v${round}.md
 * - Reviewer: review/${chapterId}-r${round}.json
 * - Fixer: 读取上一版本，输出新版本
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectStore } from '../state/store.js';
import type { SubagentScheduler } from '../scheduler/index.js';
import type { Task } from '../scheduler/types.js';
import type { TaskExecutor, ReviewBaseline } from '../writing/task-executor.js';
import type { WritingOrchestrator } from '../writing/orchestrator.js';
import { KnowledgeLoader } from '../knowledge/loader.js';
import { validateChapterKits } from '../organize/kit-validator.js';

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
    const round = (params.round as number) || 1;
    const state = this.store.load();  // 读取 state 以获取 wordBudget
    const tasks: Task[] = [];
    let sequence = 1;

    for (const chapterId of chapters) {
      const kitContent = this.readChapterKit(chapterId);
      const task: Task = {
        id: `write-${chapterId}-r${round}`,
        type: 'writer',
        chapterId,
        priority: sequence,
        sequence,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };
      // 从 state 读取 wordBudget 并传递给 prompt
      const wordBudget = state?.chapters?.[chapterId]?.wordBudget;
      task.prompt = this.taskExecutor.generateWriterPrompt(task, kitContent, round, wordBudget);
      sequence++;
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_writers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个写作任务 (round ${round})`,
    };
  }

  private async dispatchReviewers(params: Record<string, unknown>): Promise<DispatchResult> {
    const chapters = params.chapters as string[];
    const round = params.round as number;
    const state = this.store.load();  // 读取 state 以获取 wordBudget
    const tasks: Task[] = [];
    let sequence = 1;

    // 初始化知识库加载器
    const knowledgeLoader = new KnowledgeLoader(this.projectDir);

    for (const chapterId of chapters) {
      // 读取版本化草稿文件: ch001-v${round}.md
      const draftContent = this.readChapterDraft(chapterId, round);
      const baseline = this.extractBaseline();
      
      // 从素材包提取相关分类，加载知识库内容
      const kitContent = this.readChapterKit(chapterId);
      const categories = this.extractCategoriesFromKit(kitContent);
      const knowledgeContent = knowledgeLoader.generateReviewerInjection(categories);
      
      const task: Task = {
        id: `review-${chapterId}-r${round}`,
        type: 'reviewer',
        chapterId,
        priority: sequence,
        sequence,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };
      // 从 state 读取 wordBudget 并传递给 prompt
      const wordBudget = state?.chapters?.[chapterId]?.wordBudget;
      task.prompt = this.taskExecutor.generateReviewerPrompt(task, draftContent, baseline, round, knowledgeContent, this.projectDir, wordBudget);
      sequence++;
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_reviewers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个审阅任务 (round ${round})`,
    };
  }

  private async dispatchFixers(params: Record<string, unknown>): Promise<DispatchResult> {
    const chapters = params.chapters as string[];
    const round = params.round as number;
    const tasks: Task[] = [];
    let sequence = 1;

    for (const chapterId of chapters) {
      // 读取当前版本草稿: ch001-v${round}.md
      const draftContent = this.readChapterDraft(chapterId, round);
      // 读取当前版本审阅报告: ch001-r${round}.json
      const reviewContent = this.readReviewReport(chapterId, round);
      const task: Task = {
        id: `fix-${chapterId}-r${round}`,
        type: 'fixer',
        chapterId,
        priority: sequence,
        sequence,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };
      // Fixer 输出新版本: ch001-v${round+1}.md
      task.prompt = this.taskExecutor.generateFixPrompt(task, draftContent, reviewContent, round);
      sequence++;
      tasks.push(task);
      this.scheduler.submit(task);
    }

    return {
      action: 'spawn_fixers',
      tasksCreated: tasks.length,
      tasks,
      message: `已创建 ${tasks.length} 个修复任务 (round ${round} → ${round + 1})`,
    };
  }

  /**
   * 处理任务结果：更新调度器状态 + 回写章节状态
   */
  async processTask(
    taskId: string, 
    outcome: 'success' | 'failed', 
    result: string,
    failureType?: 'execution_failed' | 'validation_failed',
  ): Promise<void> {
    const task = this.scheduler.getTask(taskId);
    if (!task) return;

    // Runner already called markCompleted/markFailed — only update chapter status
    // If task is still running (e.g. validation failure path), mark it
    if (task.status === 'running') {
      if (outcome === 'success') {
        this.scheduler.markCompleted(taskId, result);
      } else {
        this.scheduler.markFailed(taskId, result);
      }
    }

    // Update chapter status in project state
    const state = this.store.load();
    if (!state) return;

    this.writingOrchestrator.updateChapterStatus(state, task, outcome, this.projectDir, failureType);
    this.store.save(state);
  }

  private readChapterKit(chapterId: string): string {
    const kitPath = join(this.projectDir, 'assets', 'chapter-kits', `${chapterId}.md`);
    if (!existsSync(kitPath)) {
      return `[素材包缺失] 章节 ${chapterId} 的素材包文件不存在: ${kitPath}`;
    }

    const content = readFileSync(kitPath, 'utf-8');

    // 校验内容确实属于这个章节（Bug 31）
    //
    // 只按 id 取文件的话，大纲增删/重编号之后会**静默拿到别的章节**的素材。
    // 实测：assets/chapter-kits/ch005.md 还是上一版大纲留下的
    // 「2.3 微服务与容器化部署方案」，而新大纲的 ch005 是「3.1 质保期服务承诺」。
    // 与其把错误素材喂给 writer 产出一份「标题是 A、正文是 B」的文档，
    // 不如在这里明确报出来。phase 2/3 的出口条件已经会拦住这种情况，
    // 这里是绕过流程（手工改状态等）时的兜底。
    const expectedTitle = this.store.load()?.chapters?.[chapterId]?.title;
    if (expectedTitle) {
      const v = validateChapterKits(this.projectDir, [{ id: chapterId, title: expectedTitle }]);
      if (!v.ok) {
        const issue = v.issues[0];
        return (
          `[素材包不匹配] 章节 ${chapterId} 的期望标题是「${expectedTitle}」，` +
          `但 ${kitPath} 的表头是「${issue.actualTitle ?? '无法解析'}」。` +
          '这通常是大纲改动后素材包没有重建造成的。' +
          '请先重新准备素材（/confwrite:organize，或让流程经过 phase 3 素材准备）再写作。'
        );
      }
    }

    return content;
  }

  /**
   * 读取版本化草稿文件
   * 查找最高版本号，确保 reviewer/fixer 读到最新版本（保留历史版本）
   * @param chapterId 章节 ID
   * @param round 轮次（仅用于 fallback 提示）
   */
  private readChapterDraft(chapterId: string, round: number): string {
    const draftsDir = join(this.projectDir, 'drafts', 'chapters');
    
    // 扫描目录找最高版本号: ch001-v1.md, ch001-v2.md, ...
    try {
      const files = readdirSync(draftsDir);
      const versionPattern = new RegExp(`^${chapterId}-v(\\d+)\\.md$`);
      let maxVersion = -1;
      
      for (const file of files) {
        const match = file.match(versionPattern);
        if (match) {
          const version = parseInt(match[1], 10);
          if (version > maxVersion) {
            maxVersion = version;
          }
        }
      }
      
      if (maxVersion > 0) {
        const latestPath = join(draftsDir, `${chapterId}-v${maxVersion}.md`);
        return readFileSync(latestPath, 'utf-8');
      }
    } catch {
      // Directory doesn't exist or read error, fall through
    }
    
    // Fallback: 非版本化文件（向后兼容）
    const legacyPath = join(this.projectDir, 'drafts', 'chapters', `${chapterId}.md`);
    if (existsSync(legacyPath)) {
      return readFileSync(legacyPath, 'utf-8');
    }
    
    return `[草稿缺失] 章节 ${chapterId} 的草稿文件不存在 (round ${round})`;
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

  /**
   * 从素材包中提取相关分类
   * 素材包格式：
   * ## 相关分类
   * - 技术栈选型参考图 结构化
   * - 资产管理系统功能示意图 结构化
   */
  private extractCategoriesFromKit(kitContent: string): string[] {
    const categories: string[] = [];
    const lines = kitContent.split('\n');
    let inCategorySection = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 检测分类部分开始
      if (trimmed === '## 相关分类') {
        inCategorySection = true;
        continue;
      }
      
      // 检测下一个部分开始（结束分类部分）
      if (inCategorySection && trimmed.startsWith('## ') && trimmed !== '## 相关分类') {
        break;
      }
      
      // 提取分类项
      if (inCategorySection && trimmed.startsWith('- ')) {
        const category = trimmed.slice(2).trim();
        if (category) {
          categories.push(category);
        }
      }
    }

    return categories;
  }
}
