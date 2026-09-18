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
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
}

const DEFAULT_TOOLS = ['read', 'write', 'edit', 'powershell'];

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

      // 5. Send prompt — prompt() resolves only after full run finishes
      const userPrompt = [
        `Read the task file at: ${taskContextPath}`,
        `Execute the task described in that file.`,
        `Write all output files as specified in the task.`,
        `When done, provide a brief summary of what you produced.`,
      ].join('\n');

      await session.prompt(userPrompt);

      // 6. Extract output and check result
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

      // 7. Cleanup
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
