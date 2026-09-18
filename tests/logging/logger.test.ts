import { describe, it, expect } from 'vitest';
import { Logger } from '../../src/logging/logger.js';
import type {
  TaskStartEvent,
  TaskCompleteEvent,
  TaskFailEvent,
  ChapterStatusChangeEvent,
  PhaseTransitionEvent,
  DiagramScanEvent,
  DiagramGenerateEvent,
  RateLimitEvent,
  ProgressReportEvent,
} from '../../src/logging/types.js';

describe('Logger', () => {
  describe('format', () => {
    it('should format task.start event', () => {
      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 2, max: 3 },
      };

      const result = Logger.format(event);

      expect(result.message).toContain('Writer');
      expect(result.message).toContain('ch001');
      expect(result.message).toContain('2/3');
      expect(result.level).toBe('info');
    });

    it('should format task.complete event', () => {
      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 45200,
        fileSize: 12600,
        outputPath: 'drafts/chapters/ch001-v1.md',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('ch001');
      expect(result.message).toContain('45.2s');
      expect(result.message).toContain('12.3KB');
      expect(result.level).toBe('info');
    });

    it('should format task.fail event with retry', () => {
      const event: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        error: '429 Too Many Requests',
        willRetry: true,
        retryDelay: 60000,
      };

      const result = Logger.format(event);

      expect(result.message).toContain('ch002');
      expect(result.message).toContain('429');
      expect(result.message).toContain('1m 0s');
      expect(result.level).toBe('warning');
    });

    it('should format task.fail event without retry', () => {
      const event: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        error: 'Network error',
        willRetry: false,
      };

      const result = Logger.format(event);

      expect(result.message).toContain('ch002');
      expect(result.message).toContain('Network error');
      expect(result.level).toBe('error');
    });

    it('should format chapter.status event', () => {
      const event: ChapterStatusChangeEvent = {
        type: 'chapter.status',
        chapterId: 'ch001',
        from: 'pending',
        to: 'writing',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('ch001');
      expect(result.message).toContain('pending');
      expect(result.message).toContain('writing');
      expect(result.level).toBe('info');
    });

    it('should format chapter.status event with version', () => {
      const event: ChapterStatusChangeEvent = {
        type: 'chapter.status',
        chapterId: 'ch001',
        from: 'writing',
        to: 'written',
        version: 1,
      };

      const result = Logger.format(event);

      expect(result.message).toContain('v1');
    });

    it('should format phase.transition event', () => {
      const event: PhaseTransitionEvent = {
        type: 'phase.transition',
        from: '4a',
        to: '4b',
        phaseName: '审阅',
        reason: '所有章节写作完成',
        stats: {
          completedChapters: 84,
          failedChapters: 0,
        },
      };

      const result = Logger.format(event);

      expect(result.message).toContain('4a');
      expect(result.message).toContain('4b');
      expect(result.message).toContain('审阅');
      expect(result.message).toContain('84');
      expect(result.level).toBe('info');
    });

    it('should format diagram.scan event', () => {
      const event: DiagramScanEvent = {
        type: 'diagram.scan',
        total: 15,
        byFormat: {
          'diagram-start': 8,
          'mermaid': 7,
        },
      };

      const result = Logger.format(event);

      expect(result.message).toContain('15');
      expect(result.message).toContain('8');
      expect(result.message).toContain('7');
      expect(result.level).toBe('info');
    });

    it('should format diagram.generate event', () => {
      const event: DiagramGenerateEvent = {
        type: 'diagram.generate',
        diagramId: 'ch001-fig1',
        chapterId: 'ch001',
        format: 'diagram-start',
        diagramType: 'architecture',
        action: 'generated',
        duration: 2300,
        outputPath: 'figures/ch001-fig1.svg',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('ch001-fig1');
      expect(result.message).toContain('architecture');
      expect(result.message).toContain('2.3s');
      expect(result.level).toBe('info');
    });

    it('should format diagram.generate cached event', () => {
      const event: DiagramGenerateEvent = {
        type: 'diagram.generate',
        diagramId: 'ch001-fig1',
        chapterId: 'ch001',
        format: 'diagram-start',
        diagramType: 'architecture',
        action: 'cached',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('缓存');
      expect(result.level).toBe('info');
    });

    it('should format ratelimit pause event', () => {
      const event: RateLimitEvent = {
        type: 'ratelimit',
        action: 'pause',
        duration: 60000,
        reason: '429 Too Many Requests',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('暂停');
      expect(result.message).toContain('1m 0s');
      expect(result.level).toBe('warning');
    });

    it('should format ratelimit resume event', () => {
      const event: RateLimitEvent = {
        type: 'ratelimit',
        action: 'resume',
      };

      const result = Logger.format(event);

      expect(result.message).toContain('恢复');
      expect(result.level).toBe('info');
    });

    it('should format stats.progress event', () => {
      const event: ProgressReportEvent = {
        type: 'stats.progress',
        elapsed: 332000,
        currentPhase: '4a',
        chapterProgress: {
          total: 84,
          completed: 45,
          failed: 0,
          pending: 39,
        },
        taskStats: {
          executed: 45,
          succeeded: 44,
          failed: 1,
          avgDuration: 38500,
        },
        resourceUsage: {
          concurrency: { current: 3, max: 3 },
          tokenBucket: { current: 8, max: 10 },
        },
        estimatedRemaining: 420,
      };

      const result = Logger.format(event);

      expect(result.message).toContain('5m 32s');
      expect(result.message).toContain('4a');
      expect(result.message).toContain('45/84');
      expect(result.message).toContain('53.6%');
      expect(result.message).toContain('7m');
      expect(result.level).toBe('info');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds to human readable', () => {
      expect(Logger.formatDuration(500)).toBe('0.5s');
      expect(Logger.formatDuration(1500)).toBe('1.5s');
      expect(Logger.formatDuration(45200)).toBe('45.2s');
      expect(Logger.formatDuration(60000)).toBe('1m 0s');
      expect(Logger.formatDuration(332000)).toBe('5m 32s');
      expect(Logger.formatDuration(3600000)).toBe('1h 0m');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes to human readable', () => {
      expect(Logger.formatFileSize(500)).toBe('500B');
      expect(Logger.formatFileSize(1500)).toBe('1.5KB');
      expect(Logger.formatFileSize(12600)).toBe('12.3KB');
      expect(Logger.formatFileSize(1500000)).toBe('1.4MB');
    });
  });
});
