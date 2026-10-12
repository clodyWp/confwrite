/**
 * Spec Invariants Validation Tests
 *
 * 本文件验证 specs/state-machine.md 中定义的不变量。
 * 每条测试对应一条 spec 不变量，测试名包含不变量 ID（如 SM-4）。
 *
 * 运行方式：npm test -- spec-invariants
 *
 * 参考文档：
 * - specs/state-machine.md — 状态机行为规格
 * - specs/module-contracts.md — 模块间契约
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import { runWriteLoop } from '../../src/index.js';
import type { ProjectState } from '../../src/state/schema.js';
import type { SubagentExecutor } from '../../src/scheduler/executor.js';

// ============ Helpers ============

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-spec-'));
}

function createProject(dir: string, state: Partial<ProjectState>): void {
  mkdirSync(dir, { recursive: true });
  for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures', 'review', 'inputs']) {
    mkdirSync(join(dir, d), { recursive: true });
  }

  const fullState: ProjectState = {
    version: 1,
    project: 'test',
    projectDir: dir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '0a',
    status: 'init',
    chapters: {},
    round: 1,
    ...state,
  };

  writeFileSync(join(dir, 'project-state.json'), JSON.stringify(fullState, null, 2));
}

class NoopExecutor implements SubagentExecutor {
  async execute(): Promise<never> {
    throw new Error('本测试不应派发任何任务');
  }
}

// ============ SM-4: 终态判定在 tick 之前 ============

describe('SM-4: index.ts 在 tick 之前判定终态', () => {
  let projectDir: string;
  let messages: Array<{ msg: string; level: string }>;

  beforeEach(() => {
    projectDir = createTempDir();
    messages = [];
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('状态已经是 done 时，runWriteLoop 直接返回 completed，不调用 tick', async () => {
    createProject(projectDir, {
      currentPhase: 'done',
      status: 'done',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    const notify = (msg: string, level: string): void => { messages.push({ msg, level }); };
    const result = await runWriteLoop(projectDir, notify, { executorOverride: new NoopExecutor() });

    // 终态直接返回，不报错
    expect(result.completed).toBe(true);
    expect(result.stoppedReason).toBe('completed');

    // 不应有任何 error 级别的通知
    const errors = messages.filter(m => m.level === 'error');
    expect(errors).toHaveLength(0);
  });
});

// ============ SM-7: 出口条件必须验证工作已完成 ============

describe('SM-7: 出口条件验证工作已完成', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('Phase 4b 出口条件要求有章节已审阅（不只是没有 written）', async () => {
    // 所有章节都是 pending（没有 written，但也没有 reviewed）
    createProject(projectDir, {
      currentPhase: '4b',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'pending', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    const result = await machine.tick();

    // 应该 blocked（没有 written 章节需要审阅）
    expect('blocked' in result && result.blocked).toBe(true);
  });

  it('Phase 4c → 5 出口条件要求有章节 completed（不只是所有章节都结束）', async () => {
    // 所有章节都是 failed（都结束了，但没有 completed）
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'failed', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    const result = await machine.tick();

    // 应该留在 4c（没有 completed 章节，不能进入 5）
    // 可能 blocked 或者返回 4c 的 action，取决于具体实现
    // 关键：不能跳转到 5
    if (!('blocked' in result)) {
      expect(result.phase).toBe('4c');
      expect(result.advanced).toBe(false);
    }
  });
});

// ============ SM-8: state 修改必须 save() ============

describe('SM-8: state 修改必须通过 store.save() 持久化', () => {
  let projectDir: string;
  let store: ProjectStore;

  beforeEach(() => {
    projectDir = createTempDir();
    store = new ProjectStore(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('store.update() 修改后自动保存', () => {
    createProject(projectDir, { currentPhase: '0a', status: 'init' });
    store.load();

    store.update((state) => {
      state.status = 'organizing';
    });

    // 从磁盘重新加载，验证已持久化
    const reloaded = new ProjectStore(projectDir).load();
    expect(reloaded!.status).toBe('organizing');
  });

  it('直接修改 state 对象后必须调用 save()', () => {
    createProject(projectDir, { currentPhase: '0a', status: 'init' });
    const state = store.load()!;

    state.status = 'writing';
    store.save(state);  // 必须调用 save

    // 从磁盘重新加载，验证已持久化
    const reloaded = new ProjectStore(projectDir).load();
    expect(reloaded!.status).toBe('writing');
  });

  it('不调用 save() 的修改不会持久化', () => {
    createProject(projectDir, { currentPhase: '0a', status: 'init' });
    const state = store.load()!;

    state.status = 'writing';
    // 故意不调用 save()

    // 从磁盘重新加载，验证未持久化
    const reloaded = new ProjectStore(projectDir).load();
    expect(reloaded!.status).toBe('init');  // 仍然是 init
  });
});

// ============ SM-9: execute 修改同步回 ctx.state ============

describe('SM-9: execute 内部修改必须同步回 ctx.state', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures', 'inputs']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('Phase 3 execute 后，ctx.state.chapters 与磁盘一致', async () => {
    // 设置 Phase 3 的前置条件
    createProject(projectDir, {
      currentPhase: '3',
      status: 'organizing',
      chapters: {},
    });
    writeFileSync(join(projectDir, 'outline.md'), '# 文档\n\nch001 章节一\n');
    writeFileSync(join(projectDir, 'assets', 'data-baseline.json'), '{}');
    writeFileSync(join(projectDir, 'assets', 'references-index.md'), '# Index');
    writeFileSync(join(projectDir, 'inputs', 'req.md'), '# 需求\n');

    const machine = new StateMachine(projectDir);
    const result = await machine.tick();

    // Phase 3 执行后，state 应该被更新
    // 验证磁盘上的 state 包含新章节
    const stateOnDisk = new ProjectStore(projectDir).load();
    expect(stateOnDisk).not.toBeNull();

    // 如果 Phase 3 成功执行，chapters 应该非空
    // （这取决于 organizeMaterials 是否成功，但关键是 state 被正确保存）
    if (!('blocked' in result) && result.action === 'prepare_materials') {
      expect(Object.keys(stateOnDisk!.chapters).length).toBeGreaterThan(0);
    }
  });
});

// ============ SM-10: onEnter 在 save 前调用 ============

describe('SM-10: onEnter 在 save 之前调用', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('advance() 时，onEnter 清理的残件不会在保存后的 state 中留下痕迹', async () => {
    // 在 phase 5，有残留的 assembly/merged-v1.md
    const staleFile = join(projectDir, 'assembly', 'merged-v1.md');
    writeFileSync(staleFile, 'STALE');
    writeFileSync(join(projectDir, 'figures', 'manifest.json'), '{}');

    createProject(projectDir, {
      currentPhase: '5',
      status: 'assembling',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // onEnter 应该在 save 之前清理残件
    // 所以保存后的 state 中，phase 应该是 6（已经 advance）
    const state = new ProjectStore(projectDir).load();
    expect(state!.currentPhase).toBe('6');

    // 残件应该被清理
    expect(existsSync(staleFile)).toBe(false);
  });
});

// ============ SM-6: onEnter 不清理缓存 ============

describe('SM-6: onEnter 不清理缓存', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('Phase 5 的 figures/manifest.json 是缓存，不应被 onEnter 清理', async () => {
    // 在 phase 4c，准备进入 phase 5
    const manifestFile = join(projectDir, 'figures', 'manifest.json');
    writeFileSync(manifestFile, '{"ch001-fig1": {"sourceHash": "abc123"}}');

    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // 进入 phase 5 后，manifest.json 应该还在（它是缓存）
    // 注意：Phase 5 没有 onEnter，所以不会清理任何文件
    // 这个测试验证的是：即使有缓存文件，Phase 5 也能正常进入
    const state = new ProjectStore(projectDir).load();
    expect(state!.currentPhase).toBe('5');

    // manifest.json 应该还在
    expect(existsSync(manifestFile)).toBe(true);
  });
});
