/**
 * ConfWrite Extension — pi Extension entry point
 * 
 * Registers commands with the pi agent system.
 * All flow control is deterministic (TypeScript state machine).
 * LLM only handles content generation.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { initProject } from './commands/init.js';
import { organizeMaterials } from './commands/organize.js';
import { exportDocument } from './commands/export.js';
import { outlineCommand } from './commands/outline.js';
import { StateMachine } from './orchestrator/state-machine.js';
import { SubagentScheduler } from './scheduler/index.js';
import { SchedulerRunner } from './scheduler/runner.js';
import { PiSubagentExecutor } from './scheduler/pi-executor.js';
import type { SubagentExecutor } from './scheduler/executor.js';
import { DEFAULT_SCHEDULER_CONFIG, type SchedulerConfig } from './state/schema.js';
import { Dispatcher } from './dispatcher/index.js';
import { TaskExecutor } from './writing/task-executor.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getConfWriteVersion(): string {
  try {
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}
import { WritingOrchestrator } from './writing/orchestrator.js';
import { OutputValidator } from './writing/output-validator.js';
import { ProjectStore } from './state/store.js';
import { LoggingSystem } from './logging/index.js';
import { loadConfig } from './config/loader.js';
import { resolve } from 'node:path';

export type NotifyLevel = 'info' | 'error' | 'warning';

export interface WriteLoopResult {
  ticks: number;
  tasksExecuted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  messages: Array<{ msg: string; level: NotifyLevel }>;
  stoppedReason: string;
  completed: boolean;
}

export interface WriteLoopOptions {
  executorOverride?: SubagentExecutor;
  configOverride?: Partial<SchedulerConfig>;
  /** 检查上下文大小，返回当前 tokens。超过阈值时触发 compact */
  getContextTokens?: () => number | null;
  /** 触发上下文压缩 */
  triggerCompact?: () => Promise<void>;
  /** 启用文件日志 */
  fileLogEnabled?: boolean;
}

export async function runWriteLoop(
  projectDir: string,
  notify: (msg: string, level: NotifyLevel) => void,
  options?: WriteLoopOptions,
): Promise<WriteLoopResult> {
  const { executorOverride, configOverride, getContextTokens, triggerCompact } = options || {};
  const result: WriteLoopResult = {
    ticks: 0,
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    messages: [],
    stoppedReason: '',
    completed: true,
  };

  const machine = new StateMachine(projectDir);
  const store = machine.getStore();
  const state = store.load();
  if (!state) {
    notify('未找到项目状态文件，请先运行 /confwrite:init', 'error');
    result.stoppedReason = 'no_state';
    result.completed = false;
    return result;
  }

  // Clear waitPoint on resume — user explicitly requested to continue
  if (state.waitPoint) {
    state.waitPoint = undefined;
    store.save(state);
  }

  const config = { ...DEFAULT_SCHEDULER_CONFIG, ...configOverride };
  
  // 加载用户配置文件（confwrite.config.json）
  const userConfig = loadConfig(projectDir);
  
  // 初始化日志系统（启用文件日志）
  const loggingSystem = new LoggingSystem(notify, {
    enabled: options?.fileLogEnabled ?? true,
    projectDir,
    filename: 'confwrite-log.json',
  });
  
  // 合并用户配置到调度配置
  const schedulerConfig = {
    ...config,
    maxConcurrency: userConfig.scheduler?.maxConcurrency ?? config.maxConcurrency,
    maxTurnsPerTask: userConfig.scheduler?.maxTurnsPerTask ?? config.maxTurnsPerTask,
    maxTaskRetries: userConfig.scheduler?.maxTaskRetries ?? config.maxTaskRetries,
  };
  
  const scheduler = new SubagentScheduler(schedulerConfig);
  const executor = executorOverride ?? new PiSubagentExecutor({
    projectDir,
    maxTurnsPerTask: schedulerConfig.maxTurnsPerTask,
  });
  const runner = new SchedulerRunner(
    scheduler,
    executor,
    schedulerConfig.maxConcurrency,
    config.rateLimitWindowMs,
    config.rateLimitMaxTasks,
    config.rateLimitDelayMs,
    schedulerConfig.maxTaskRetries,
    loggingSystem.eventBus, // 传递 EventBus
  );
  const taskExecutor = new TaskExecutor(userConfig);
  const writingOrchestrator = new WritingOrchestrator();
  const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);
  const outputValidator = new OutputValidator(projectDir, userConfig);

  const EXECUTABLE_ACTIONS = new Set(['spawn_writers', 'spawn_reviewers', 'spawn_fixers']);
  const MAX_TICKS = 2000;  // 足够支持 85 章节 × 3+ 轮

  while (result.ticks < MAX_TICKS) {
    result.ticks++;

    // 已到达终态：正常收尾（Bug 30）
    //
    // `done` 是 phase 8 的跳转目标，但不是需要执行的阶段。
    // 以前没有这个检查，循环会再 tick 一次，而对 'done' 没有
    // 可执行的阶段定义（历史行为是返回 blocked），index.ts 于是把它
    // 当失败：控制台打印「⛔ 未知: 未知 Phase: done」，
    // stoppedReason 被记为 'blocked' —— 成功的运行看起来像失败。
    //
    // 检查必须在 tick 之前：终态不需要任何推进。
    if (machine.status()?.phase === 'done') {
      result.stoppedReason = 'completed';
      break;
    }

    // 检查上下文大小，超过阈值时触发压缩
    if (getContextTokens && triggerCompact && config.compactThresholdTokens > 0) {
      const currentTokens = getContextTokens();
      if (currentTokens !== null && currentTokens > config.compactThresholdTokens) {
        notify(`⚠️ 上下文已达 ${currentTokens} tokens，超过阈值 ${config.compactThresholdTokens}，触发压缩...`, 'warning');
        
        let compactSuccess = false;
        let lastError = '';
        
        // 重试一次
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await triggerCompact();
            compactSuccess = true;
            notify('✅ 上下文压缩完成', 'info');
            break;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (attempt === 0) {
              notify(`⚠️ 压缩失败，重试中...`, 'warning');
            }
          }
        }
        
        if (!compactSuccess) {
          notify(`⛔ 上下文压缩失败: ${lastError}`, 'error');
          notify(`💡 请手动执行 /confwrite:compact 压缩上下文，然后 /confwrite:resume 继续`, 'info');
          result.stoppedReason = 'compact_failed';
          result.completed = false;
          break;
        }
      }
    }

    const tickResult = await machine.tick();

    if ('blocked' in tickResult && tickResult.blocked) {
      notify(`⛔ ${tickResult.phaseName}: ${tickResult.error}`, 'error');
      result.stoppedReason = 'blocked';
      break;
    }

    const step = tickResult as {
      phase: string;
      phaseName: string;
      action: string;
      message: string;
      params?: Record<string, unknown>;
      advanced: boolean;
      previousPhase?: string;
      atWaitPoint?: boolean;
      waitPointReason?: string;
      waitPointInstructions?: string;
    };

    if (step.advanced) {
      notify(`⏩ ${step.previousPhase} → ${step.phase} (${step.phaseName})`, 'info');
      // 更新日志系统的当前阶段
      loggingSystem.setCurrentPhase(step.phase);
    }

    // 处理等待点
    if (step.atWaitPoint || step.action === 'wait_point') {
      notify(`⏸️ 等待点: ${step.waitPointReason || step.message}`, 'info');
      notify(`💡 ${step.waitPointInstructions || '请完成操作后再次运行 /confwrite:write 继续'}`, 'info');
      result.stoppedReason = 'wait_point';
      break;
    }

    notify(`📝 [${step.phase}] ${step.phaseName}: ${step.message}`, 'info');

    if (EXECUTABLE_ACTIONS.has(step.action)) {
      const dispatchResult = await dispatcher.dispatch(step.action, step.params || {});
      notify(`🚀 已创建 ${dispatchResult.tasksCreated} 个任务`, 'info');

      // 流式处理：每批任务完成后立即处理结果
      let batchCount = 0;
      notify(`🔄 开始执行任务批次...`, 'info');
      
      while (true) {
        notify(`📊 调用 runAll() 获取下一批任务...`, 'info');
        const batchResult = await runner.runAll();
        notify(`📊 runAll() 返回: executed=${batchResult.executed}, succeeded=${batchResult.succeeded}, failed=${batchResult.failed}`, 'info');
        
        if (batchResult.executed === 0) {
          notify(`✅ 没有更多任务，退出批次循环`, 'info');
          break; // 没有更多任务
        }
        
        batchCount++;
        result.tasksExecuted += batchResult.executed;
        result.tasksSucceeded += batchResult.succeeded;
        result.tasksFailed += batchResult.failed;
        
        notify(`📦 批次 ${batchCount} 完成: ${batchResult.succeeded} 成功, ${batchResult.failed} 失败 (总计: ${result.tasksSucceeded}/${dispatchResult.tasksCreated})`, 'info');

        // 检查熔断器
        if (runner.isCircuitBroken()) {
          notify(`⚡ 触发限流熔断，终止本轮。剩余任务将在下次运行时重试。`, 'warning');
          result.stoppedReason = 'circuit_breaker';
          result.completed = false;
          break;
        }

        // 立即处理这批任务的结果
        for (const taskResult of batchResult.tasks) {
          const outcome = taskResult.status === 'completed' ? 'success' : 'failed';
          const output = outcome === 'success' ? 'completed' : (taskResult.error || 'failed');
          
          // 即时验证输出
          if (outcome === 'success' && taskResult.chapterId) {
            const originalTask = scheduler.list().find(t => t.id === taskResult.id);
            if (originalTask) {
              // 从 task id 中提取 round (格式: write-ch001-r1)
              const roundMatch = originalTask.id.match(/-r(\d+)$/);
              const taskRound = roundMatch ? parseInt(roundMatch[1], 10) : state.round;
              const validation = outputValidator.validate(originalTask, taskRound);
              if (!validation.valid) {
                notify(`⚠️ ${OutputValidator.formatErrors(validation)}`, 'warning');
                // 验证失败，标记任务为 failed 以便重试
                await dispatcher.processTask(taskResult.id, 'failed', `Output validation failed: ${validation.errors.join('; ')}`);
                result.tasksFailed++;
                result.tasksSucceeded--; // 之前已经加了 succeeded，现在回退
                continue;
              }
              notify(`✅ 输出验证通过: ${originalTask.id}`, 'info');
            }
          }
          
          await dispatcher.processTask(taskResult.id, outcome as 'success' | 'failed', output);
        }
        
        // 熔断器触发时退出批次循环
        if (result.stoppedReason === 'circuit_breaker') break;
      }

      // 熔断后必须终止外层推进循环（Bug 1）
      //
      // 原实现只 break 了内层批次循环，外层 while 继续跑：
      // 派发任务 → 熔断立即失败 → 0 执行 → 再派发 → … 空转到 MAX_TICKS。
      // 实测：29 个任务竟消耗 2000 次 tick（约 1970 次空转）。
      if (result.stoppedReason === 'circuit_breaker') {
        break;
      }

      notify(`✅ 所有任务执行完成: ${result.tasksSucceeded} 成功, ${result.tasksFailed} 失败`, 'info');
    } else if (step.action === 'advance' || step.action === 'phase_entered') {
      continue;
    } else {
      // Non-dispatchable action (e.g. generate_diagrams, assemble) — already executed,
      // continue loop so next tick can check exit conditions and advance phase.
      continue;
    }
  }

  if (result.ticks >= MAX_TICKS) {
    // 仅在尚无终止原因时才归因于 tick 上限（Bug 2）
    //
    // 原实现无条件赋值，把 circuit_breaker 等真实原因覆盖成 'max_ticks'，
    // 导致调用方看到「推进次数用完」而实际是限流熔断或状态机死锁，
    // 完全误导排查方向。
    notify(`⚠️ 达到最大推进次数 (${MAX_TICKS})，请检查状态`, 'info');
    if (!result.stoppedReason) {
      result.stoppedReason = 'max_ticks';
    }
  }

  if (!result.stoppedReason) {
    result.stoppedReason = 'completed';
  }

  // 释放日志系统资源
  loggingSystem.dispose();

  return result;
}

/**
 * Herdr 集成：长时间运行时通知 herdr "我在忙"
 * 防止 herdr 误判为 idle 状态
 */
function herdrBlock(pi: ExtensionAPI, active: boolean, label?: string) {
  try {
    pi.events.emit('herdr:blocked', { active, label });
  } catch {
    // herdr 未安装时忽略
  }
}

export default function (pi: ExtensionAPI) {
  // ============ /confwrite:init ============
  pi.registerCommand('confwrite:init', {
    description: '初始化 ConfWrite 项目',
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify('用法: /confwrite:init <slug> [material-dir]', 'info');
        return;
      }

      const parts = args.split(/\s+/);
      const slug = parts[0];
      const materialDir = parts[1];
      const workspaceDir = ctx.cwd || process.cwd();

      try {
        const result = initProject({
          slug,
          workspaceDir,
          materialSourceDir: materialDir ? resolve(workspaceDir, materialDir) : undefined,
        });

        if (result.success) {
          ctx.ui.notify(result.message, 'info');
        } else {
          ctx.ui.notify(result.message, 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`初始化失败: ${msg}`, 'error');
      }
    },
  });

  // ============ /confwrite:organize ============
  pi.registerCommand('confwrite:organize', {
    description: '整理项目素材（扫描、索引、生成素材包）',
    handler: async (args, ctx) => {
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;

      try {
        ctx.ui.notify('开始整理素材...', 'info');
        
        const result = await organizeMaterials(projectDir);
        
        // 更新项目状态：从 0a 推进到 0b
        const store = new ProjectStore(projectDir);
        const state = store.load();
        if (state && state.currentPhase === '0a') {
          state.currentPhase = '0b';
          state.status = 'organizing';
          state.lastUpdated = new Date().toISOString();
          store.save(state);
        }
        
        const message = [
          '素材整理完成！',
          `扫描: ${result.scanStats.total} 个文件`,
          `转换: ${result.conversionStats.success}/${result.conversionStats.total} 成功`,
          `索引: ${result.indexData.totalFiles} 个文件, ${result.indexData.categories.length} 个分类`,
          `基线: ${Object.keys(result.baseline.metrics).length} 个指标`,
          `映射: ${result.chapterMappings.length} 个章节`,
          `素材包: ${result.kitStats.success}/${result.kitStats.total} 生成成功`,
        ].join('\n');
        
        ctx.ui.notify(message, 'info');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`素材整理失败: ${msg}`, 'error');
      }
    },
  });

  // ============ /confwrite:outline ============
  pi.registerCommand('confwrite:outline', {
    description: '自动生成大纲（基于模板和需求）',
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify('用法: /confwrite:outline <slug> <template> [targetWords]', 'info');
        ctx.ui.notify('模板: technical-proposal, bid-document', 'info');
        return;
      }

      const parts = args.split(/\s+/);
      const slug = parts[0];  // 第一个参数是项目 slug
      const template = parts[1];  // 第二个参数是模板
      const targetWords = parts[2] ? parseInt(parts[2], 10) : undefined;
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = resolve(workspaceDir, 'projects', slug);

      try {
        ctx.ui.notify('开始生成大纲...', 'info');
        
        const result = await outlineCommand({
          projectDir,
          template,
          targetWords,
        });

        if (result.success) {
          ctx.ui.notify(result.message, 'info');
        } else {
          ctx.ui.notify(`大纲生成失败: ${result.message}`, 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`大纲生成失败: ${msg}`, 'error');
      }
    },
  });

  // ============ /confwrite:write ============
  pi.registerCommand('confwrite:write', {
    description: '推进写作流程（自动执行任务）',
    handler: async (args, ctx) => {
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
      
      herdrBlock(pi, true, 'ConfWrite 写作中');
      try {
        await runWriteLoop(projectDir, (msg, level) => ctx.ui.notify(msg, level), {
          getContextTokens: () => {
            const usage = ctx.getContextUsage();
            return usage?.tokens ?? null;
          },
          triggerCompact: async () => {
            return new Promise<void>((resolve, reject) => {
              ctx.compact({
                customInstructions: '保留 ConfWrite 项目状态、章节进度和最近的关键操作',
                onComplete: () => resolve(),
                onError: (err) => reject(err),
              });
            });
          },
        });
      } finally {
        herdrBlock(pi, false);
      }
    },
  });

  // ============ /confwrite:status ============
  pi.registerCommand('confwrite:status', {
    description: '查看项目进度',
    handler: async (args, ctx) => {
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
      const machine = new StateMachine(projectDir);
      const status = machine.status();

      if (!status) {
        ctx.ui.notify('未找到项目状态文件', 'error');
        return;
      }

      const store = machine.getStore();
      const state = store.load();
      if (!state) return;

      const chapters = Object.values(state.chapters);
      const total = chapters.length;
      const completed = chapters.filter(ch => ch.status === 'completed').length;
      const failed = chapters.filter(ch => ch.status === 'failed').length;
      const writing = chapters.filter(ch => ['writing', 'reviewing', 'fixing'].includes(ch.status)).length;

      const version = getConfWriteVersion();
      let msg = `📦 ConfWrite v${version}\n`;
      msg += `📊 项目: ${state.project}\n`;
      msg += `阶段: ${status.phase} (${status.name})\n`;
      msg += `状态: ${status.status}\n`;
      msg += `章节: ${completed}/${total} 完成`;
      if (failed > 0) msg += `, ${failed} 失败`;
      if (writing > 0) msg += `, ${writing} 进行中`;
      msg += `\n轮次: ${state.round}`;

      ctx.ui.notify(msg, 'info');
    },
  });

  // ============ /confwrite:resume ============
  pi.registerCommand('confwrite:resume', {
    description: '恢复中断的项目（等同于 /confwrite:write）',
    handler: async (args, ctx) => {
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = args ? resolve(workspaceDir, 'projects', args) : workspaceDir;
      const machine = new StateMachine(projectDir);
      const status = machine.status();
      if (!status) {
        ctx.ui.notify('未找到项目状态文件', 'error');
        return;
      }

      ctx.ui.notify(`恢复项目: ${status.phase} (${status.name})`, 'info');
      
      herdrBlock(pi, true, 'ConfWrite 写作中');
      try {
        await runWriteLoop(projectDir, (msg, level) => ctx.ui.notify(msg, level), {
          getContextTokens: () => {
            const usage = ctx.getContextUsage();
            return usage?.tokens ?? null;
          },
          triggerCompact: async () => {
            return new Promise<void>((resolve, reject) => {
              ctx.compact({
                customInstructions: '保留 ConfWrite 项目状态、章节进度和最近的关键操作',
                onComplete: () => resolve(),
                onError: (err) => reject(err),
              });
            });
          },
        });
      } finally {
        herdrBlock(pi, false);
      }
    },
  });

  // ============ /confwrite:compact ============
  pi.registerCommand('confwrite:compact', {
    description: '手动压缩上下文（当自动压缩失败时使用）',
    handler: async (_args, ctx) => {
      const usage = ctx.getContextUsage();
      const tokens = usage?.tokens ?? 0;
      
      ctx.ui.notify(`当前上下文: ${tokens.toLocaleString()} tokens`, 'info');
      ctx.ui.notify('正在压缩上下文...', 'info');
      
      return new Promise<void>((resolve) => {
        ctx.compact({
          customInstructions: '保留 ConfWrite 项目状态、章节进度和最近的关键操作',
          onComplete: () => {
            ctx.ui.notify('✅ 上下文压缩完成', 'info');
            resolve();
          },
          onError: (err) => {
            ctx.ui.notify(`❌ 压缩失败: ${err.message}`, 'error');
            resolve();
          },
        });
      });
    },
  });

  // ============ /confwrite:export ============
  pi.registerCommand('confwrite:export', {
    description: '导出文档（md/html/docx）',
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify('用法: /confwrite:export <slug> <format> [output-path]', 'info');
        ctx.ui.notify('格式: md, html, docx', 'info');
        return;
      }

      const parts = args.split(/\s+/);
      const slug = parts[0];  // 第一个参数是项目 slug
      const format = parts[1] as 'md' | 'html' | 'docx';  // 第二个参数是格式
      const workspaceDir = ctx.cwd || process.cwd();
      const projectDir = resolve(workspaceDir, 'projects', slug);
      const outputPath = parts[2] || resolve(projectDir, `output/document.${format}`);

      try {
        ctx.ui.notify(`开始导出 ${format.toUpperCase()}...`, 'info');

        const result = await exportDocument(projectDir, {
          format,
          outputPath,
          toc: true,
        });

        if (result.success) {
          let message = `✅ 导出成功！\n输出: ${result.outputPath}`;
          if (result.stats) {
            message += `\n章节: ${result.stats.totalChapters}`;
            message += `\n字数: ${result.stats.totalWords}`;
            message += `\n字符: ${result.stats.totalCharacters}`;
          }
          if (result.warnings.length > 0) {
            message += `\n\n警告:\n${result.warnings.join('\n')}`;
          }
          ctx.ui.notify(message, 'info');
        } else {
          ctx.ui.notify(`导出失败: ${result.error}`, 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`导出失败: ${msg}`, 'error');
      }
    },
  });
}
