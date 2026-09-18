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
import { StateMachine } from './orchestrator/state-machine.js';
import { SubagentScheduler } from './scheduler/index.js';
import { SchedulerRunner } from './scheduler/runner.js';
import { PiSubagentExecutor } from './scheduler/pi-executor.js';
import type { SubagentExecutor } from './scheduler/executor.js';
import { DEFAULT_SCHEDULER_CONFIG, type SchedulerConfig } from './state/schema.js';
import { Dispatcher } from './dispatcher/index.js';
import { TaskExecutor } from './writing/task-executor.js';
import { WritingOrchestrator } from './writing/orchestrator.js';
import { OutputValidator } from './writing/output-validator.js';
import { ProjectStore } from './state/store.js';
import { LoggingSystem } from './logging/index.js';
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
  
  // 初始化日志系统
  const loggingSystem = new LoggingSystem(notify);
  
  const scheduler = new SubagentScheduler(config);
  const executor = executorOverride ?? new PiSubagentExecutor({ projectDir });
  const runner = new SchedulerRunner(
    scheduler,
    executor,
    config.maxConcurrency,
    config.rateLimitWindowMs,
    config.rateLimitMaxTasks,
    config.rateLimitDelayMs,
    config.maxTaskRetries,
    loggingSystem.eventBus, // 传递 EventBus
  );
  const taskExecutor = new TaskExecutor();
  const writingOrchestrator = new WritingOrchestrator();
  const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);
  const outputValidator = new OutputValidator(projectDir);

  const EXECUTABLE_ACTIONS = new Set(['spawn_writers', 'spawn_reviewers', 'spawn_fixers']);
  const MAX_TICKS = 200;  // 增加到 200，支持更多章节

  while (result.ticks < MAX_TICKS) {
    result.ticks++;

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
              const validation = outputValidator.validate(originalTask, state.round);
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
        
        // 熔断器触发时退出循环
        if (result.stoppedReason === 'circuit_breaker') break;
      }
      
      if (result.stoppedReason !== 'circuit_breaker') {
        notify(`✅ 所有任务执行完成: ${result.tasksSucceeded} 成功, ${result.tasksFailed} 失败`, 'info');
      }
    } else if (step.action === 'advance' || step.action === 'phase_entered') {
      continue;
    } else {
      // Non-dispatchable action (e.g. generate_diagrams, assemble) — already executed,
      // continue loop so next tick can check exit conditions and advance phase.
      continue;
    }
  }

  if (result.ticks >= MAX_TICKS) {
    notify(`⚠️ 达到最大推进次数 (${MAX_TICKS})，请检查状态`, 'info');
    result.stoppedReason = 'max_ticks';
  }

  if (!result.stoppedReason) {
    result.stoppedReason = 'completed';
  }

  // 释放日志系统资源
  loggingSystem.dispose();

  return result;
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
      const projectDir = args ? resolve(ctx.cwd || process.cwd(), args) : ctx.cwd || process.cwd();

      try {
        ctx.ui.notify('开始整理素材...', 'info');
        
        const result = await organizeMaterials(projectDir);
        
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

  // ============ /confwrite:write ============
  pi.registerCommand('confwrite:write', {
    description: '推进写作流程（自动执行任务）',
    handler: async (args, ctx) => {
      const projectDir = args ? resolve(ctx.cwd || process.cwd(), args) : ctx.cwd || process.cwd();
      
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
    },
  });

  // ============ /confwrite:status ============
  pi.registerCommand('confwrite:status', {
    description: '查看项目进度',
    handler: async (args, ctx) => {
      const projectDir = args ? resolve(ctx.cwd || process.cwd(), args) : ctx.cwd || process.cwd();
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

      let msg = `📊 项目: ${state.project}\n`;
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
      const projectDir = args ? resolve(ctx.cwd || process.cwd(), args) : ctx.cwd || process.cwd();
      const machine = new StateMachine(projectDir);
      const status = machine.status();
      if (!status) {
        ctx.ui.notify('未找到项目状态文件', 'error');
        return;
      }

      ctx.ui.notify(`恢复项目: ${status.phase} (${status.name})`, 'info');
      
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
        ctx.ui.notify('用法: /confwrite:export <format> [output-path]', 'info');
        ctx.ui.notify('格式: md, html, docx', 'info');
        return;
      }

      const parts = args.split(/\s+/);
      const format = parts[0] as 'md' | 'html' | 'docx';
      const projectDir = ctx.cwd || process.cwd();
      const outputPath = parts[1] || resolve(projectDir, `output/document.${format}`);

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
