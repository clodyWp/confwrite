import { describe, it, expect } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState, Task } from '../../src/state/schema.js';

function makeState(): ProjectState {
  return {
    version: 1,
    project: 'test',
    projectDir: '/tmp/test',
    createdAt: '2024-01-01T00:00:00Z',
    lastUpdated: '2024-01-01T00:00:00Z',
    currentPhase: '4b',
    status: 'reviewing',
    chapters: {
      ch001: {
        id: 'ch001',
        title: 'Test Chapter',
        status: 'written',
        version: 0,
        round: 1,
        attempt: 0,
      },
    },
    round: 1,
  };
}

function makeTask(type: 'writer' | 'reviewer' | 'fixer', result: string | undefined): Task {
  return {
    id: `test-task-1`,
    type,
    chapterId: 'ch001',
    status: 'completed',
    attempt: 0,
    priority: 1,
    sequence: 1,
    prompt: '',
    result,
    dependencies: [],
  };
}

describe('WritingOrchestrator — review result parsing', () => {
  const orchestrator = new WritingOrchestrator();

  it('reviewer accept with valid JSON → status=completed', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', JSON.stringify({ decision: 'accept', confidence: 0.9, reasons: [] }));

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('completed');
  });

  it('reviewer revise with valid JSON → status=reviewed', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', JSON.stringify({ decision: 'revise', confidence: 0.7, reasons: ['typo'] }));

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('reviewed');
  });

  it('reviewer reject with valid JSON → status=pending, round+1', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', JSON.stringify({ decision: 'reject', confidence: 0.3, reasons: ['bad'] }));

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('pending');
    expect(state.chapters.ch001.round).toBe(2);
  });

  it('reviewer with INVALID JSON → defaults to revise, no throw', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', 'This is not JSON at all, just free text from reviewer');

    expect(() => {
      orchestrator.updateChapterStatus(state, task, 'success');
    }).not.toThrow();

    expect(state.chapters.ch001.status).toBe('reviewed');
  });

  it('reviewer with empty string result → defaults to revise, no throw', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', '');

    expect(() => {
      orchestrator.updateChapterStatus(state, task, 'success');
    }).not.toThrow();

    expect(state.chapters.ch001.status).toBe('reviewed');
  });

  it('reviewer with undefined result → defaults to revise, no throw', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const task = makeTask('reviewer', undefined);

    expect(() => {
      orchestrator.updateChapterStatus(state, task, 'success');
    }).not.toThrow();

    expect(state.chapters.ch001.status).toBe('reviewed');
  });

  it('reviewer with free text containing **决定**: accept → parsed correctly', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const freeText = `# Review Report\n\n## 结论\n**决定**: accept\n\n## 评分\n- 内容: 9/10\n`;
    const task = makeTask('reviewer', freeText);

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('completed');
  });

  it('reviewer with free text containing **决定**: reject → parsed correctly', () => {
    const state = makeState();
    state.chapters.ch001.status = 'written';
    const freeText = `# Review Report\n\n**决定**: reject\n\n质量太差。\n`;
    const task = makeTask('reviewer', freeText);

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('pending');
    expect(state.chapters.ch001.round).toBe(2);
  });

  it('writer success → status=written', () => {
    const state = makeState();
    state.chapters.ch001.status = 'pending';
    const task = makeTask('writer', 'chapter content saved');

    orchestrator.updateChapterStatus(state, task, 'success');

    expect(state.chapters.ch001.status).toBe('written');
  });

  it('task failure → status=reviewed, consecutiveFailures+1', () => {
    const state = makeState();
    state.chapters.ch001.status = 'writing';
    const task = makeTask('writer', undefined);

    orchestrator.updateChapterStatus(state, task, 'failed');

    // 失败次数 < 5 时，设置为 reviewed，让 fixer 在下一轮修复
    expect(state.chapters.ch001.status).toBe('reviewed');
    expect(state.chapters.ch001.lastReviewVerdict).toBe('revise');
    expect(state.chapters.ch001.consecutiveFailures).toBe(1);
  });
});
