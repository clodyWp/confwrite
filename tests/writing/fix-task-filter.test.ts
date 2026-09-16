import { describe, it, expect } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';

function makeChapter(id: string, status: ChapterState['status'], verdict?: 'accept' | 'revise' | 'reject'): ChapterState {
  return {
    id,
    title: `Chapter ${id}`,
    status,
    version: 0,
    round: 1,
    attempt: 0,
    lastReviewVerdict: verdict,
  };
}

function makeState(chapters: ChapterState[]): ProjectState {
  const chapterMap: Record<string, ChapterState> = {};
  for (const ch of chapters) {
    chapterMap[ch.id] = ch;
  }
  return {
    version: 1,
    project: 'test',
    projectDir: '/tmp/test',
    createdAt: '2024-01-01T00:00:00Z',
    lastUpdated: '2024-01-01T00:00:00Z',
    currentPhase: '4c',
    status: 'reviewing',
    chapters: chapterMap,
    round: 1,
  };
}

describe('generateFixTasks — verdict filtering', () => {
  const orchestrator = new WritingOrchestrator();

  it('generates fix task only for chapters with verdict=revise', () => {
    const state = makeState([
      makeChapter('ch001', 'reviewed', 'revise'),
      makeChapter('ch002', 'reviewed', 'accept'),
      makeChapter('ch003', 'reviewed', 'reject'),
    ]);

    const fixTasks = orchestrator.generateFixTasks(state);

    expect(fixTasks).toHaveLength(1);
    expect(fixTasks[0].chapterId).toBe('ch001');
  });

  it('skips chapters with verdict=accept', () => {
    const state = makeState([
      makeChapter('ch001', 'reviewed', 'accept'),
    ]);

    const fixTasks = orchestrator.generateFixTasks(state);
    expect(fixTasks).toHaveLength(0);
  });

  it('skips chapters with verdict=reject', () => {
    const state = makeState([
      makeChapter('ch001', 'reviewed', 'reject'),
    ]);

    const fixTasks = orchestrator.generateFixTasks(state);
    expect(fixTasks).toHaveLength(0);
  });

  it('skips chapters with no verdict set', () => {
    const state = makeState([
      makeChapter('ch001', 'reviewed'),
    ]);

    const fixTasks = orchestrator.generateFixTasks(state);
    expect(fixTasks).toHaveLength(0);
  });

  it('generates multiple fix tasks when multiple chapters need revision', () => {
    const state = makeState([
      makeChapter('ch001', 'reviewed', 'revise'),
      makeChapter('ch002', 'reviewed', 'revise'),
      makeChapter('ch003', 'reviewed', 'accept'),
    ]);

    const fixTasks = orchestrator.generateFixTasks(state);
    expect(fixTasks).toHaveLength(2);
    expect(fixTasks.map(t => t.chapterId)).toEqual(['ch001', 'ch002']);
  });
});

describe('updateChapterStatus — reviewer sets lastReviewVerdict', () => {
  const orchestrator = new WritingOrchestrator();

  it('reviewer accept → status=completed, verdict=accept', () => {
    const state = makeState([makeChapter('ch001', 'written')]);
    const task = {
      id: 'review-ch001',
      type: 'reviewer' as const,
      chapterId: 'ch001',
      status: 'completed' as const,
      attempt: 0,
      priority: 1,
      sequence: 1,
      prompt: '',
      result: JSON.stringify({ decision: 'accept', confidence: 0.9, reasons: [] }),
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('completed');
    expect(state.chapters.ch001.lastReviewVerdict).toBe('accept');
  });

  it('reviewer revise → status=reviewed, verdict=revise', () => {
    const state = makeState([makeChapter('ch001', 'written')]);
    const task = {
      id: 'review-ch001',
      type: 'reviewer' as const,
      chapterId: 'ch001',
      status: 'completed' as const,
      attempt: 0,
      priority: 1,
      sequence: 1,
      prompt: '',
      result: JSON.stringify({ decision: 'revise', confidence: 0.7, reasons: ['typo'] }),
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('reviewed');
    expect(state.chapters.ch001.lastReviewVerdict).toBe('revise');
  });

  it('reviewer reject → status=pending, verdict=reject, round+1', () => {
    const state = makeState([makeChapter('ch001', 'written')]);
    const task = {
      id: 'review-ch001',
      type: 'reviewer' as const,
      chapterId: 'ch001',
      status: 'completed' as const,
      attempt: 0,
      priority: 1,
      sequence: 1,
      prompt: '',
      result: JSON.stringify({ decision: 'reject', confidence: 0.3, reasons: ['bad'] }),
      dependencies: [],
    };

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('pending');
    expect(state.chapters.ch001.lastReviewVerdict).toBe('reject');
    expect(state.chapters.ch001.round).toBe(2);
  });
});
