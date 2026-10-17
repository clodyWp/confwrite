/**
 * DV-1~DV-2: Finalization 降级可见测试
 * 
 * failureReason 以 exceeded_max_rounds 开头的章节 → finalization.json 包含 degradedChapters
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { finalize } from '../../src/assemble/finalizer.js';
import type { ProjectState } from '../../src/state/schema.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-degraded-test-'));
}

function createProjectStructure(projectDir: string): void {
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'assets'), { recursive: true });
  mkdirSync(join(projectDir, 'assembly'), { recursive: true });

  const content = `# 技术方案

## 第1章 系统概述

本系统采用微服务架构。

## 第2章 架构设计

使用 Kubernetes 部署。

## 第3章 运维方案

运维相关内容。
`;

  writeFileSync(join(projectDir, 'assembly', 'merged-v1.md'), content, 'utf-8');
}

function createState(projectDir: string, chapters: Record<string, { failureReason?: string }>): ProjectState {
  const chapterStates: Record<string, any> = {};
  const titles: Record<string, string> = {
    ch001: '系统概述',
    ch002: '架构设计',
    ch003: '运维方案',
  };

  for (const [id, data] of Object.entries(chapters)) {
    chapterStates[id] = {
      id,
      title: titles[id] || id,
      status: data.failureReason ? 'failed' : 'completed',
      version: 1,
      round: 1,
      attempt: 0,
      consecutiveFailures: 0,
      maxRounds: 5,
      ...(data.failureReason ? { failureReason: data.failureReason } : {}),
    };
  }

  return {
    version: 1,
    project: 'test-project',
    projectDir,
    createdAt: '2024-01-01T00:00:00Z',
    lastUpdated: '2024-01-01T00:00:00Z',
    currentPhase: '7',
    status: 'assembling',
    chapters: chapterStates,
    round: 1,
  };
}

describe('DV: Finalization 降级可见', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('DV-1: failureReason=exceeded_max_rounds_validation → degradedChapters 包含该章节', () => {
    createProjectStructure(projectDir);

    const state = createState(projectDir, {
      ch001: {},
      ch002: { failureReason: 'exceeded_max_rounds_validation' },
      ch003: {},
    });
    writeFileSync(
      join(projectDir, 'project-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );

    const report = finalize(projectDir);

    // Read the finalization.json
    const finalizationPath = join(projectDir, 'output', 'finalization.json');
    expect(existsSync(finalizationPath)).toBe(true);
    const saved = JSON.parse(readFileSync(finalizationPath, 'utf-8'));

    expect(saved.degradedChapters).toBeDefined();
    expect(saved.degradedChapters).toHaveLength(1);
    expect(saved.degradedChapters[0].chapterId).toBe('ch002');
    expect(saved.degradedChapters[0].title).toBe('架构设计');
    expect(saved.degradedChapters[0].failureReason).toBe('exceeded_max_rounds_validation');
  });

  it('DV-1: 多种 exceeded_max_rounds 前缀都应被识别', () => {
    createProjectStructure(projectDir);

    const state = createState(projectDir, {
      ch001: { failureReason: 'exceeded_max_rounds' },
      ch002: { failureReason: 'exceeded_max_rounds_with_output' },
      ch003: { failureReason: 'exceeded_max_rounds_in_4d' },
    });
    writeFileSync(
      join(projectDir, 'project-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );

    finalize(projectDir);

    const finalizationPath = join(projectDir, 'output', 'finalization.json');
    const saved = JSON.parse(readFileSync(finalizationPath, 'utf-8'));

    expect(saved.degradedChapters).toHaveLength(3);
    expect(saved.degradedChapters.map((c: any) => c.chapterId).sort()).toEqual(['ch001', 'ch002', 'ch003']);
  });

  it('DV-2: 无降级章节时 degradedChapters 为空数组', () => {
    createProjectStructure(projectDir);

    const state = createState(projectDir, {
      ch001: {},
      ch002: {},
      ch003: {},
    });
    writeFileSync(
      join(projectDir, 'project-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );

    finalize(projectDir);

    const finalizationPath = join(projectDir, 'output', 'finalization.json');
    const saved = JSON.parse(readFileSync(finalizationPath, 'utf-8'));

    expect(saved.degradedChapters).toEqual([]);
  });

  it('DV-2: 非 exceeded_max_rounds 的 failureReason 不计入降级', () => {
    createProjectStructure(projectDir);

    const state = createState(projectDir, {
      ch001: {},
      ch002: { failureReason: 'too_many_failures' },
      ch003: {},
    });
    writeFileSync(
      join(projectDir, 'project-state.json'),
      JSON.stringify(state, null, 2),
      'utf-8',
    );

    finalize(projectDir);

    const finalizationPath = join(projectDir, 'output', 'finalization.json');
    const saved = JSON.parse(readFileSync(finalizationPath, 'utf-8'));

    expect(saved.degradedChapters).toEqual([]);
  });

  it('project-state.json 不存在时 degradedChapters 为空数组（向后兼容）', () => {
    createProjectStructure(projectDir);
    // No project-state.json

    finalize(projectDir);

    const finalizationPath = join(projectDir, 'output', 'finalization.json');
    const saved = JSON.parse(readFileSync(finalizationPath, 'utf-8'));

    expect(saved.degradedChapters).toEqual([]);
  });
});
