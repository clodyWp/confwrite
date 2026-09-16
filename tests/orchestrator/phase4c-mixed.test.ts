import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { phases } from '../../src/orchestrator/phases.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeChapter(id: string, status: ChapterState['status'], verdict?: 'accept' | 'revise' | 'reject'): ChapterState {
  return {
    id,
    title: `Chapter ${id}`,
    status,
    version: 0,
    round: 1,
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

describe('Phase 4c — exit conditions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-4c-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exit to 4d when some chapters have verdict=revise', () => {
    const state = createState([
      makeChapter('ch001', 'reviewed', 'revise'),
      makeChapter('ch002', 'completed', 'accept'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    // Check exit conditions
    const exitTo4d = phase4c.exits.find(e => e.target === '4d');
    expect(exitTo4d).toBeDefined();
    expect(exitTo4d!.condition(ctx)).toBe(true);
  });

  it('exit to 5 when all chapters are completed', () => {
    const state = createState([
      makeChapter('ch001', 'completed', 'accept'),
      makeChapter('ch002', 'completed', 'accept'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo5 = phase4c.exits.find(e => e.target === '5');
    expect(exitTo5).toBeDefined();
    expect(exitTo5!.condition(ctx)).toBe(true);
  });

  it('no exit to 4d when no chapters have verdict=revise', () => {
    const state = createState([
      makeChapter('ch001', 'reviewed', 'reject'),
      makeChapter('ch002', 'completed', 'accept'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo4d = phase4c.exits.find(e => e.target === '4d');
    expect(exitTo4d!.condition(ctx)).toBe(false);
  });
});

describe('Phase 4c — execute processes chapters', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-4c-exec-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('execute processes reject chapters: sets status=pending, round+1', async () => {
    const state = createState([
      makeChapter('ch001', 'reviewed', 'reject'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    await phase4c.execute(ctx);

    expect(state.chapters.ch001.status).toBe('pending');
    expect(state.chapters.ch001.round).toBe(2);
  });

  it('execute counts pass/revise/reject correctly', async () => {
    const state = createState([
      makeChapter('ch001', 'reviewed', 'revise'),
      makeChapter('ch002', 'reviewed', 'reject'),
      makeChapter('ch003', 'reviewed', 'accept'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    const result = await phase4c.execute(ctx);

    expect(result.params).toEqual({ pass: 1, revise: 1, reject: 1 });
  });

  it('execute leaves revise chapters as reviewed (for 4d to handle)', async () => {
    const state = createState([
      makeChapter('ch001', 'reviewed', 'revise'),
    ]);

    const phase4c = phases.get('4c')!;
    const ctx = { state, projectDir: tempDir };

    await phase4c.execute(ctx);

    expect(state.chapters.ch001.status).toBe('reviewed');
  });
});
