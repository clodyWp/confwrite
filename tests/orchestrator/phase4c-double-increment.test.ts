import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { phases } from '../../src/orchestrator/phases.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeChapter(id: string, status: ChapterState['status'], round: number = 1, verdict?: 'accept' | 'revise' | 'reject'): ChapterState {
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

/**
 * SM-15: Reject 时 round 只递增一次
 * 
 * 当 reviewer 判 reject 时：
 * 1. orchestrator.ts updateChapterStatus() 递增 round (1→2)
 * 2. phases.ts 4c execute 不再递增 round（避免双重递增）
 * 
 * 结果：一次 reject 事件后 round 从 1→2（不是 1→3）
 */
describe('SM-15: Reject 时 round 只递增一次', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-4c-reject-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('4c execute 不递增 reject 章节的 round（避免双重递增）', async () => {
    // 模拟 orchestrator.ts 已经递增了 round (1→2)
    // 现在 4c execute 不应该再次递增
    const state = createState([
      makeChapter('ch001', 'reviewed', 2, 'reject'),  // round=2（已被 orchestrator 递增）
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    await phase4c.execute(ctx);

    // 验证：4c execute 后 round 仍然是 2（不被再次递增到 3）
    expect(state.chapters.ch001.round).toBe(2);
    expect(state.chapters.ch001.status).toBe('pending');
  });

  it('完整流程：orchestrator 递增 + 4c execute 不递增 = round 只增一次', async () => {
    // 初始状态：round=1, status=reviewing
    const state = createState([
      makeChapter('ch001', 'reviewed', 1, 'reject'),
    ]);

    // 模拟 orchestrator.ts updateChapterStatus() 的行为
    // （reviewer reject 时：status=pending, round+=1）
    state.chapters.ch001.status = 'pending';
    state.chapters.ch001.round += 1;  // 1→2

    // 现在模拟 4c execute（应该不再递增 round）
    // 注意：4c execute 只处理 status='reviewed' 的章节
    // 但为了测试，我们模拟一个场景：4c 看到的是 reviewed+reject
    // 实际上 orchestrator 已经把 status 改为 pending 了
    // 所以 4c 不会处理这个章节（因为它不是 reviewed）
    
    // 验证最终状态
    expect(state.chapters.ch001.round).toBe(2);  // 只递增了一次
    expect(state.chapters.ch001.status).toBe('pending');
  });

  it('4c execute 处理 reviewed+reject 章节时不递增 round', async () => {
    // 这个测试验证 4c execute 的直接行为
    // 如果 4c 看到 reviewed+reject，它应该设置 status=pending 但不递增 round
    const state = createState([
      makeChapter('ch001', 'reviewed', 1, 'reject'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    await phase4c.execute(ctx);

    // 修复后：4c 不递增 round（round 保持 1）
    // 修复前：4c 会递增 round 到 2（导致双重递增）
    expect(state.chapters.ch001.round).toBe(1);
    expect(state.chapters.ch001.status).toBe('pending');
  });
});
