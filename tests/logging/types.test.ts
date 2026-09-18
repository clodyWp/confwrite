import { describe, it, expect } from 'vitest';
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

describe('Logging Types', () => {
  describe('TaskStartEvent', () => {
    it('should have correct structure', () => {
      const event: TaskStartEvent = {
        type: 'task.start',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        round: 1,
        concurrency: { current: 2, max: 3 },
      };

      expect(event.type).toBe('task.start');
      expect(event.taskId).toBe('write-ch001-r1');
      expect(event.taskType).toBe('writer');
      expect(event.chapterId).toBe('ch001');
      expect(event.round).toBe(1);
      expect(event.concurrency.current).toBe(2);
      expect(event.concurrency.max).toBe(3);
    });
  });

  describe('TaskCompleteEvent', () => {
    it('should have correct structure', () => {
      const event: TaskCompleteEvent = {
        type: 'task.complete',
        taskId: 'write-ch001-r1',
        taskType: 'writer',
        chapterId: 'ch001',
        duration: 45200,
        fileSize: 12600,
        outputPath: 'drafts/chapters/ch001-v1.md',
      };

      expect(event.type).toBe('task.complete');
      expect(event.duration).toBe(45200);
      expect(event.fileSize).toBe(12600);
    });
  });

  describe('TaskFailEvent', () => {
    it('should have correct structure', () => {
      const event: TaskFailEvent = {
        type: 'task.fail',
        taskId: 'write-ch002-r1',
        taskType: 'writer',
        chapterId: 'ch002',
        error: '429 Too Many Requests',
        willRetry: true,
        retryDelay: 60000,
      };

      expect(event.type).toBe('task.fail');
      expect(event.error).toBe('429 Too Many Requests');
      expect(event.willRetry).toBe(true);
      expect(event.retryDelay).toBe(60000);
    });
  });

  describe('ChapterStatusChangeEvent', () => {
    it('should have correct structure', () => {
      const event: ChapterStatusChangeEvent = {
        type: 'chapter.status',
        chapterId: 'ch001',
        from: 'pending',
        to: 'writing',
      };

      expect(event.type).toBe('chapter.status');
      expect(event.from).toBe('pending');
      expect(event.to).toBe('writing');
    });

    it('should support optional version', () => {
      const event: ChapterStatusChangeEvent = {
        type: 'chapter.status',
        chapterId: 'ch001',
        from: 'writing',
        to: 'written',
        version: 1,
      };

      expect(event.version).toBe(1);
    });
  });

  describe('PhaseTransitionEvent', () => {
    it('should have correct structure', () => {
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

      expect(event.type).toBe('phase.transition');
      expect(event.from).toBe('4a');
      expect(event.to).toBe('4b');
      expect(event.stats?.completedChapters).toBe(84);
    });
  });

  describe('DiagramScanEvent', () => {
    it('should have correct structure', () => {
      const event: DiagramScanEvent = {
        type: 'diagram.scan',
        total: 15,
        byFormat: {
          'diagram-start': 8,
          'mermaid': 7,
        },
      };

      expect(event.type).toBe('diagram.scan');
      expect(event.total).toBe(15);
      expect(event.byFormat['diagram-start']).toBe(8);
      expect(event.byFormat['mermaid']).toBe(7);
    });
  });

  describe('DiagramGenerateEvent', () => {
    it('should have correct structure for generated diagram', () => {
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

      expect(event.action).toBe('generated');
      expect(event.duration).toBe(2300);
    });

    it('should support cached action', () => {
      const event: DiagramGenerateEvent = {
        type: 'diagram.generate',
        diagramId: 'ch001-fig1',
        chapterId: 'ch001',
        format: 'diagram-start',
        diagramType: 'architecture',
        action: 'cached',
      };

      expect(event.action).toBe('cached');
    });
  });

  describe('RateLimitEvent', () => {
    it('should have correct structure', () => {
      const event: RateLimitEvent = {
        type: 'ratelimit',
        action: 'pause',
        duration: 60000,
        reason: '429 Too Many Requests',
      };

      expect(event.type).toBe('ratelimit');
      expect(event.action).toBe('pause');
    });
  });

  describe('ProgressReportEvent', () => {
    it('should have correct structure', () => {
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

      expect(event.type).toBe('stats.progress');
      expect(event.elapsed).toBe(332000);
      expect(event.chapterProgress.completed).toBe(45);
      expect(event.estimatedRemaining).toBe(420);
    });
  });
});
