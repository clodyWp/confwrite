import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Phase1RequirementAnalysis } from '../../src/orchestrator/phase1.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-phase1-transition-'));
}

function createMinimalState(projectDir: string): ProjectState {
  return {
    version: 1,
    project: 'test-project',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '1',
    status: 'init',
    chapters: {},
    round: 1,
  };
}

describe('Phase1 状态转换', () => {
  let tempDir: string;
  let projectDir: string;
  let store: ProjectStore;
  let phase1: Phase1RequirementAnalysis;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    store = new ProjectStore(projectDir);
    phase1 = new Phase1RequirementAnalysis(projectDir, store);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('execute() 不应该直接修改 state.currentPhase', async () => {
    // 设置 currentPhase = '1'
    const state = createMinimalState(projectDir);
    store.save(state);

    // 创建输入文档
    const inputsDir = join(projectDir, 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeFileSync(
      join(inputsDir, 'requirements.md'),
      '# 系统需求\n1. 需求1\n',
      'utf-8'
    );

    // 调用 phase1.execute()
    await phase1.execute();

    // 断言：currentPhase 仍然是 '1'
    const finalState = store.load();
    expect(finalState).not.toBeNull();
    expect(finalState!.currentPhase).toBe('1');
  });
});
