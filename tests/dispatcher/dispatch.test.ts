import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState } from '../../src/state/schema.js';

const TEST_DIR = 'tests/tmp/dispatcher-test';

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
      ch002: {
        id: 'ch002',
        title: '需求分析',
        status: 'pending',
        version: 0,
        round: 1,
        attempt: 0,
      },
    },
    round: 1,
  };
}

describe('Dispatcher', () => {
  let store: ProjectStore;
  let scheduler: SubagentScheduler;
  let taskExecutor: TaskExecutor;
  let writingOrchestrator: WritingOrchestrator;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    // Setup test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets', 'chapter-kits'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'review'), { recursive: true });

    // Create chapter kits (filename matches KitGenerator output: {chapterId}.md)
    writeFileSync(
      join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md'),
      '# ch001 素材包\n\n## 相关文件\n- ref1.md\n\n## 关键数据\n- 性能: 99.9%'
    );
    writeFileSync(
      join(TEST_DIR, 'assets', 'chapter-kits', 'ch002.md'),
      '# ch002 素材包\n\n## 相关文件\n- ref2.md\n\n## 关键数据\n- 并发: 1000'
    );

    // Create state
    const state = createState();
    store = new ProjectStore(TEST_DIR);
    store.save(state);

    scheduler = new SubagentScheduler();
    taskExecutor = new TaskExecutor();
    writingOrchestrator = new WritingOrchestrator();
    dispatcher = new Dispatcher(TEST_DIR, store, scheduler, taskExecutor, writingOrchestrator);
  });

  describe('dispatch spawn_writers', () => {
    it('reads chapter kits for each pending chapter', async () => {
      const result = await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001', 'ch002'],
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(2);
      expect(result.tasks[0].type).toBe('writer');
      expect(result.tasks[0].chapterId).toBe('ch001');
      expect(result.tasks[1].chapterId).toBe('ch002');
    });

    it('generates writer prompts with kit content', async () => {
      const result = await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001'],
        projectDir: TEST_DIR,
      });

      expect(result.tasks[0].prompt).toContain('ch001');
      expect(result.tasks[0].prompt).toContain('素材包');
      expect(result.tasks[0].prompt).toContain('99.9%');
    });

    it('submits tasks to scheduler', async () => {
      await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001', 'ch002'],
        projectDir: TEST_DIR,
      });

      const queued = scheduler.getReadyTasks();
      expect(queued.length).toBe(2);
    });

    it('handles missing chapter kit gracefully', async () => {
      rmSync(join(TEST_DIR, 'assets', 'chapter-kits', 'ch002.md'));

      const result = await dispatcher.dispatch('spawn_writers', {
        chapters: ['ch001', 'ch002'],
        projectDir: TEST_DIR,
      });

      // ch001 should succeed, ch002 should have empty kit
      expect(result.tasksCreated).toBe(2);
      expect(result.tasks[0].prompt).toContain('99.9%');
      expect(result.tasks[1].prompt).toContain('[素材包缺失]');
    });
  });

  describe('dispatch spawn_reviewers', () => {
    it('reads chapter drafts and generates reviewer prompts', async () => {
      // Create draft
      writeFileSync(
        join(TEST_DIR, 'drafts', 'chapters', 'ch001.md'),
        '# ch001 项目概述\n\n## 概述\n这是一个测试章节。'
      );

      const state = store.load()!;
      state.chapters.ch001.status = 'written';
      store.save(state);

      const result = await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(1);
      expect(result.tasks[0].type).toBe('reviewer');
      expect(result.tasks[0].prompt).toContain('审阅任务');
      expect(result.tasks[0].prompt).toContain('项目概述');
    });

    it('handles missing draft gracefully', async () => {
      const result = await dispatcher.dispatch('spawn_reviewers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(1);
      expect(result.tasks[0].prompt).toContain('[草稿缺失]');
    });
  });

  describe('dispatch spawn_fixers', () => {
    it('reads draft + review and generates fix prompts', async () => {
      // Create draft and review
      writeFileSync(
        join(TEST_DIR, 'drafts', 'chapters', 'ch001.md'),
        '# ch001 项目概述\n\n原始内容。'
      );
      writeFileSync(
        join(TEST_DIR, 'review', 'ch001-r1.json'),
        JSON.stringify({
          verdict: 'revise',
          issues: ['数据不准确', '缺少示例'],
        })
      );

      const state = store.load()!;
      state.chapters.ch001.status = 'reviewed';
      state.chapters.ch001.lastReviewVerdict = 'revise';
      store.save(state);

      const result = await dispatcher.dispatch('spawn_fixers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(1);
      expect(result.tasks[0].type).toBe('fixer');
      expect(result.tasks[0].prompt).toContain('修复任务');
      expect(result.tasks[0].prompt).toContain('数据不准确');
    });

    it('handles missing review gracefully', async () => {
      writeFileSync(
        join(TEST_DIR, 'drafts', 'chapters', 'ch001.md'),
        '# ch001 内容'
      );

      const result = await dispatcher.dispatch('spawn_fixers', {
        chapters: ['ch001'],
        round: 1,
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(1);
      expect(result.tasks[0].prompt).toContain('[审阅报告缺失]');
    });
  });

  describe('dispatch unknown action', () => {
    it('throws error for unknown action', async () => {
      await expect(
        dispatcher.dispatch('unknown_action', {})
      ).rejects.toThrow('Unknown action');
    });
  });

  describe('dispatch generate_diagrams', () => {
    it('returns empty result (Phase 5 is empty shell)', async () => {
      const result = await dispatcher.dispatch('generate_diagrams', {
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(0);
      expect(result.message).toContain('图表');
    });
  });

  describe('dispatch assemble', () => {
    it('returns empty result (handled by Assembler directly)', async () => {
      const result = await dispatcher.dispatch('assemble', {
        projectDir: TEST_DIR,
      });

      expect(result.tasksCreated).toBe(0);
    });
  });
});
