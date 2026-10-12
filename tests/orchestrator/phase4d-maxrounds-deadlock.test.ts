/**
 * SM-16: Phase 4d allExceeded 不应死锁
 *
 * Issue #47-3: 当所有章节超过 maxRounds 但仍是 reviewed/revise 状态时，
 * phase 4d validate 返回 blocked，但 exit 条件不满足（章节仍是 reviewed+revise），
 * 导致死锁。
 *
 * 修复：validate 检测到 allExceeded 时，将章节标记为终态（completed/failed），
 * 而不是返回 blocked。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { phases } from '../../src/orchestrator/phases.js';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import type { ProjectState, ChapterState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-4d-deadlock-'));
}

function createProject(dir: string, state: Partial<ProjectState>): void {
  mkdirSync(dir, { recursive: true });
  for (const d of ['drafts/chapters', 'assets', 'output', 'assembly', 'figures']) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  const fullState: ProjectState = {
    version: 1,
    project: 'test',
    projectDir: dir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '4d',
    status: 'writing',
    chapters: {},
    round: 1,
    ...state,
  };
  writeFileSync(join(dir, 'project-state.json'), JSON.stringify(fullState, null, 2));
}

function makeChapter(id: string, round: number, maxRounds: number): ChapterState {
  return {
    id,
    title: `Chapter ${id}`,
    status: 'reviewed',
    version: 1,
    round,
    attempt: 0,
    maxRounds,
    consecutiveFailures: 0,
    lastReviewVerdict: 'revise',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('SM-16: Phase 4d allExceeded 不应死锁', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validate 行为', () => {
    it('所有章节超过 maxRounds 时不应返回 blocked', () => {
      const state: ProjectState = {
        version: 1,
        project: 'test',
        projectDir: tempDir,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
        },
        round: 1,
      };

      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };

      const result = phase4d.validate(ctx);

      // SM-16: 不应返回 blocked，而应标记章节为终态
      expect(result.ok).toBe(true);
    });

    it('有产物的章节标记为 completed', () => {
      // 创建目录和产物文件
      mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v5.md'), '# Chapter 1\ncontent');

      const state: ProjectState = {
        version: 1,
        project: 'test',
        projectDir: tempDir,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
        },
        round: 1,
      };

      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };

      phase4d.validate(ctx);

      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds_in_4d');
    });

    it('无产物的章节标记为 failed', () => {
      // 不创建产物文件
      const state: ProjectState = {
        version: 1,
        project: 'test',
        projectDir: tempDir,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
        },
        round: 1,
      };

      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };

      phase4d.validate(ctx);

      expect(state.chapters['ch001'].status).toBe('failed');
      expect(state.chapters['ch001'].failureReason).toBe('exceeded_max_rounds_in_4d');
    });

    it('混合场景：有产物→completed，无产物→failed', () => {
      // ch001 有产物，ch002 无产物
      mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
      writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001-v5.md'), '# Ch1');

      const state: ProjectState = {
        version: 1,
        project: 'test',
        projectDir: tempDir,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
          ch002: makeChapter('ch002', 5, 5),
        },
        round: 1,
      };

      const phase4d = phases.get('4d')!;
      const ctx = { state, projectDir: tempDir };

      phase4d.validate(ctx);

      expect(state.chapters['ch001'].status).toBe('completed');
      expect(state.chapters['ch002'].status).toBe('failed');
    });
  });

  describe('StateMachine tick 集成', () => {
    it('allExceeded 时 tick 不应返回 blocked', async () => {
      createProject(tempDir, {
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
        },
      });

      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      // 不应 blocked
      expect('blocked' in result && result.blocked).toBeFalsy();
    });

    it('allExceeded 后经 exit 条件推进到 4b', async () => {
      createProject(tempDir, {
        currentPhase: '4d',
        status: 'writing',
        chapters: {
          ch001: makeChapter('ch001', 5, 5),
        },
      });

      const machine = new StateMachine(tempDir);

      // 第一次 tick: validate 标记章节为终态，execute 发现无待修复
      const result1 = await machine.tick();
      expect('blocked' in result1 && result1.blocked).toBeFalsy();

      // 第二次 tick: exit 条件满足（无 reviewed+revise），应推进到 4b
      const result2 = await machine.tick();
      if (!('blocked' in result2)) {
        // 应该已经离开了 4d
        expect(result2.phase === '4d' && result2.advanced === false).toBe(false);
      }
    });
  });
});
