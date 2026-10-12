import { describe, it, expect, vi, afterEach } from 'vitest';
import { LoggingSystem } from '../../src/logging/index.js';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskStartEvent, TaskCompleteEvent, TaskFailEvent } from '../../src/logging/types.js';

describe('LOG-1: 日志写入必须是原子操作', () => {
  const testDir = join(process.cwd(), 'test-logs-atomic');

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('写入后没有 .tmp 文件残留', () => {
    const notifyMock = vi.fn();
    const loggingSystem = new LoggingSystem(notifyMock, {
      enabled: true,
      projectDir: testDir,
      filename: 'test.jsonl',
    });

    const event: TaskStartEvent = {
      type: 'task.start',
      taskId: 'write-ch001-r1',
      taskType: 'writer',
      chapterId: 'ch001',
      round: 1,
      concurrency: { current: 1, max: 3 },
    };

    loggingSystem.eventBus.emit(event);

    // 验证：没有 .tmp 文件残留
    const tmpPath = join(testDir, 'logs', 'test.jsonl.tmp');
    expect(existsSync(tmpPath)).toBe(false);

    // 验证：日志文件存在且完整
    const logPath = join(testDir, 'logs', 'test.jsonl');
    expect(existsSync(logPath)).toBe(true);

    loggingSystem.dispose();
  });

  it('日志文件不为 0 字节（崩溃恢复）', () => {
    const notifyMock = vi.fn();
    const loggingSystem = new LoggingSystem(notifyMock, {
      enabled: true,
      projectDir: testDir,
      filename: 'test.jsonl',
    });

    // 写入多个事件
    const events: TaskStartEvent[] = [
      {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      },
      {
        type: 'task.start',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        round: 1,
        concurrency: { current: 2, max: 3 },
      },
    ];

    for (const event of events) {
      loggingSystem.eventBus.emit(event);
    }

    loggingSystem.dispose();

    // 验证：日志文件不为 0 字节
    const logPath = join(testDir, 'logs', 'test.jsonl');
    expect(existsSync(logPath)).toBe(true);
    const stats = statSync(logPath);
    expect(stats.size).toBeGreaterThan(0);

    // 验证：日志内容是有效 JSONL（每行一个 JSON）
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    
    // 每行都是有效的 JSON
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('event');
    }
  });

  it('并发写入安全：所有事件都被记录', () => {
    const notifyMock = vi.fn();
    const loggingSystem = new LoggingSystem(notifyMock, {
      enabled: true,
      projectDir: testDir,
      filename: 'test.jsonl',
    });

    // 快速 emit 多个事件
    const eventCount = 10;
    for (let i = 0; i < eventCount; i++) {
      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: `write-ch${String(i).padStart(3, '0')}-r1`,
        taskType: 'writer',
        chapterId: `ch${String(i).padStart(3, '0')}`,
        round: 1,
        concurrency: { current: 1, max: 3 },
      };
      loggingSystem.eventBus.emit(event);
    }

    loggingSystem.dispose();

    // 验证：所有事件都被记录
    const logPath = join(testDir, 'logs', 'test.jsonl');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(eventCount);
  });

  it('dispose 后日志文件完整', () => {
    const notifyMock = vi.fn();
    const loggingSystem = new LoggingSystem(notifyMock, {
      enabled: true,
      projectDir: testDir,
      filename: 'test.jsonl',
    });

    const startEvent: TaskStartEvent = {
      type: 'task.start',
      taskId: 'write-ch001-r1',
      taskType: 'writer',
      chapterId: 'ch001',
      round: 1,
      concurrency: { current: 1, max: 3 },
    };

    const completeEvent: TaskCompleteEvent = {
      type: 'task.complete',
      taskId: 'write-ch001-r1',
      taskType: 'writer',
      chapterId: 'ch001',
      duration: 45200,
    };

    loggingSystem.eventBus.emit(startEvent);
    loggingSystem.eventBus.emit(completeEvent);
    loggingSystem.dispose();

    // 验证：日志文件完整
    const logPath = join(testDir, 'logs', 'test.jsonl');
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);

    // 验证：没有临时文件
    const tmpPath = logPath + '.tmp';
    expect(existsSync(tmpPath)).toBe(false);
  });
});
