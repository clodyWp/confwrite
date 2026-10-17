/**
 * DG-1~DG-4: Dispatcher 无进展护栏测试
 * 
 * 连续 2 次相同指纹失败后，第 3 次派发改为 fixer
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import type { ProjectState } from '../../src/state/schema.js';

const TEST_DIR = 'tests/tmp/no-progress-redispatch-test';

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
        consecutiveFailures: 0,
        maxRounds: 5,
        wordBudget: { min: 5000, max: 8000 },
      },
    },
    round: 1,
  };
}

describe('DG: Dispatcher 无进展护栏', () => {
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

    // Create chapter kit
    writeFileSync(
      join(TEST_DIR, 'assets', 'chapter-kits', 'ch001.md'),
      '# ch001 素材包：项目概述\n\n## 关键数据\n- 性能: 99.9%'
    );

    // Create a draft (same content each time → same fingerprint)
    writeFileSync(
      join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'),
      '# ch001 项目概述\n\n这是不变的草稿内容。'
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

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('DG-2: 连续 2 次相同指纹失败后，第 3 次派发 fixer 而非 writer', async () => {
    // 1st dispatch: writer for ch001
    const result1 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result1.tasks[0].type).toBe('writer');

    // 1st failure
    await dispatcher.processTask(result1.tasks[0].id, 'failed', 'content unchanged');

    // 2nd dispatch: same fingerprint (same draft content, same round, same type) → still writer (count=1)
    const result2 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result2.tasks[0].type).toBe('writer');

    // 2nd failure
    await dispatcher.processTask(result2.tasks[0].id, 'failed', 'content unchanged again');

    // 3rd dispatch: same fingerprint → guardrail triggers → should dispatch fixer
    const result3 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result3.tasks[0].type).toBe('fixer');
    expect(result3.message).toContain('护栏');
  });

  it('DG-4: 成功时重置指纹失败计数', async () => {
    // 1st dispatch + failure
    const result1 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    await dispatcher.processTask(result1.tasks[0].id, 'failed', 'fail 1');

    // 2nd dispatch + success → resets fingerprint counter
    const result2 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    await dispatcher.processTask(result2.tasks[0].id, 'success', 'done');

    // 3rd dispatch: should be writer again (counter was reset)
    const result3 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result3.tasks[0].type).toBe('writer');
  });

  it('不同内容（不同指纹）不触发护栏', async () => {
    // 1st dispatch + failure
    const result1 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    await dispatcher.processTask(result1.tasks[0].id, 'failed', 'fail 1');

    // Change draft content → different fingerprint
    writeFileSync(
      join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'),
      '# ch001 项目概述\n\n这是**新的**草稿内容。'
    );

    // 2nd dispatch: different fingerprint → still writer
    const result2 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result2.tasks[0].type).toBe('writer');

    // 2nd failure with new fingerprint
    await dispatcher.processTask(result2.tasks[0].id, 'failed', 'fail 2');

    // 3rd dispatch: new fingerprint count is only 1 → still writer
    const result3 = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(result3.tasks[0].type).toBe('writer');
  });
});
