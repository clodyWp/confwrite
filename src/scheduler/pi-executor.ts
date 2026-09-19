/**
 * PiSubagentExecutor — 真实 pi subagent 执行器
 * 
 * 通过 createAgentSession 创建子会话执行任务。
 * 每个任务在独立的 in-memory 子会话中运行。
 * 
 * 关键模式（参考 pi-subagents SDK 文档）：
 * 1. createAgentSession() 不指定 model → 使用 pi 默认模型
 * 2. session.prompt() 发送任务并等待完整执行
 * 3. stopReason: 'stop' = 纯文本回复, 'toolUse' = 调用了工具（都算成功）
 * 4. stopReason: 'error' 或 errorMessage 存在 = 失败
 * 
 * 测试环境使用 MockSubagentExecutor。
 */
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import type { SubagentExecutor, ExecutorResult } from './executor.js';
import type { Task } from './types.js';

export interface PiExecutorOptions {
  projectDir: string;
  /** model spec: "provider/id". Omit to use pi default. */
  model?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  timeoutMs?: number;
  /** Tools to enable for the sub-agent */
  tools?: string[];
  /** 单任务 turn 硬上限。0 / undefined = 不限 */
  maxTurnsPerTask?: number;
  /** 启用详细日志 */
  verboseLog?: boolean;
}

/**
 * 解析给定平台应使用的 shell 工具。
 * Windows 用 powershell —— bash 在 Windows 上有路径转义问题。
 */
export function resolveShellTool(plat: string): string {
  return plat === 'win32' ? 'powershell' : 'bash';
}

/** 默认工具集：文件读写 + 当前平台 shell */
export const DEFAULT_TOOLS = ['read', 'write', 'edit', resolveShellTool(platform())];

// ============ Turn 硬预算 ============

/**
 * Turn 预算：与具体病理无关的兜底。
 * 工具最小权限消除了「字数校验」这一具体循环，但迭代不止这一种形态；
 * 预算保证无论模型出于什么理由反复折腾，都不会无限进行下去。
 */
export class TurnBudget {
  private count = 0;

  constructor(private readonly max?: number) {}

  /** 记录一次 turn 开始；返回 true 表示已超限、应中止 */
  tick(): boolean {
    this.count++;
    if (!this.max || this.max <= 0) return false;
    return this.count > this.max;
  }

  /** 已发生的 turn 数 */
  get turns(): number {
    return this.count;
  }

  /** 生效的上限；不限模式为 0 */
  get limit(): number {
    return this.max && this.max > 0 ? this.max : 0;
  }

  /** 是否已超出上限（不限模式恒为 false） */
  get exceeded(): boolean {
    return this.limit > 0 && this.count > this.limit;
  }
}

/**
 * 任务结果判定输入
 */
export interface OutcomeInput {
  hasAssistantMessage: boolean;
  budgetExhausted: boolean;
  turnCount: number;
  maxTurns: number;
  stopReason?: string;
  errorMessage?: string;
  textOutput?: string;
}

/**
 * 判定任务成败。
 *
 * 判定顺序至关重要：**预算中止必须最先判定**。因为 abort() 之后
 * stopReason 可能仍是 'stop'，若顺序写错，被中止的任务会被当成成功，
 * 预算就形同虚设。
 *
 * 顺序：预算中止 > 无响应 > LLM 错误 > 成功
 */
export function classifyOutcome(input: OutcomeInput): { success: boolean; output: string } {
  if (!input.hasAssistantMessage) {
    return { success: false, output: 'No assistant response received' };
  }
  if (input.budgetExhausted) {
    return {
      success: false,
      output: `Turn budget exhausted (${input.turnCount} > ${input.maxTurns})`,
    };
  }
  if (input.stopReason === 'error' || input.errorMessage) {
    return {
      success: false,
      output: `LLM error: ${input.errorMessage || 'Unknown error'} (stopReason: ${input.stopReason})`,
    };
  }
  return { success: true, output: input.textOutput ?? '' };
}

export class PiSubagentExecutor implements SubagentExecutor {
  private options: PiExecutorOptions;

  constructor(options: PiExecutorOptions) {
    this.options = options;
  }

  async execute(task: Task): Promise<ExecutorResult> {
    const start = Date.now();

    try {
      // Dynamic import — avoid loading heavy SDK in test environments
      const { createAgentSession, ModelRuntime, SessionManager } =
        await import('@earendil-works/pi-coding-agent');

      // 1. Build session options
      const tools = this.options.tools ?? DEFAULT_TOOLS;
      const sessionOpts: any = {
        sessionManager: SessionManager.inMemory(),
        cwd: this.options.projectDir,
        tools,
      };

      // 2. Resolve model if specified, otherwise use pi default
      if (this.options.model) {
        const modelRuntime = await ModelRuntime.create();
        const [provider, id] = this.options.model.split('/');
        const model = modelRuntime.getModel(provider, id);
        if (!model) {
          return {
            success: false,
            output: `Model not found: ${this.options.model}`,
            durationMs: Date.now() - start,
          };
        }
        sessionOpts.modelRuntime = modelRuntime;
        sessionOpts.model = model;
      }

      // 3. Create isolated in-memory session
      const { session } = await createAgentSession(sessionOpts);

      if (this.options.thinkingLevel) {
        session.setThinkingLevel(this.options.thinkingLevel);
      }

      // 4. Write task context to a file so the sub-agent can read it
      //    (avoids prompt-too-large issues with huge material kits)
      const taskContextPath = join(
        this.options.projectDir,
        '.confwrite-tasks',
        `${task.id}.md`,
      );
      mkdirSync(dirname(taskContextPath), { recursive: true });
      writeFileSync(taskContextPath, task.prompt, 'utf-8');

      // 5. Setup verbose logging
      const verboseLog = this.options.verboseLog ?? true;
      const logPath = join(this.options.projectDir, 'logs', `subagent-${task.id}.log`);
      if (verboseLog) {
        mkdirSync(dirname(logPath), { recursive: true });
        this.writeLog(logPath, `[${new Date().toISOString()}] Task started: ${task.id}\n`);
      }

      // 6. Subscribe to session events
      //    预算与计数位于 verboseLog 早退之前 —— 否则关闭日志时预算会静默失效。
      let turnCount = 0;
      let toolCallCount = 0;
      const budget = new TurnBudget(this.options.maxTurnsPerTask);
      let budgetExhausted = false;

      const unsubscribe = session.subscribe((event: any) => {
        // —— 始终生效：turn 计数 + 硬预算 ——
        if (event.type === 'turn_start') {
          turnCount++;
          if (budget.tick()) {
            budgetExhausted = true;
            void session.abort();
            if (verboseLog) {
              this.writeLog(
                logPath,
                `[${new Date().toISOString()}] [budget] turn ${turnCount} 超过上限 ${budget.limit}，中止\n`,
              );
            }
          }
        } else if (event.type === 'tool_execution_start') {
          toolCallCount++;
        }

        if (!verboseLog) return;
        
        const now = new Date().toISOString();
        
        switch (event.type) {
          case 'turn_start':
            this.writeLog(logPath, `[${now}] Turn #${turnCount} started\n`);
            break;
          case 'turn_end':
            // 记录 turn 结束时的工具结果
            if (event.toolResults && Array.isArray(event.toolResults)) {
              for (const result of event.toolResults) {
                const status = result.isError ? 'error' : 'success';
                const errorInfo = result.isError && result.content ? 
                  ` - ${JSON.stringify(result.content).substring(0, 200)}` : '';
                this.writeLog(logPath, `[${now}] Turn #${turnCount} tool result: ${result.toolName} (${status}${errorInfo})\n`);
              }
            }
            this.writeLog(logPath, `[${now}] Turn #${turnCount} ended\n`);
            break;
          case 'tool_execution_start':
            // 记录工具参数（截断）
            const args = event.args ? JSON.stringify(event.args).substring(0, 300) : '{}';
            this.writeLog(logPath, `[${now}] Tool #${toolCallCount}: ${event.toolName} started with args: ${args}\n`);
            break;
          case 'tool_execution_end':
            const endStatus = event.isError ? 'error' : 'success';
            // 如果是错误，记录错误信息
            const errorDetail = event.isError && event.result ? 
              ` - ${JSON.stringify(event.result).substring(0, 300)}` : '';
            this.writeLog(logPath, `[${now}] Tool #${toolCallCount}: ${event.toolName} ended (${endStatus}${errorDetail})\n`);
            break;
          case 'agent_start':
            this.writeLog(logPath, `[${now}] Agent started processing\n`);
            break;
          case 'agent_end':
            this.writeLog(logPath, `[${now}] Agent finished processing\n`);
            break;
        }
      });

      // 7. Send prompt — prompt() resolves only after full run finishes
      const userPrompt = [
        `Read the task file at: ${taskContextPath}`,
        `Execute the task described in that file.`,
        `Write all output files as specified in the task.`,
        `When done, provide a brief summary of what you produced.`,
      ].join('\n');

      if (verboseLog) {
        this.writeLog(logPath, `[${new Date().toISOString()}] Sending prompt to LLM...\n`);
      }

      await session.prompt(userPrompt);

      // 8. Cleanup subscription
      unsubscribe();

      if (verboseLog) {
        this.writeLog(logPath, `[${new Date().toISOString()}] Task completed. Turns: ${turnCount}, Tool calls: ${toolCallCount}, Duration: ${Date.now() - start}ms\n`);
      }

      // 9. 提取输出并判定结果
      //    判定顺序（预算优先）由 classifyOutcome 集中处理并单测覆盖
      const assistantMsg = session.messages.filter(m => m.role === 'assistant').pop();

      const verdict = classifyOutcome({
        hasAssistantMessage: !!assistantMsg,
        budgetExhausted,
        turnCount,
        maxTurns: budget.limit,
        stopReason: assistantMsg ? (assistantMsg as any).stopReason : undefined,
        errorMessage: assistantMsg ? (assistantMsg as any).errorMessage : undefined,
        textOutput: assistantMsg ? this.extractOutput(assistantMsg) : undefined,
      });

      // 10. Cleanup
      session.dispose();

      return {
        success: verdict.success,
        output: verdict.output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: `Execution failed: ${errorMsg}`,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Write log entry to file
   */
  private writeLog(logPath: string, message: string): void {
    try {
      appendFileSync(logPath, message, 'utf-8');
    } catch {
      // Silently ignore log write errors
    }
  }

  /**
   * Extract text output from an assistant message.
   */
  private extractOutput(msg: any): string {
    if (!msg.content) return '';
    if (!Array.isArray(msg.content)) return String(msg.content);

    const textParts = msg.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text);

    return textParts.join('\n');
  }
}
