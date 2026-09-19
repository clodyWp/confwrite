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
 * 工具最小权限（feat/tool-least-privilege）：
 * writer/fixer 不获得 shell。原因：shell 提供了「统计字数」这一廉价
 * 测量手段，而测量手段是病理性校验循环（measure→adjust→measure→…）
 * 得以自持的必要条件。移除它，循环在物理上无法成立。
 * reviewer 保留 shell —— 度量篇幅本就是它的职责。
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
  /** 显式覆盖工具集（优先于角色最小权限表，用作逃生口/测试） */
  tools?: string[];
  /** 启用详细日志 */
  verboseLog?: boolean;
}

// ============ 工具最小权限 ============

/**
 * 所有角色的基础能力。
 * 不含 shell —— 这是刻意的：任何需要 shell 的角色必须显式声明。
 */
export const BASE_TOOLS: string[] = ['read', 'write', 'edit'];

/** 按操作系统解析 shell 工具名 */
export function resolveShellTool(plat: string = platform()): 'bash' | 'powershell' {
  return plat === 'win32' ? 'powershell' : 'bash';
}

/**
 * 角色 → 工具集。
 * 仅 reviewer 拥有 shell；researcher/planner/diagram 尚未实现，
 * 先按最小权限给出，避免默认获得测量手段。
 */
function buildToolsByRole(shell: string): Record<string, string[]> {
  return {
    writer: [...BASE_TOOLS],
    fixer: [...BASE_TOOLS],
    reviewer: ['read', 'write', shell],
    researcher: [...BASE_TOOLS],
    planner: [...BASE_TOOLS],
    diagram: [...BASE_TOOLS],
  };
}

/**
 * 解析某任务类型应获得的工具集。
 *
 * 优先级：override > 角色表 > BASE_TOOLS（fail-safe 最小权限）
 * 未识别类型回退到 BASE_TOOLS 而非含 shell 的集合 —— 默认可失败
 * 但要失败在「权限更小」一侧。
 */
export function resolveToolsForTask(
  taskType: string,
  options?: { platform?: string; override?: string[] },
): string[] {
  if (options?.override && options.override.length > 0) {
    return [...options.override];
  }
  const shell = resolveShellTool(options?.platform ?? platform());
  const table = buildToolsByRole(shell);
  return [...(table[taskType] ?? BASE_TOOLS)];
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
      //    工具按角色最小权限解析（writer/fixer 无 shell，reviewer 有）
      const tools = resolveToolsForTask(task.type, { override: this.options.tools });
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

      // 6. Subscribe to session events for detailed logging
      let turnCount = 0;
      let toolCallCount = 0;
      const unsubscribe = session.subscribe((event: any) => {
        if (!verboseLog) return;
        
        const now = new Date().toISOString();
        
        switch (event.type) {
          case 'turn_start':
            turnCount++;
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
            toolCallCount++;
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

      // 9. Extract output and check result
      const assistantMsg = session.messages.filter(m => m.role === 'assistant').pop();
      
      if (!assistantMsg) {
        session.dispose();
        return {
          success: false,
          output: 'No assistant response received',
          durationMs: Date.now() - start,
        };
      }

      // Check for errors
      // stopReason: 'stop' = text reply, 'toolUse' = called tools (both OK)
      // stopReason: 'error' or errorMessage present = failure
      const stopReason = (assistantMsg as any).stopReason;
      const errorMessage = (assistantMsg as any).errorMessage;
      
      if (stopReason === 'error' || errorMessage) {
        session.dispose();
        return {
          success: false,
          output: `LLM error: ${errorMessage || 'Unknown error'} (stopReason: ${stopReason})`,
          durationMs: Date.now() - start,
        };
      }

      // Extract text output (may be empty if LLM only used tools)
      const output = this.extractOutput(assistantMsg);

      // 10. Cleanup
      session.dispose();

      return {
        success: true,
        output,
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
