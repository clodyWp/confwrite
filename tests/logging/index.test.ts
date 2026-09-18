import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggingSystem } from '../../src/logging/index.js';
import type { TaskStartEvent, TaskCompleteEvent, TaskFailEvent } from '../../src/logging/types.js';

describe('LoggingSystem', () => {
  let loggingSystem: LoggingSystem;
  let notifyMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notifyMock = vi.fn();
    loggingSystem = new LoggingSystem(notifyMock);
  });

  describe('initialization', () => {
    it('should create event bus and stats collector', () => {
      expect(loggingSystem.eventBus).toBeDefined();
      expect(loggingSystem.stats).toBeDefined();
    });

    it('should subscribe to all events', () => {
      const taskStartEvent: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      loggingSystem.eventBus.emit(taskStartEvent);

      expect(notifyMock).toHaveBeenCalled();
      expect(notifyMock.mock.calls[0][0]).toContain('Writer');
      expect(notifyMock.mock.calls[0][0]).toContain('ch001');
    });
  });

  describe('task event handling', () => {
    it('should format and notify task.start event', () => {
      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 2, max: 3 },
      };

      loggingSystem.eventBus.emit(event);

      expect(notifyMock).toHaveBeenCalledTimes(1);
      const message = notifyMock.mock.calls[0][0];
      expect(message).toContain('Writer');
      expect(message).toContain('ch001');
      expect(message).toContain('2/3');
    });

    it('should format and notify task.complete event', () => {
      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 45200,
        fileSize: 12600,
      };

      loggingSystem.eventBus.emit(event);

      expect(notifyMock).toHaveBeenCalledTimes(1);
      const message = notifyMock.mock.calls[0][0];
      expect(message).toContain('ch001');
      expect(message).toContain('45.2s');
      expect(message).toContain('12.3KB');
    });

    it('should format and notify task.fail event', () => {
      const event: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        error: 'Network error',
        willRetry: false,
      };

      loggingSystem.eventBus.emit(event);

      expect(notifyMock).toHaveBeenCalledTimes(1);
      const message = notifyMock.mock.calls[0][0];
      expect(message).toContain('ch001');
      expect(message).toContain('Network error');
    });

    it('should update stats on task events', () => {
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

      const stats = loggingSystem.stats.getStats();
      expect(stats.succeeded).toBe(1);
      expect(stats.avgDuration).toBe(45200);
    });
  });

  describe('getProgressReport', () => {
    it('should return formatted progress report', () => {
      loggingSystem.stats.setCurrentPhase('4a');
      loggingSystem.stats.setChapterProgress({
        total: 84,
        completed: 45,
        failed: 0,
        pending: 39,
      });

      const report = loggingSystem.getProgressReport();

      expect(report).toContain('4a');
      expect(report).toContain('45/84');
      expect(report).toContain('53.6%');
    });
  });

  describe('dispose', () => {
    it('should clear event bus', () => {
      loggingSystem.dispose();

      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      loggingSystem.eventBus.emit(event);

      // After dispose, notify should not be called
      expect(notifyMock).not.toHaveBeenCalled();
    });
  });
});
