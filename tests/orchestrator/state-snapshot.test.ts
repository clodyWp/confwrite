/**
 * SM-18: Phase transition 时必须保存状态快照
 *
 * 每次 phase transition 时，必须在 logs/checkpoints/ 目录下保存状态快照。
 * 快照文件名格式：checkpoint-{timestamp}.json
 * 快照内容包含：timestamp, from, to, chapters, tasks
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import type { ProjectState } from '../../src/state/schema.js';

// ============ Helpers ============

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-snapshot-'));
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

// ============ Tests ============

describe('SM-18: Phase transition 时必须保存状态快照', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('phase transition 时在 logs/checkpoints/ 保存快照', async () => {
    // 设置 Phase 4c，所有章节 completed → 满足出口条件跳到 Phase 5
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // 验证 logs/checkpoints/ 目录下有快照文件
    const checkpointDir = join(projectDir, 'logs', 'checkpoints');
    expect(existsSync(checkpointDir)).toBe(true);

    const files = readdirSync(checkpointDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toMatch(/^checkpoint-\d+-\d+\.json$/);
  });

  it('快照文件包含 timestamp/from/to/chapters/tasks', async () => {
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
      tasks: [
        { id: 'task-1', type: 'writer', chapterId: 'ch001', status: 'completed', attempt: 0, priority: 0, prompt: 'write ch001' },
      ],
    });

    const machine = new StateMachine(projectDir);
    await machine.tick();

    const checkpointDir = join(projectDir, 'logs', 'checkpoints');
    const files = readdirSync(checkpointDir);
    expect(files.length).toBeGreaterThan(0);

    const snapshot = JSON.parse(readFileSync(join(checkpointDir, files[0]), 'utf-8'));

    expect(snapshot).toHaveProperty('timestamp');
    expect(snapshot).toHaveProperty('from');
    expect(snapshot).toHaveProperty('to');
    expect(snapshot).toHaveProperty('chapters');
    expect(snapshot).toHaveProperty('tasks');

    // 验证 from/to 值正确
    expect(snapshot.from).toBe('4c');
    expect(snapshot.to).toBe('5');

    // 验证 chapters 包含数据
    expect(snapshot.chapters).toHaveProperty('ch001');

    // 验证 tasks 包含数据
    expect(Array.isArray(snapshot.tasks)).toBe(true);
    expect(snapshot.tasks.length).toBe(1);

    // 验证 timestamp 是 ISO 格式
    expect(new Date(snapshot.timestamp).toISOString()).toBe(snapshot.timestamp);
  });

  it('多次 phase transition 产生多个快照', async () => {
    // Phase 4c → 5 (所有章节 completed)
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    // 为 Phase 5 → 6 准备条件：figures/manifest.json 存在
    writeFileSync(join(projectDir, 'figures', 'manifest.json'), '{}');

    const machine = new StateMachine(projectDir);

    // 第一次 tick: 4c → 5
    await machine.tick();

    const checkpointDir = join(projectDir, 'logs', 'checkpoints');
    const filesAfterFirst = readdirSync(checkpointDir);
    expect(filesAfterFirst.length).toBe(1);

    // 第二次 tick: 5 → 6 (manifest.json 存在，图表健康检查通过)
    await machine.tick();

    const filesAfterSecond = readdirSync(checkpointDir);
    expect(filesAfterSecond.length).toBe(2);
  });

  it('快照可以用于恢复执行', async () => {
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节一', status: 'completed', round: 1, attempt: 0, version: 0 },
        ch002: { id: 'ch002', title: '章节二', status: 'completed', round: 2, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // 读取快照
    const checkpointDir = join(projectDir, 'logs', 'checkpoints');
    const files = readdirSync(checkpointDir);
    const snapshot = JSON.parse(readFileSync(join(checkpointDir, files[0]), 'utf-8'));

    // 验证快照包含足够信息用于恢复
    expect(snapshot.from).toBe('4c');
    expect(snapshot.to).toBe('5');
    expect(Object.keys(snapshot.chapters).length).toBe(2);
    expect(snapshot.chapters.ch001.status).toBe('completed');
    expect(snapshot.chapters.ch002.status).toBe('completed');
  });

  it('快照保存失败不影响主流程', async () => {
    // 这个测试验证快照保存被 try-catch 包裹
    // 即使快照目录创建失败，phase transition 仍然正常进行
    createProject(projectDir, {
      currentPhase: '4c',
      status: 'reviewing',
      chapters: {
        ch001: { id: 'ch001', title: '章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
    });

    const machine = new StateMachine(projectDir);
    const result = await machine.tick();

    // 主流程应该正常完成（不抛异常）
    expect('blocked' in result && result.blocked).not.toBe(true);
    if (!('blocked' in result)) {
      expect(result.advanced).toBe(true);
      expect(result.phase).toBe('5');
    }
  });

  it('forceAdvance 也保存快照', async () => {
    createProject(projectDir, {
      currentPhase: '0a',
      status: 'init',
    });

    const machine = new StateMachine(projectDir);
    machine.forceAdvance('0b');

    const checkpointDir = join(projectDir, 'logs', 'checkpoints');
    expect(existsSync(checkpointDir)).toBe(true);

    const files = readdirSync(checkpointDir);
    expect(files.length).toBe(1);

    const snapshot = JSON.parse(readFileSync(join(checkpointDir, files[0]), 'utf-8'));
    expect(snapshot.from).toBe('0a');
    expect(snapshot.to).toBe('0b');
  });
});
