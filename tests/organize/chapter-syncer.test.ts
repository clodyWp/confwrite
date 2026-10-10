/**
 * G1: 大纲→状态自动同步 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { syncChaptersFromOutline, type SyncResult } from '../../src/organize/chapter-syncer.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-sync-test-'));
}

function createInitialState(projectDir: string): ProjectStore {
  const store = new ProjectStore(projectDir);
  const state: ProjectState = {
    version: 1,
    project: 'test-project',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '2',
    status: 'outlining',
    chapters: {},
    round: 1,
  };
  store.save(state);
  return store;
}

describe('syncChaptersFromOutline', () => {
  let projectDir: string;
  let store: ProjectStore;

  beforeEach(() => {
    projectDir = makeTempDir();
    store = createInitialState(projectDir);
  });

  it('should add new chapters from outline as pending', () => {
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
ch002 架构设计
ch003 部署方案
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual(['ch001', 'ch002', 'ch003']);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);

    const state = store.load()!;
    expect(Object.keys(state.chapters)).toHaveLength(3);
    expect(state.chapters['ch001'].status).toBe('pending');
    expect(state.chapters['ch001'].title).toBe('系统概述');
    expect(state.chapters['ch002'].title).toBe('架构设计');
    expect(state.chapters['ch003'].title).toBe('部署方案');
  });

  it('should remove chapters not in outline (only if still pending)', () => {
    // Start with 3 chapters
    const state = store.load()!;
    state.chapters = {
      ch001: { id: 'ch001', title: '系统概述', status: 'pending', version: 0, round: 1, attempt: 0 },
      ch002: { id: 'ch002', title: '架构设计', status: 'pending', version: 0, round: 1, attempt: 0 },
      ch003: { id: 'ch003', title: '部署方案', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    store.save(state);

    // Outline now only has ch001 and ch003
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
ch003 部署方案
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(['ch002']);
    expect(result.skipped).toEqual([]);

    const finalState = store.load()!;
    expect(Object.keys(finalState.chapters)).toHaveLength(2);
    expect(finalState.chapters['ch002']).toBeUndefined();
  });

  it('should NOT remove chapters that are already writing/written/completed', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: { id: 'ch001', title: '系统概述', status: 'completed', version: 0, round: 1, attempt: 0 },
      ch002: { id: 'ch002', title: '架构设计', status: 'writing', version: 0, round: 1, attempt: 0 },
      ch003: { id: 'ch003', title: '部署方案', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    store.save(state);

    // Outline only has ch001
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
`);

    const result = syncChaptersFromOutline(projectDir, store);

    // ch002 (writing) is protected, ch003 (pending) is removed
    expect(result.removed).toEqual(['ch003']);
    expect(result.skipped).toEqual(['ch002']);

    const finalState = store.load()!;
    expect(finalState.chapters['ch002']).toBeDefined();  // protected
    expect(finalState.chapters['ch003']).toBeUndefined(); // removed
  });

  it('should update titles when they change in outline', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: { id: 'ch001', title: '旧标题', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    store.save(state);

    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 新标题
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.updated).toEqual(['ch001']);
    const finalState = store.load()!;
    expect(finalState.chapters['ch001'].title).toBe('新标题');
  });

  it('should preserve existing state for unchanged chapters', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: {
        id: 'ch001',
        title: '系统概述',
        status: 'completed',
        version: 0,
        round: 2,
        attempt: 3,
        lastReviewVerdict: 'accept',
      },
    };
    store.save(state);

    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.updated).toEqual([]);

    const finalState = store.load()!;
    expect(finalState.chapters['ch001'].status).toBe('completed');
    expect(finalState.chapters['ch001'].round).toBe(2);
    expect(finalState.chapters['ch001'].attempt).toBe(3);
  });

  it('should handle empty outline gracefully', () => {
    writeFileSync(join(projectDir, 'outline.md'), '# 技术方案\n\n暂无章节。\n');

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('should handle missing outline file', () => {
    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.error).toBe('outline_not_found');
  });

  it('should update totalChapters in state', () => {
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
ch002 架构设计
`);

    syncChaptersFromOutline(projectDir, store);

    const state = store.load()!;
    expect(state.totalChapters).toBe(2);
  });

  it('should handle adding chapters to existing state', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: { id: 'ch001', title: '系统概述', status: 'completed', version: 0, round: 1, attempt: 0 },
    };
    state.totalChapters = 1;
    store.save(state);

    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
ch002 架构设计
ch003 部署方案
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual(['ch002', 'ch003']);
    const finalState = store.load()!;
    expect(Object.keys(finalState.chapters)).toHaveLength(3);
    expect(finalState.totalChapters).toBe(3);
  });

  it('should sync wordBudget from outline to new chapters', () => {
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
本章类型: functional。重要度: 3/5。
字数预算: 5000-8000字

ch002 架构设计
本章类型: architecture。重要度: 4/5。
字数预算: 8000-12000字
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.added).toEqual(['ch001', 'ch002']);
    const state = store.load()!;
    expect(state.chapters['ch001'].wordBudget).toEqual({ min: 5000, max: 8000 });
    expect(state.chapters['ch001'].importance).toBe(3);
    expect(state.chapters['ch001'].type).toBe('functional');
    expect(state.chapters['ch002'].wordBudget).toEqual({ min: 8000, max: 12000 });
    expect(state.chapters['ch002'].importance).toBe(4);
    expect(state.chapters['ch002'].type).toBe('architecture');
  });

  it('should update wordBudget for existing chapters if they lack it', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: { id: 'ch001', title: '系统概述', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    store.save(state);

    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
字数预算: 5000-8000字
重要度: 3/5
`);

    const result = syncChaptersFromOutline(projectDir, store);

    expect(result.updated).toEqual(['ch001']);
    const finalState = store.load()!;
    expect(finalState.chapters['ch001'].wordBudget).toEqual({ min: 5000, max: 8000 });
    expect(finalState.chapters['ch001'].importance).toBe(3);
  });

  it('should NOT overwrite existing wordBudget in state', () => {
    const state = store.load()!;
    state.chapters = {
      ch001: {
        id: 'ch001',
        title: '系统概述',
        status: 'pending',
        version: 0,
        round: 1,
        attempt: 0,
        wordBudget: { min: 10000, max: 15000 },
      },
    };
    store.save(state);

    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案
ch001 系统概述
字数预算: 5000-8000字
`);

    syncChaptersFromOutline(projectDir, store);

    const finalState = store.load()!;
    // Should keep existing wordBudget, not overwrite with outline's
    expect(finalState.chapters['ch001'].wordBudget).toEqual({ min: 10000, max: 15000 });
  });
});
