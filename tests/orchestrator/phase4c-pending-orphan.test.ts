import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { phases } from '../../src/orchestrator/phases.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import { ProjectStore } from '../../src/state/store.js';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 回归 Bug 3 原始症状：`pending` 孤儿章节（round=1）应触发 4c → 4a。
 *
 * 原始 Bug 3：5 章卡在 `pending(round=1)`，4c 的 → 4a 出口条件要求
 * `ch.round > 1`，导致这些章节永不被重新拾起，4c 死锁。
 *
 * 修复后：4c → 4a 只要存在 `pending` 章节即触发，无论 `round` 值。
 * 本测试验证「pending + round=1」场景同时命中 exit condition 与真实 tick 流转。
 */

function makeChapter(id: string, status: ChapterState['status'], round = 1, verdict?: 'accept' | 'revise' | 'reject'): ChapterState {
  return {
    id,
    title: `Chapter ${id}`,
    status,
    version: 0,
    round,
    attempt: 0,
    lastReviewVerdict: verdict,
  };
}

function createState(chapters: ChapterState[], phase: string = '4c'): ProjectState {
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
    currentPhase: phase as any,
    status: 'reviewing',
    chapters: chapterMap,
    round: 1,
  };
}

describe('Phase 4c → 4a 退出条件（SM-14）', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-4c-orphan-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('存在 pending 章节时应触发 4c → 4a（无论 round 值）', () => {
    // 原始 Bug 3 场景：pending 章节 round=1
    const state = createState([
      makeChapter('ch001', 'pending', 1),
      makeChapter('ch002', 'completed', 2, 'accept'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo4a = phase4c.exits.find(e => e.target === '4a');
    expect(exitTo4a).toBeDefined();
    // 关键：pending + round=1 必须返回 true（原始 Bug 3 症状）
    expect(exitTo4a!.condition(ctx)).toBe(true);
  });

  it('4c → 4a 条件不依赖 round > 1', () => {
    const state = createState([
      makeChapter('ch001', 'pending', 1), // round=1 不应阻止触发
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo4a = phase4c.exits.find(e => e.target === '4a');
    expect(exitTo4a!.condition(ctx)).toBe(true);
  });

  it('真实 tick 流转：pending(round=1) 章节使状态机从 4c advance 到 4a', async () => {
    // 用 ProjectStore 持久化状态，用 StateMachine.tick 验证真实流转
    const store = new ProjectStore(tempDir);
    const state = createState([
      makeChapter('ch001', 'pending', 1), // 原始 Bug 3 孤儿章节
      makeChapter('ch002', 'completed', 2, 'accept'),
    ]);
    store.save(state);

    const sm = new StateMachine(tempDir);
    const result = await sm.tick();

    // tick 应检测到 4c → 4a 的出口条件并 advance 到 4a
    expect(result.advanced).toBe(true);
    expect(result.phase).toBe('4a');

    // 状态已持久化到磁盘
    const persisted = store.load();
    expect(persisted!.currentPhase).toBe('4a');
  });

  it('退出条件纯函数：不修改任何状态', () => {
    const state = createState([
      makeChapter('ch001', 'pending', 1),
    ]);
    const snapshot = JSON.stringify(state.chapters);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };
    const exitTo4a = phase4c.exits.find(e => e.target === '4a');
    // 调用两次，确保幂等且不修改状态
    expect(exitTo4a!.condition(ctx)).toBe(true);
    expect(exitTo4a!.condition(ctx)).toBe(true);
    expect(JSON.stringify(state.chapters)).toBe(snapshot);
  });
});
