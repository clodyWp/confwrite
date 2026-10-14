/**
 * PiSubagentExecutor SDK 交互测试
 *
 * 覆盖 spec: specs/pi-executor-sdk.md
 * 关联 Issue: #89
 *
 * 验证 PiSubagentExecutor 与 pi-coding-agent SDK 的交互行为，
 * 包括正常路径、错误路径和边界条件。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock SDK module — 每个测试通过修改 mockSDK 的内部状态模拟不同场景
const mockSession = {
  prompt: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockReturnValue(vi.fn()), // returns unsubscribe
  dispose: vi.fn(),
  abort: vi.fn(),
  setThinkingLevel: vi.fn(),
  messages: [
    {
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'Task completed successfully' }],
    },
  ],
};

const mockModelRuntime = {
  getModel: vi.fn().mockReturnValue({ id: 'test-model' }),
};

const mockSDK = {
  createAgentSession: vi.fn().mockResolvedValue({ session: mockSession }),
  ModelRuntime: { create: vi.fn().mockResolvedValue(mockModelRuntime) },
  SessionManager: { inMemory: vi.fn().mockReturnValue({}) },
};

vi.mock('@earendil-works/pi-coding-agent', () => mockSDK);

// Import after mock setup
import { PiSubagentExecutor, DEFAULT_TOOLS } from '../../src/scheduler/pi-executor.js';
import type { Task } from '../../src/scheduler/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-pi-executor-sdk-'));
}

function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    type: 'writer',
    status: 'pending',
    priority: 1,
    sequence: 1,
    attempt: 0,
    prompt: 'Write chapter 1 about project overview.',
    dependencies: [],
    ...overrides,
  };
}

/** Reset all mocks to default success state */
function resetMocks(): void {
  mockSession.prompt.mockReset();
  mockSession.prompt.mockResolvedValue(undefined);
  mockSession.subscribe.mockReset();
  mockSession.subscribe.mockReturnValue(vi.fn());
  mockSession.dispose.mockReset();
  mockSession.abort.mockReset();
  mockSession.setThinkingLevel.mockReset();
  mockSession.messages = [
    {
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'Task completed successfully' }],
    },
  ];
  mockModelRuntime.getModel.mockReset();
  mockModelRuntime.getModel.mockReturnValue({ id: 'test-model' });
  mockModelRuntime.getModel.mockClear;
  mockSDK.createAgentSession.mockReset();
  mockSDK.createAgentSession.mockResolvedValue({ session: mockSession });
  mockSDK.ModelRuntime.create.mockReset();
  mockSDK.ModelRuntime.create.mockResolvedValue(mockModelRuntime);
  mockSDK.SessionManager.inMemory.mockReset();
  mockSDK.SessionManager.inMemory.mockReturnValue({});
}

describe('PiSubagentExecutor SDK', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = tempDir;
    resetMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('SDK 正常路径', () => {
    it('INV-PE-3: 正常执行返回成功', async () => {
      // Arrange
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(true);
      expect(result.output).toContain('Task completed successfully');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockSession.dispose).toHaveBeenCalled();
    });

    it('INV-PE-8: 任务上下文文件写入', async () => {
      // Arrange
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask({ id: 'ctx-test-1', prompt: 'Write the overview chapter.' });

      // Act
      await executor.execute(task);

      // Assert — 文件存在且内容正确
      const taskFilePath = join(projectDir, '.confwrite-tasks', 'ctx-test-1.md');
      expect(existsSync(taskFilePath)).toBe(true);
      const content = readFileSync(taskFilePath, 'utf-8');
      expect(content).toBe('Write the overview chapter.');
    });

    it('INV-PE-9: thinkingLevel 设置', async () => {
      // Arrange — 指定 thinkingLevel
      const executor = new PiSubagentExecutor({ projectDir, thinkingLevel: 'high' });
      const task = createTestTask();

      // Act
      await executor.execute(task);

      // Assert — setThinkingLevel 被调用恰好一次
      expect(mockSession.setThinkingLevel).toHaveBeenCalledWith('high');
      expect(mockSession.setThinkingLevel).toHaveBeenCalledTimes(1);
    });

    it('INV-PE-9: 未指定 thinkingLevel 时不调用 setThinkingLevel', async () => {
      // Arrange — 不指定 thinkingLevel
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      await executor.execute(task);

      // Assert — setThinkingLevel 不被调用
      expect(mockSession.setThinkingLevel).not.toHaveBeenCalled();
    });

    it('INV-PE-10: 事件订阅与取消订阅', async () => {
      // Arrange
      const mockUnsubscribe = vi.fn();
      mockSession.subscribe.mockReturnValue(mockUnsubscribe);
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      await executor.execute(task);

      // Assert — subscribe 被调用，unsubscribe 也被调用
      expect(mockSession.subscribe).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
      expect(mockSession.dispose).toHaveBeenCalledTimes(1);
    });

    it('INV-PE-11: 默认工具集解析', async () => {
      // Arrange — 不指定 tools
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      await executor.execute(task);

      // Assert — createAgentSession 收到 DEFAULT_TOOLS
      expect(mockSDK.createAgentSession).toHaveBeenCalledTimes(1);
      const callArgs = mockSDK.createAgentSession.mock.calls[0][0];
      expect(callArgs.tools).toEqual(DEFAULT_TOOLS);
    });

    it('INV-PE-11: 自定义工具集', async () => {
      // Arrange — 指定自定义 tools
      const customTools = ['read', 'write'];
      const executor = new PiSubagentExecutor({ projectDir, tools: customTools });
      const task = createTestTask();

      // Act
      await executor.execute(task);

      // Assert — createAgentSession 收到自定义 tools
      const callArgs = mockSDK.createAgentSession.mock.calls[0][0];
      expect(callArgs.tools).toEqual(customTools);
    });
  });

  describe('SDK 错误路径', () => {
    it('INV-PE-4: session.prompt() 抛出异常', async () => {
      // Arrange
      mockSession.prompt.mockRejectedValue(new Error('Network timeout'));
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert — 返回结构化错误，不抛异常
      expect(result.success).toBe(false);
      expect(result.output).toContain('Execution failed:');
      expect(result.output).toContain('Network timeout');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('INV-PE-5: createAgentSession 抛出异常', async () => {
      // Arrange
      mockSDK.createAgentSession.mockRejectedValue(new Error('Authentication failed'));
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert — 返回结构化错误，不抛异常
      expect(result.success).toBe(false);
      expect(result.output).toContain('Execution failed:');
      expect(result.output).toContain('Authentication failed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('INV-PE-6: 无 assistant 消息', async () => {
      // Arrange — session.messages 为空
      mockSession.messages = [];
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(false);
      expect(result.output).toContain('No assistant response received');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // session.dispose() 仍被调用
      expect(mockSession.dispose).toHaveBeenCalled();
    });

    it('INV-PE-7: LLM 错误 — stopReason 为 error', async () => {
      // Arrange — assistant 消息含错误
      mockSession.messages = [
        {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: 'rate limited',
          content: [{ type: 'text', text: '' }],
        },
      ];
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(false);
      expect(result.output).toContain('LLM error');
      expect(result.output).toContain('rate limited');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('INV-PE-2: 模型解析失败', async () => {
      // Arrange — 指定无效模型
      mockModelRuntime.getModel.mockReturnValue(undefined);
      const executor = new PiSubagentExecutor({
        projectDir,
        model: 'invalid-provider/invalid-model',
      });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(false);
      expect(result.output).toBe('Model not found: invalid-provider/invalid-model');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // createAgentSession 不应被调用
      expect(mockSDK.createAgentSession).not.toHaveBeenCalled();
    });
  });

  describe('输出提取', () => {
    it('INV-PE-12: 多 content 块提取', async () => {
      // Arrange — assistant 消息含多个 text 块
      mockSession.messages = [
        {
          role: 'assistant',
          stopReason: 'stop',
          content: [
            { type: 'text', text: 'First part of output.' },
            { type: 'tool_use', id: 'tool1', name: 'write', input: {} },
            { type: 'text', text: 'Second part of output.' },
          ],
        },
      ];
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert — 只提取 text 类型的块，以 \n 拼接
      expect(result.success).toBe(true);
      expect(result.output).toContain('First part of output.');
      expect(result.output).toContain('Second part of output.');
      // 非 text 块被忽略
      expect(result.output).not.toContain('tool_use');
    });

    it('INV-PE-12: content 为字符串时直接返回', async () => {
      // Arrange
      mockSession.messages = [
        {
          role: 'assistant',
          stopReason: 'stop',
          content: 'Simple string output',
        },
      ];
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(true);
      expect(result.output).toBe('Simple string output');
    });

    it('INV-PE-12: content 为 undefined 时返回空字符串', async () => {
      // Arrange
      mockSession.messages = [
        {
          role: 'assistant',
          stopReason: 'stop',
          content: undefined,
        },
      ];
      const executor = new PiSubagentExecutor({ projectDir });
      const task = createTestTask();

      // Act
      const result = await executor.execute(task);

      // Assert
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });
});
