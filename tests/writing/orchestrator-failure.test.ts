import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, statSync } from 'node:fs';

describe('WritingOrchestrator - Failure Handling', () => {
  let orchestrator: WritingOrchestrator;
  let state: ProjectState;

  beforeEach(() => {
    orchestrator = new WritingOrchestrator();
    state = {
      currentPhase: '4a',
      status: 'writing',
      chapters: {
        ch001: {
          id: 'ch001',
          status: 'pending',
          round: 1,
          attempt: 0,
          consecutiveFailures: 0,
          maxRounds: 5,
        },
      },
      executionLog: [],
    };
  });

  it('should increment consecutiveFailures on task failure', () => {
    const task: Task = {
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'failed', '/tmp/test');

    expect(state.chapters.ch001.consecutiveFailures).toBe(1);
    // 失败次数 < 5 时，设置为 reviewed，让 fixer 在下一轮修复
    expect(state.chapters.ch001.status).toBe('reviewed');
    expect(state.chapters.ch001.lastReviewVerdict).toBe('revise');
  });

  it('should reset consecutiveFailures on task success', () => {
    state.chapters.ch001.consecutiveFailures = 3;

    const task: Task = {
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'success', '/tmp/test');

    expect(state.chapters.ch001.consecutiveFailures).toBe(0);
  });

  it('should mark chapter as failed after 5 consecutive failures without output', () => {
    state.chapters.ch001.consecutiveFailures = 4;

    const task: Task = {
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'budget_exceeded',
    };

    orchestrator.updateChapterStatus(state, task, 'failed', '/tmp/test');

    expect(state.chapters.ch001.status).toBe('failed');
    expect(state.chapters.ch001.failureReason).toBe('no_output');
  });

  it('should mark chapter as completed after 5 consecutive failures with output', () => {
    state.chapters.ch001.consecutiveFailures = 4;

    const task: Task = {
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'budget_exceeded',
    };

    // Mock file exists
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ size: 1000 } as any);

    orchestrator.updateChapterStatus(state, task, 'failed', '/tmp/test');

    expect(state.chapters.ch001.status).toBe('completed');
    expect(state.chapters.ch001.failureReason).toBe('completed_with_issues');

    // Restore
    vi.mocked(existsSync).mockReset();
    vi.mocked(statSync).mockReset();
  });

  it('should not increment round on rate_limited failure', () => {
    const task: Task = {
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
      failureReason: 'rate_limited',
    };

    const initialRound = state.chapters.ch001.round;
    orchestrator.updateChapterStatus(state, task, 'failed', '/tmp/test');

    expect(state.chapters.ch001.round).toBe(initialRound);
    expect(state.chapters.ch001.status).toBe('pending');
  });

  it('should mark chapter as failed when exceeding max rounds without output', () => {
    state.chapters.ch001.round = 5;
    state.chapters.ch001.status = 'written';

    const task: Task = {
      id: 'review-ch001-r5',
      type: 'reviewer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'success', '/tmp/test');

    expect(state.chapters.ch001.status).toBe('failed');
    expect(state.chapters.ch001.failureReason).toBe('exceeded_max_rounds_no_output');
  });

  it('should mark chapter as completed when exceeding max rounds with output', () => {
    state.chapters.ch001.round = 5;
    state.chapters.ch001.status = 'written';

    const task: Task = {
      id: 'review-ch001-r5',
      type: 'reviewer',
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'queued',
      attempt: 0,
      prompt: '',
      dependencies: [],
    };

    // Mock file exists
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ size: 1000 } as any);

    orchestrator.updateChapterStatus(state, task, 'success', '/tmp/test');

    expect(state.chapters.ch001.status).toBe('completed');
    expect(state.chapters.ch001.failureReason).toBe('exceeded_max_rounds_with_output');

    // Restore
    vi.mocked(existsSync).mockReset();
    vi.mocked(statSync).mockReset();
  });
});
