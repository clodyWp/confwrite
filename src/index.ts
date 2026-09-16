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
import { resolve } from 'node:path';

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
    description: '推进写作流程（执行状态机一步）',
    handler: async (args, ctx) => {
      const projectDir = args ? resolve(ctx.cwd || process.cwd(), args) : ctx.cwd || process.cwd();
      const machine = new StateMachine(projectDir);

      const result = await machine.tick();

      if ('blocked' in result && result.blocked) {
        ctx.ui.notify(`⛔ ${result.phaseName}: ${result.error}`, 'error');
        return;
      }

      const step = result as { phase: string; phaseName: string; action: string; message: string; params?: Record<string, unknown>; advanced: boolean; previousPhase?: string };

      if (step.advanced) {
        ctx.ui.notify(`⏩ ${step.previousPhase} → ${step.phase} (${step.phaseName})`, 'info');
      }

      ctx.ui.notify(`📝 [${step.phase}] ${step.phaseName}: ${step.message}`, 'info');

      if (step.action !== 'advance' && step.action !== 'wait_user_review' && step.action !== 'phase_entered') {
        const actionJson = JSON.stringify({ action: step.action, params: step.params }, null, 2);
        ctx.ui.notify(`待执行:\n${actionJson}`, 'info');
      }
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

      // Delegate to write logic
      const result = await machine.tick();

      if ('blocked' in result && result.blocked) {
        ctx.ui.notify(`⛔ ${result.phaseName}: ${result.error}`, 'error');
        return;
      }

      const step = result as { phase: string; phaseName: string; action: string; message: string; params?: Record<string, unknown>; advanced: boolean; previousPhase?: string };

      if (step.advanced) {
        ctx.ui.notify(`⏩ ${step.previousPhase} → ${step.phase} (${step.phaseName})`, 'info');
      }

      ctx.ui.notify(`📝 [${step.phase}] ${step.phaseName}: ${step.message}`, 'info');
    },
  });

  // ============ /confwrite:export ============
  pi.registerCommand('confwrite:export', {
    description: '导出文档（md/html/docx/pdf）',
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify('用法: /confwrite:export <format> [output-path]', 'info');
        ctx.ui.notify('格式: md, html, docx, pdf', 'info');
        return;
      }

      const parts = args.split(/\s+/);
      const format = parts[0] as 'md' | 'html' | 'docx' | 'pdf';
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
