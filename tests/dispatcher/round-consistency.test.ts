/**
 * Issue #74 回归测试：Round 文件名不匹配导致审阅循环
 * 
 * 问题：Task ID 使用 state.round（全局），文件查找使用 chapter.round（章节）
 * 导致审阅文件找不到，系统陷入死循环。
 * 
 * 修复：统一使用 chapter.round
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { ProjectStore } from '../../src/state/store.js';
import { EventBus } from '../../src/logging/event-bus.js';
import type { ProjectState } from '../../src/state/schema.js';

describe('Issue #74: Round 文件名一致性', () => {
  let testDir: string;
  let store: ProjectStore;
  let eventBus: EventBus;

  beforeEach(() => {
    testDir = join(tmpdir(), `confwrite-issue74-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(testDir, 'review'), { recursive: true });
    mkdirSync(join(testDir, 'assets', 'chapter-kits'), { recursive: true });
    
    // 创建初始状态
    const initialState: ProjectState = {
      currentPhase: '4b',
      status: 'reviewing',
      round: 1,  // 全局 round
      chapters: {
        ch001: {
          id: 'ch001',
          title: 'Chapter 1',
          type: 'functional',
          status: 'written',
          round: 1,  // 章节 round
          maxRounds: 5,
          attempt: 0,
          consecutiveFailures: 0,
        },
        ch002: {
          id: 'ch002',
          title: 'Chapter 2',
          type: 'functional',
          status: 'written',
          round: 2,  // 章节 round 已经递增（模拟之前的 validation_failed）
          maxRounds: 5,
          attempt: 0,
          consecutiveFailures: 1,
        },
      },
      tasks: [],
      executionLog: [],
      lastUpdated: new Date().toISOString(),
      totalChapters: 2,
      escalatedToHuman: false,
    };
    
    store = new ProjectStore(testDir);
    store.save(initialState);
    
    // 创建草稿文件（使用 chapter.round）
    writeFileSync(join(testDir, 'drafts', 'chapters', 'ch001-v1.md'), '# Chapter 1\n\nContent for chapter 1.');
    writeFileSync(join(testDir, 'drafts', 'chapters', 'ch002-v2.md'), '# Chapter 2\n\nContent for chapter 2.');
    
    // 创建素材包
    writeFileSync(join(testDir, 'assets', 'chapter-kits', 'ch001-kit.md'), '# Kit for ch001');
    writeFileSync(join(testDir, 'assets', 'chapter-kits', 'ch002-kit.md'), '# Kit for ch002');
    
    eventBus = new EventBus();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('应该使用 chapter.round 创建 reviewer task ID', async () => {
    const scheduler = new SubagentScheduler({ maxConcurrency: 2 });
    const taskExecutor = new TaskExecutor({ writing: { minChapterChars: 3000, maxChapterChars: 8000 } }, testDir, eventBus);
    const writingOrchestrator = new WritingOrchestrator(eventBus);
    
    const dispatcher = new Dispatcher(
      testDir,
      store,
      scheduler,
      taskExecutor,
      writingOrchestrator,
      eventBus,
    );

    const result = await dispatcher.dispatch('spawn_reviewers', {
      chapters: ['ch001', 'ch002'],
      projectDir: testDir,
    });

    // ch001 的 round 是 1，task ID 应该是 review-ch001-r1
    const ch001Task = result.tasks.find(t => t.chapterId === 'ch001');
    expect(ch001Task?.id).toBe('review-ch001-r1');

    // ch002 的 round 是 2，task ID 应该是 review-ch002-r2
    const ch002Task = result.tasks.find(t => t.chapterId === 'ch002');
    expect(ch002Task?.id).toBe('review-ch002-r2');
  });

  it('应该使用 chapter.round 创建 fixer task ID', async () => {
    // 更新状态，让 ch001 处于 reviewed+revise 状态
    const state = store.load()!;
    state.chapters.ch001.status = 'reviewed';
    state.chapters.ch001.lastReviewVerdict = 'revise';
    state.currentPhase = '4d';
    store.save(state);

    const scheduler = new SubagentScheduler({ maxConcurrency: 2 });
    const taskExecutor = new TaskExecutor({ writing: { minChapterChars: 3000, maxChapterChars: 8000 } }, testDir, eventBus);
    const writingOrchestrator = new WritingOrchestrator(eventBus);
    
    const dispatcher = new Dispatcher(
      testDir,
      store,
      scheduler,
      taskExecutor,
      writingOrchestrator,
      eventBus,
    );

    const result = await dispatcher.dispatch('spawn_fixers', {
      chapters: ['ch001'],
      projectDir: testDir,
    });

    // ch001 的 round 是 1，task ID 应该是 fix-ch001-r1
    const ch001Task = result.tasks.find(t => t.chapterId === 'ch001');
    expect(ch001Task?.id).toBe('fix-ch001-r1');
  });

  it('审阅文件查找应该使用 chapter.round', () => {
    // 创建审阅文件（使用 chapter.round）
    writeFileSync(
      join(testDir, 'review', 'ch001-r1.json'),
      JSON.stringify({ verdict: 'accept', confidence: 0.9, reasons: ['Good'] })
    );
    writeFileSync(
      join(testDir, 'review', 'ch002-r2.json'),
      JSON.stringify({ verdict: 'revise', confidence: 0.7, reasons: ['Needs work'] })
    );

    const orchestrator = new WritingOrchestrator(eventBus);
    const state = store.load()!;

    // 模拟 reviewer 任务完成
    const task1 = {
      id: 'review-ch001-r1',
      type: 'reviewer' as const,
      chapterId: 'ch001',
      priority: 1,
      sequence: 1,
      status: 'completed' as const,
      attempt: 0,
      prompt: '',
      dependencies: [],
      result: 'verdict: accept',
    };

    orchestrator.updateChapterStatus(state, task1, 'success', testDir);

    // ch001 应该被标记为 completed（因为 verdict=accept）
    expect(state.chapters.ch001.status).toBe('completed');

    // 模拟 ch002 的 reviewer 任务完成
    const task2 = {
      id: 'review-ch002-r2',
      type: 'reviewer' as const,
      chapterId: 'ch002',
      priority: 1,
      sequence: 1,
      status: 'completed' as const,
      attempt: 0,
      prompt: '',
      dependencies: [],
      result: 'verdict: revise',
    };

    orchestrator.updateChapterStatus(state, task2, 'success', testDir);

    // ch002 应该被标记为 reviewed（因为 verdict=revise，需要 fix）
    expect(state.chapters.ch002.status).toBe('reviewed');
    expect(state.chapters.ch002.lastReviewVerdict).toBe('revise');
  });
});
