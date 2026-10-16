import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState } from '../../src/state/schema.js';
import type { Task } from '../../src/scheduler/types.js';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function createTestState(tempDir: string): ProjectState {
  return {
    version: 1,
    project: 'test',
    projectDir: tempDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '4a',
    status: 'writing',
    chapters: {
      ch001: {
        id: 'ch001',
        title: 'Test',
        status: 'written',
        version: 0,
        round: 1,
        attempt: 0,
        consecutiveFailures: 0,
        maxRounds: 5,
        type: 'overview',
        wordBudget: { min: 5000, max: 8000 },
        importance: 3,
        description: 'Test',
        style: 'overview',
      },
    },
    round: 1,
    scheduler: { tokens: 10, paused: false },
    tasks: [],
    executionLog: [],
    escalatedToHuman: false,
  };
}

function createTask(chapterId: string, type: 'writer' | 'reviewer' | 'fixer'): Task {
  return {
    id: `${type}-${chapterId}-r1`,
    type,
    chapterId,
    priority: 1,
    sequence: 1,
    status: 'completed',
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

describe('SM-21: validation_failed 不得递增 round', () => {
  let tempDir: string;
  let orchestrator: WritingOrchestrator;

  beforeEach(() => {
    tempDir = join(process.env.TMPDIR || '.', `test-sm21-${Date.now()}`);
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    orchestrator = new WritingOrchestrator();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writer validation_failed 后 round 保持为 1', () => {
    const state = createTestState(tempDir);
    const task = createTask('ch001', 'writer');
    orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
    expect(state.chapters.ch001.round).toBe(1);
    expect(state.chapters.ch001.status).toBe('written');
    expect(state.chapters.ch001.consecutiveFailures).toBe(1);
  });

  it('连续 maxRounds 次 validation_failed 后标记为终态', () => {
    const state = createTestState(tempDir);
    state.chapters.ch001.consecutiveFailures = 4;
    writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'), '# test');
    const task = createTask('ch001', 'writer');
    orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
    expect(state.chapters.ch001.consecutiveFailures).toBe(5);
    expect(['completed', 'failed']).toContain(state.chapters.ch001.status);
    expect(state.chapters.ch001.round).toBe(1);
  });

  it('regression: E2E v124 ch003 场景', () => {
    const state = createTestState(tempDir);
    state.chapters.ch001.wordBudget = { min: 5200, max: 7800 };
    const task = createTask('ch001', 'writer');
    orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
    expect(state.chapters.ch001.round).toBe(1);
    expect(state.chapters.ch001.status).toBe('written');
  });

  it('validation_failed 不创建版本跳跃', () => {
    const state = createTestState(tempDir);
    const task = createTask('ch001', 'writer');
    orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
    expect(state.chapters.ch001.round).toBe(1);
    orchestrator.updateChapterStatus(state, task, 'failed', tempDir, 'validation_failed');
    expect(state.chapters.ch001.round).toBe(1);
  });
});
