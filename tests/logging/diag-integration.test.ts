/**
 * LOG-4: DIAG 日志必须通过 EventBus emit
 * 
 * 验证 DIAG 日志不再直接写入独立文件，而是通过 EventBus 统一传递。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LoggingSystem } from '../../src/logging/index.js';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/types.js';
import type { LogEvent } from '../../src/logging/types.js';

const TEST_DIR = join(process.cwd(), 'test-debug', 'diag-integration');

describe('LOG-4: DIAG 日志必须通过 EventBus emit', () => {
  let loggingSystem: LoggingSystem;
  let store: ProjectStore;
  let scheduler: SubagentScheduler;
  let taskExecutor: TaskExecutor;
  let writingOrchestrator: WritingOrchestrator;
  let dispatcher: Dispatcher;
  let capturedEvents: LogEvent[];

  beforeEach(() => {
    // 创建测试目录
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, 'assets', 'chapter-kits'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'logs'), { recursive: true });

    // 创建初始状态
    const initialState: ProjectState = {
      currentPhase: '4a',
      lastUpdated: new Date().toISOString(),
      chapters: {
        ch001: {
          id: 'ch001',
          title: '测试章节',
          status: 'pending',
          round: 1,
          wordBudget: { min: 5000, max: 15000 },
        },
      },
    };

    // 初始化组件
    store = new ProjectStore(TEST_DIR);
    store.save(initialState);

    capturedEvents = [];
    loggingSystem = new LoggingSystem(
      () => {}, // noop notify
      { enabled: true, projectDir: TEST_DIR }
    );

    // 收集所有事件
    loggingSystem.eventBus.subscribe('*', (event) => {
      capturedEvents.push(event);
    });

    scheduler = new SubagentScheduler();
    taskExecutor = new TaskExecutor(undefined, TEST_DIR, loggingSystem.eventBus);
    writingOrchestrator = new WritingOrchestrator();
    dispatcher = new Dispatcher(
      TEST_DIR,
      store,
      scheduler,
      taskExecutor,
      writingOrchestrator,
      loggingSystem.eventBus
    );
  });

  afterEach(() => {
    loggingSystem.dispose();
    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('wordBudget 传递通过 EventBus emit diag.wordbudget 事件', async () => {
    // 创建素材包文件
    const kitPath = join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(kitPath, '# 测试章节\n\n测试内容', 'utf-8');

    // 触发 dispatchWriters
    await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 });

    // 验证捕获到 diag.wordbudget 事件
    const wordBudgetEvents = capturedEvents.filter(
      (e) => e.type === 'diag.wordbudget'
    );
    expect(wordBudgetEvents.length).toBeGreaterThan(0);

    // 验证事件内容
    const event = wordBudgetEvents[0] as any;
    expect(event.chapterId).toBe('ch001');
    expect(event.wordBudget).toEqual({ min: 5000, max: 15000 });
    expect(event.source).toBe('dispatcher.dispatchWriters');
    expect(event.timestamp).toBeDefined();
  });

  it('task-executor DIAG 通过 EventBus emit diag.taskexecutor 事件', async () => {
    // 创建素材包文件
    const kitPath = join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(kitPath, '# 测试章节\n\n测试内容', 'utf-8');

    // 触发 dispatchWriters（会调用 generateWriterPrompt）
    await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 });

    // 验证捕获到 diag.taskexecutor 事件
    const taskExecutorEvents = capturedEvents.filter(
      (e) => e.type === 'diag.taskexecutor'
    );
    expect(taskExecutorEvents.length).toBeGreaterThan(0);

    // 验证事件内容
    const event = taskExecutorEvents[0] as any;
    expect(event.chapterId).toBe('ch001');
    expect(event.wordBudget).toEqual({ min: 5000, max: 15000 });
    expect(event.timestamp).toBeDefined();
  });

  it('没有独立的 diag-*.json 文件写入', async () => {
    // 创建素材包文件
    const kitPath = join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md');
    const { writeFileSync, existsSync: exists } = await import('node:fs');
    writeFileSync(kitPath, '# 测试章节\n\n测试内容', 'utf-8');

    // 触发 dispatchWriters
    await dispatcher.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 });

    // 验证没有写入独立的 diag 文件
    const diagWordBudgetPath = join(TEST_DIR, 'logs', 'diag-wordbudget.json');
    const diagTaskExecutorPath = join(TEST_DIR, 'logs', 'diag-task-executor.json');

    expect(exists(diagWordBudgetPath)).toBe(false);
    expect(exists(diagTaskExecutorPath)).toBe(false);
  });

  it('EventBus 未传递时不报错（向后兼容）', async () => {
    // 创建不带 EventBus 的组件
    const taskExecutorNoBus = new TaskExecutor(undefined, TEST_DIR);
    const dispatcherNoBus = new Dispatcher(
      TEST_DIR,
      store,
      scheduler,
      taskExecutorNoBus,
      writingOrchestrator
      // 不传 eventBus
    );

    // 创建素材包文件
    const kitPath = join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(kitPath, '# 测试章节\n\n测试内容', 'utf-8');

    // 应该不报错
    await expect(
      dispatcherNoBus.dispatch('spawn_writers', { chapters: ['ch001'], round: 1 })
    ).resolves.toBeDefined();
  });
});
