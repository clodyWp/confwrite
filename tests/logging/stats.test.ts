import { describe, it, expect, beforeEach } from 'vitest';
import { StatsCollector } from '../../src/logging/stats.js';
import type { TaskStartEvent, TaskCompleteEvent, TaskFailEvent } from '../../src/logging/types.js';

describe('StatsCollector', () => {
  let collector: StatsCollector;

  beforeEach(() => {
    collector = new StatsCollector();
  });

  describe('recordTaskStart', () => {
    it('should increment running count', () => {
      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      collector.recordTaskStart(event);

      const stats = collector.getStats();
      expect(stats.running).toBe(1);
      expect(stats.executed).toBe(1);
    });

    it('should track concurrency', () => {
      const event1: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 1, max: 3 },
      };

      const event2: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        round: 1,
        concurrency: { current: 2, max: 3 },
      };

      collector.recordTaskStart(event1);
      collector.recordTaskStart(event2);

      const stats = collector.getStats();
      expect(stats.concurrency.max).toBe(3);
    });
  });

  describe('recordTaskComplete', () => {
    it('should increment succeeded count', () => {
      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 45200,
        fileSize: 12600,
      };

      collector.recordTaskComplete(event);

      const stats = collector.getStats();
      expect(stats.succeeded).toBe(1);
      expect(stats.avgDuration).toBe(45200);
    });

    it('should calculate average duration', () => {
      const event1: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 40000,
      };

      const event2: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        duration: 60000,
      };

      collector.recordTaskComplete(event1);
      collector.recordTaskComplete(event2);

      const stats = collector.getStats();
      expect(stats.avgDuration).toBe(50000);
    });

    it('should decrement running count', () => {
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

      collector.recordTaskStart(startEvent);
      collector.recordTaskComplete(completeEvent);

      const stats = collector.getStats();
      expect(stats.running).toBe(0);
    });
  });

  describe('recordTaskFail', () => {
    it('should increment failed count', () => {
      const event: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        error: 'Network error',
        willRetry: false,
      };

      collector.recordTaskFail(event);

      const stats = collector.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should track retry count', () => {
      const event1: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        error: '429 Too Many Requests',
        willRetry: true,
        retryDelay: 60000,
      };

      const event2: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        error: '429 Too Many Requests',
        willRetry: true,
        retryDelay: 60000,
      };

      collector.recordTaskFail(event1);
      collector.recordTaskFail(event2);

      const stats = collector.getStats();
      expect(stats.retries).toBe(2);
    });
  });

  describe('setChapterProgress', () => {
    it('should set chapter progress', () => {
      collector.setChapterProgress({
        total: 84,
        completed: 45,
        failed: 0,
        pending: 39,
      });

      const stats = collector.getStats();
      expect(stats.chapterProgress.total).toBe(84);
      expect(stats.chapterProgress.completed).toBe(45);
      expect(stats.chapterProgress.failed).toBe(0);
      expect(stats.chapterProgress.pending).toBe(39);
    });
  });

  describe('setCurrentPhase', () => {
    it('should set current phase', () => {
      collector.setCurrentPhase('4a');

      const stats = collector.getStats();
      expect(stats.currentPhase).toBe('4a');
    });
  });

  describe('getStats', () => {
    it('should return complete stats object', () => {
      collector.setCurrentPhase('4a');
      collector.setChapterProgress({
        total: 84,
        completed: 10,
        failed: 0,
        pending: 74,
      });

      const startEvent: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 3, max: 3 },
      };

      collector.recordTaskStart(startEvent);

      const stats = collector.getStats();

      expect(stats.currentPhase).toBe('4a');
      expect(stats.chapterProgress.total).toBe(84);
      expect(stats.concurrency.max).toBe(3);
      expect(stats.running).toBe(1);
      expect(stats.executed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.retries).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all stats', () => {
      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 45200,
      };

      collector.recordTaskComplete(event);
      collector.setCurrentPhase('4a');

      collector.reset();

      const stats = collector.getStats();
      expect(stats.succeeded).toBe(0);
      expect(stats.currentPhase).toBe('');
      expect(stats.avgDuration).toBe(0);
    });
  });
});
