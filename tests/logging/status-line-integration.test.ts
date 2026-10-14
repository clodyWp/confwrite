/**
 * Integration tests for LoggingSystem + StatusLineRenderer
 * 
 * Tests from specs/tui-status-line.md §9.2:
 * - TUI-INT-1: emit task.start 后 statusLine 反映活跃任务
 * - TUI-INT-2: emit phase.transition 后 statusLine 反映新 Phase
 * - TUI-INT-3: emit diag 事件不更新 logBuffer
 * - TUI-INT-4: emit 多行格式化事件后 logBuffer 只有首行
 * - TUI-INT-5: Logger.format() 输出不受 statusLine 影响
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LoggingSystem } from '../../src/logging/index.js';
import { Logger } from '../../src/logging/logger.js';
import type { LogEvent } from '../../src/logging/types.js';

describe('LoggingSystem + StatusLineRenderer integration', () => {
  let loggingSystem: LoggingSystem;
  let messages: string[];

  beforeEach(() => {
    messages = [];
    loggingSystem = new LoggingSystem((msg) => {
      messages.push(msg);
    });
  });

  afterEach(() => {
    loggingSystem.dispose();
  });

  it('TUI-INT-1: emit task.start 后 statusLine 反映活跃任务', () => {
    const event: LogEvent = {
      type: 'task.start',
      taskId: 'task-1',
      taskType: 'writer',
      chapterId: 'ch-03',
      round: 1,
      concurrency: { current: 2, max: 4 },
    };

    loggingSystem.eventBus.emit(event);

    const statusLine = loggingSystem.statusLine.render();
    expect(statusLine).toContain('ch-03');
    expect(statusLine).toContain('writer');
  });

  it('TUI-INT-2: emit phase.transition 后 statusLine 反映新 Phase', () => {
    const event: LogEvent = {
      type: 'phase.transition',
      from: '3',
      to: '4a',
      phaseName: '写作',
      reason: '素材准备完成',
    };

    loggingSystem.eventBus.emit(event);

    const statusLine = loggingSystem.statusLine.render();
    expect(statusLine).toContain('4a');
    expect(statusLine).toContain('写作');
  });

  it('TUI-INT-3: emit diag 事件不更新 logBuffer', () => {
    // First emit a normal event
    const normalEvent: LogEvent = {
      type: 'task.start',
      taskId: 'task-1',
      taskType: 'writer',
      chapterId: 'ch-01',
      round: 1,
      concurrency: { current: 1, max: 4 },
    };
    loggingSystem.eventBus.emit(normalEvent);

    const statusBefore = loggingSystem.statusLine.render();

    // Then emit a diag event
    const diagEvent: LogEvent = {
      type: 'diag.wordbudget',
      chapterId: 'ch-01',
      wordBudget: { min: 1000, max: 2000 },
      source: 'test',
      timestamp: new Date().toISOString(),
    };
    loggingSystem.eventBus.emit(diagEvent);

    const statusAfter = loggingSystem.statusLine.render();

    // Status line should not have changed (diag events don't update logBuffer)
    expect(statusAfter).toBe(statusBefore);
  });

  it('TUI-INT-4: emit 多行格式化事件后 logBuffer 只有首行', () => {
    // phase.transition produces multi-line output from Logger.format()
    const event: LogEvent = {
      type: 'phase.transition',
      from: '3',
      to: '4a',
      phaseName: '写作',
      reason: '素材准备完成',
      stats: { completedChapters: 3, failedChapters: 1 },
    };

    loggingSystem.eventBus.emit(event);

    const statusLine = loggingSystem.statusLine.render();
    // Status line must be single line
    expect(statusLine).not.toContain('\n');
    // Should contain first line content
    expect(statusLine).toContain('4a');
  });

  it('TUI-INT-5: Logger.format() 输出不受 statusLine 影响', () => {
    const event: LogEvent = {
      type: 'task.start',
      taskId: 'task-1',
      taskType: 'writer',
      chapterId: 'ch-03',
      round: 1,
      concurrency: { current: 2, max: 4 },
    };

    // Logger.format should produce the same output regardless of statusLine
    const formatResult = Logger.format(event);
    expect(formatResult.message).toContain('ch-03');
    expect(formatResult.message).toContain('Writer');
    // Logger.format output should NOT contain status line prefix
    expect(formatResult.message).not.toMatch(/\[.{2,4}\].*│/);
  });

  it('task.complete 后从活跃任务中移除', () => {
    // Start a task
    loggingSystem.eventBus.emit({
      type: 'task.start',
      taskId: 'task-1',
      taskType: 'writer',
      chapterId: 'ch-03',
      round: 1,
      concurrency: { current: 1, max: 4 },
    });

    let statusLine = loggingSystem.statusLine.render();
    expect(statusLine).toContain('ch-03');

    // Complete the task
    loggingSystem.eventBus.emit({
      type: 'task.complete',
      taskId: 'task-1',
      taskType: 'writer',
      chapterId: 'ch-03',
      duration: 45200,
    });

    statusLine = loggingSystem.statusLine.render();
    // Task should be removed, showing wait state
    expect(statusLine).toContain('⏳');
  });

  it('task.fail with willRetry=false 后从活跃任务中移除', () => {
    loggingSystem.eventBus.emit({
      type: 'task.start',
      taskId: 'task-1',
      taskType: 'reviewer',
      chapterId: 'ch-01',
      round: 1,
      concurrency: { current: 1, max: 4 },
    });

    loggingSystem.eventBus.emit({
      type: 'task.fail',
      taskId: 'task-1',
      taskType: 'reviewer',
      chapterId: 'ch-01',
      error: 'LLM timeout',
      willRetry: false,
    });

    const statusLine = loggingSystem.statusLine.render();
    expect(statusLine).toContain('⏳');
  });
});
