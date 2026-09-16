import { describe, it, expect, beforeEach } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';

describe('WritingOrchestrator', () => {
  let orchestrator: WritingOrchestrator;
  let mockState: ProjectState;

  beforeEach(() => {
    orchestrator = new WritingOrchestrator();
    mockState = {
      version: 1,
      project: 'test-project',
      projectDir: '/test/project',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: '4a',
      status: 'running',
      chapters: {
        ch001: {
          id: 'ch001',
          title: '系统概述',
          status: 'pending',
          round: 1,
          attempt: 0,
        },
        ch002: {
          id: 'ch002',
          title: '架构设计',
          status: 'pending',
          round: 1,
          attempt: 0,
        },
      },
      round: 1,
      scheduler: {
        tokens: 10,
        paused: false,
      },
      tasks: [],
      executionLog: [],
      escalatedToHuman: false,
    };
  });

  describe('generateWritingTasks', () => {
    it('generates write tasks for all pending chapters', () => {
      const tasks = orchestrator.generateWritingTasks(mockState);

      expect(tasks.length).toBe(2);
      expect(tasks[0].type).toBe('writer');
      expect(tasks[0].chapterId).toBe('ch001');
      expect(tasks[1].type).toBe('writer');
      expect(tasks[1].chapterId).toBe('ch002');
    });

    it('assigns correct priority based on chapter order', () => {
      const tasks = orchestrator.generateWritingTasks(mockState);

      expect(tasks[0].priority).toBeLessThan(tasks[1].priority);
    });

    it('skips chapters that are already written', () => {
      mockState.chapters.ch001.status = 'written';

      const tasks = orchestrator.generateWritingTasks(mockState);

      expect(tasks.length).toBe(1);
      expect(tasks[0].chapterId).toBe('ch002');
    });

    it('handles empty chapter list', () => {
      mockState.chapters = {};

      const tasks = orchestrator.generateWritingTasks(mockState);

      expect(tasks.length).toBe(0);
    });
  });

  describe('generateReviewTasks', () => {
    it('generates review tasks for written chapters', () => {
      mockState.chapters.ch001.status = 'written';
      mockState.chapters.ch002.status = 'written';

      const tasks = orchestrator.generateReviewTasks(mockState);

      expect(tasks.length).toBe(2);
      expect(tasks[0].type).toBe('reviewer');
      expect(tasks[0].chapterId).toBe('ch001');
    });

    it('skips chapters that are not written yet', () => {
      mockState.chapters.ch001.status = 'written';
      mockState.chapters.ch002.status = 'pending';

      const tasks = orchestrator.generateReviewTasks(mockState);

      expect(tasks.length).toBe(1);
      expect(tasks[0].chapterId).toBe('ch001');
    });

    it('skips chapters that are already reviewed', () => {
      mockState.chapters.ch001.status = 'reviewed';
      mockState.chapters.ch002.status = 'written';

      const tasks = orchestrator.generateReviewTasks(mockState);

      expect(tasks.length).toBe(1);
      expect(tasks[0].chapterId).toBe('ch002');
    });
  });

  describe('generateFixTasks', () => {
    it('generates fix tasks for chapters needing revision', () => {
      mockState.chapters.ch001.status = 'reviewed';
      mockState.chapters.ch002.status = 'written';

      const tasks = orchestrator.generateFixTasks(mockState);

      expect(tasks.length).toBe(1);
      expect(tasks[0].type).toBe('fixer');
      expect(tasks[0].chapterId).toBe('ch001');
    });

    it('increments attempt counter', () => {
      mockState.chapters.ch001.status = 'reviewed';
      mockState.chapters.ch001.attempt = 2;

      const tasks = orchestrator.generateFixTasks(mockState);

      expect(tasks[0].attempt).toBe(3);
    });
  });

  describe('updateChapterStatus', () => {
    it('updates chapter status after write task', () => {
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      orchestrator.updateChapterStatus(mockState, task, 'success');

      expect(mockState.chapters.ch001.status).toBe('written');
    });

    it('updates chapter status after review task with accept', () => {
      const task: Task = {
        id: 'task-2',
        type: 'reviewer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: JSON.stringify({
          decision: 'accept',
          confidence: 0.9,
          reasons: [],
        }),
      };

      orchestrator.updateChapterStatus(mockState, task, 'success');

      expect(mockState.chapters.ch001.status).toBe('completed');
    });

    it('updates chapter status after review task with revise', () => {
      const task: Task = {
        id: 'task-2',
        type: 'reviewer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 0,
        prompt: '',
        dependencies: [],
        result: JSON.stringify({
          decision: 'revise',
          confidence: 0.6,
          reasons: ['数据不一致'],
        }),
      };

      orchestrator.updateChapterStatus(mockState, task, 'success');

      expect(mockState.chapters.ch001.status).toBe('reviewed');
    });

    it('updates chapter status after fix task', () => {
      const task: Task = {
        id: 'task-3',
        type: 'fixer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'completed',
        attempt: 1,
        prompt: '',
        dependencies: [],
      };

      orchestrator.updateChapterStatus(mockState, task, 'success');

      expect(mockState.chapters.ch001.status).toBe('written');
      expect(mockState.chapters.ch001.attempt).toBe(1);
    });

    it('handles task failure', () => {
      const task: Task = {
        id: 'task-1',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'failed',
        attempt: 1,
        prompt: '',
        dependencies: [],
      };

      orchestrator.updateChapterStatus(mockState, task, 'failed');

      expect(mockState.chapters.ch001.status).toBe('pending');
      expect(mockState.chapters.ch001.attempt).toBe(1);
    });
  });

  describe('isWritingPhaseComplete', () => {
    it('returns true when all chapters are completed', () => {
      mockState.chapters.ch001.status = 'completed';
      mockState.chapters.ch002.status = 'completed';

      const isComplete = orchestrator.isWritingPhaseComplete(mockState);

      expect(isComplete).toBe(true);
    });

    it('returns false when some chapters are not completed', () => {
      mockState.chapters.ch001.status = 'completed';
      mockState.chapters.ch002.status = 'written';

      const isComplete = orchestrator.isWritingPhaseComplete(mockState);

      expect(isComplete).toBe(false);
    });

    it('returns false when no chapters exist', () => {
      mockState.chapters = {};

      const isComplete = orchestrator.isWritingPhaseComplete(mockState);

      expect(isComplete).toBe(false);
    });
  });

  describe('getNextAction', () => {
    it('returns write tasks when chapters are pending', () => {
      const action = orchestrator.getNextAction(mockState);

      expect(action.type).toBe('write');
      expect(action.tasks.length).toBe(2);
    });

    it('returns review tasks when chapters are written', () => {
      mockState.chapters.ch001.status = 'written';
      mockState.chapters.ch002.status = 'written';

      const action = orchestrator.getNextAction(mockState);

      expect(action.type).toBe('review');
      expect(action.tasks.length).toBe(2);
    });

    it('returns fix tasks when chapters need fix', () => {
      mockState.chapters.ch001.status = 'reviewed';
      mockState.chapters.ch002.status = 'written';

      const action = orchestrator.getNextAction(mockState);

      expect(action.type).toBe('fix');
      expect(action.tasks.length).toBe(1);
    });

    it('returns complete when all chapters are completed', () => {
      mockState.chapters.ch001.status = 'completed';
      mockState.chapters.ch002.status = 'completed';

      const action = orchestrator.getNextAction(mockState);

      expect(action.type).toBe('complete');
      expect(action.tasks.length).toBe(0);
    });
  });
});
