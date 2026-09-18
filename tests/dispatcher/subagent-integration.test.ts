import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState } from '../../src/state/schema.js';

const TEST_DIR = 'tests/tmp/dispatcher-integration';

function createState(): ProjectState {
  return {
    version: 1,
    project: 'test-project',
    projectDir: TEST_DIR,
    createdAt: '2024-01-01T00:00:00Z',
    lastUpdated: '2024-01-01T00:00:00Z',
    currentPhase: '4a',
    status: 'writing',
    chapters: {
      ch001: {
        id: 'ch001',
        title: '项目概述',
        status: 'pending',
        version: 0,
        round: 1,
        attempt: 0,
      },
    },
    round: 1,
  };
}

describe('Dispatcher — subagent integration', () => {
  let store: ProjectStore;
  let scheduler: SubagentScheduler;
  let taskExecutor: TaskExecutor;
  let writingOrchestrator: WritingOrchestrator;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets', 'chapter-kits'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'review'), { recursive: true });

    writeFileSync(
      join(TEST_DIR, 'assets', 'chapter-kits', 'ch001-kit.md'),
      '# ch001 素材包\n\n内容...'
    );

    const state = createState();
    store = new ProjectStore(TEST_DIR);
    store.save(state);

    scheduler = new SubagentScheduler();
    taskExecutor = new TaskExecutor();
    writingOrchestrator = new WritingOrchestrator();
    dispatcher = new Dispatcher(TEST_DIR, store, scheduler, taskExecutor, writingOrchestrator);
  });

  describe('executeReadyTasks', () => {
    it('returns tasks that are queued and ready', async () => {
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });

      const ready = scheduler.getReadyTasks();
      expect(ready.length).toBe(1);
      expect(ready[0].status).toBe('queued');
    });

    it('processTask marks task completed and updates chapter status', async () => {
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });

      const task = scheduler.getReadyTasks()[0];
      scheduler.markRunning(task.id);

      // Simulate subagent completion
      const result = '写作完成，已生成草稿。';
      await dispatcher.processTask(task.id, 'success', result);

      const completedTask = scheduler.getTask(task.id);
      expect(completedTask?.status).toBe('completed');
      expect(completedTask?.result).toBe(result);

      // Chapter status should be updated
      const state = store.load()!;
      expect(state.chapters.ch001.status).toBe('written');
    });

    it('processTask marks task failed and reverts chapter status', async () => {
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });

      const task = scheduler.getReadyTasks()[0];
      scheduler.markRunning(task.id);

      await dispatcher.processTask(task.id, 'failed', 'Subagent timeout');

      const failedTask = scheduler.getTask(task.id);
      expect(failedTask?.status).toBe('failed');

      const state = store.load()!;
      expect(state.chapters.ch001.status).toBe('pending');
    });

    it('processTask for reviewer success with accept → chapter completed', async () => {
      // Setup: chapter is written
      const state = store.load()!;
      state.chapters.ch001.status = 'written';
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      const task = scheduler.getReadyTasks()[0];
      scheduler.markRunning(task.id);

      await dispatcher.processTask(task.id, 'success', '{"decision":"accept","confidence":0.9,"reasons":["good"]}');

      const updatedState = store.load()!;
      expect(updatedState.chapters.ch001.status).toBe('completed');
      expect(updatedState.chapters.ch001.lastReviewVerdict).toBe('accept');
    });

    it('processTask for reviewer success with revise → chapter reviewed', async () => {
      const state = store.load()!;
      state.chapters.ch001.status = 'written';
      store.save(state);

      await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      const task = scheduler.getReadyTasks()[0];
      scheduler.markRunning(task.id);

      await dispatcher.processTask(task.id, 'success', '{"decision":"revise","confidence":0.6,"reasons":["needs work"]}');

      const updatedState = store.load()!;
      expect(updatedState.chapters.ch001.status).toBe('reviewed');
      expect(updatedState.chapters.ch001.lastReviewVerdict).toBe('revise');
    });

    it('processTask for fixer success → chapter written again', async () => {
      const state = store.load()!;
      state.chapters.ch001.status = 'reviewed';
      state.chapters.ch001.lastReviewVerdict = 'revise';
      store.save(state);

      // Create review file for fix prompt generation
      writeFileSync(
        join(TEST_DIR, 'review', 'ch001-r1.json'),
        '{"verdict":"revise","issues":["fix this"]}'
      );
      writeFileSync(
        join(TEST_DIR, 'drafts', 'chapters', 'ch001.md'),
        '# ch001 draft'
      );

      await dispatcher.dispatch('spawn_fixers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      const task = scheduler.getReadyTasks()[0];
      scheduler.markRunning(task.id);

      await dispatcher.processTask(task.id, 'success', '修复完成');

      const updatedState = store.load()!;
      expect(updatedState.chapters.ch001.status).toBe('written');
    });
  });

  describe('full write cycle', () => {
    it('write → review(accept) → chapter completed', async () => {
      // Step 1: dispatch writers
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });

      const writeTask = scheduler.getReadyTasks()[0];
      scheduler.markRunning(writeTask.id);
      await dispatcher.processTask(writeTask.id, 'success', '写作完成');

      let state = store.load()!;
      expect(state.chapters.ch001.status).toBe('written');

      // Step 2: dispatch reviewers
      await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      const reviewTask = scheduler.getReadyTasks()[0];
      scheduler.markRunning(reviewTask.id);
      await dispatcher.processTask(reviewTask.id, 'success', '{"decision":"accept","confidence":0.95,"reasons":[]}');

      state = store.load()!;
      expect(state.chapters.ch001.status).toBe('completed');
      expect(state.chapters.ch001.lastReviewVerdict).toBe('accept');
    });

    it('write → review(revise) → fix → review(accept) → completed', async () => {
      // Step 1: write
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });
      const writeTask = scheduler.getReadyTasks()[0];
      scheduler.markRunning(writeTask.id);
      await dispatcher.processTask(writeTask.id, 'success', 'done');

      // Step 2: review → revise
      await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });
      const reviewTask1 = scheduler.getReadyTasks()[0];
      scheduler.markRunning(reviewTask1.id);
      await dispatcher.processTask(reviewTask1.id, 'success', '{"decision":"revise","confidence":0.5,"reasons":["issues"]}');

      let state = store.load()!;
      expect(state.chapters.ch001.status).toBe('reviewed');
      expect(state.chapters.ch001.lastReviewVerdict).toBe('revise');

      // Step 3: fix
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001.md'), '# draft');
      writeFileSync(join(TEST_DIR, 'review', 'ch001-r1.json'), '{"verdict":"revise"}');

      await dispatcher.dispatch('spawn_fixers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });
      const fixTask = scheduler.getReadyTasks()[0];
      scheduler.markRunning(fixTask.id);
      await dispatcher.processTask(fixTask.id, 'success', 'fixed');

      state = store.load()!;
      expect(state.chapters.ch001.status).toBe('written');

      // Step 4: review again → accept
      writeFileSync(join(TEST_DIR, 'review', 'ch001-r1.json'), '{"verdict":"accept"}');
      
      await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });
      const reviewTask2 = scheduler.getReadyTasks()[0];
      scheduler.markRunning(reviewTask2.id);
      await dispatcher.processTask(reviewTask2.id, 'success', '{"decision":"accept","confidence":0.9,"reasons":[]}');

      state = store.load()!;
      expect(state.chapters.ch001.status).toBe('completed');
    });
  });
});
