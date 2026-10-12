import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Phase2OutlinePlanning } from '../../src/orchestrator/phase2.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-phase2-transition-'));
}

function createMinimalState(projectDir: string): ProjectState {
  return {
    version: 1,
    project: 'test-project',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '2',
    status: 'init',
    chapters: {},
    round: 1,
  };
}

function setupKnowledgeDir(projectDir: string): void {
  // 创建模板目录和模板文件
  const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
  mkdirSync(templatesDir, { recursive: true });

  writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术方案模板
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
  - type: requirements
    required: true
    order: 2
---
`);

  // 创建章节类型目录和类型文件
  const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
  mkdirSync(chapterTypesDir, { recursive: true });

  writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);

  writeFileSync(join(chapterTypesDir, 'requirements.md'), `---
name: 需求章
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---
`);
}

describe('Phase2 状态转换', () => {
  let tempDir: string;
  let projectDir: string;
  let store: ProjectStore;
  let phase2: Phase2OutlinePlanning;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    store = new ProjectStore(projectDir);
    phase2 = new Phase2OutlinePlanning(projectDir, store);
    setupKnowledgeDir(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('execute() 不应该直接修改 state.currentPhase（大纲已存在路径）', async () => {
    // 创建 outline.md
    writeFileSync(join(projectDir, 'outline.md'), '# 已存在的大纲', 'utf-8');

    // 设置 currentPhase = '2'
    const state = createMinimalState(projectDir);
    store.save(state);

    // 调用 phase2.execute()
    await phase2.execute('technical-proposal');

    // 断言：currentPhase 仍然是 '2'
    const finalState = store.load();
    expect(finalState).not.toBeNull();
    expect(finalState!.currentPhase).toBe('2');
  });

  it('execute() 不应该直接修改 state.currentPhase（大纲生成路径）', async () => {
    // 不创建 outline.md
    // 创建 requirements.json
    const assetsDir = join(projectDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(
      join(assetsDir, 'requirements.json'),
      JSON.stringify([], null, 2),
      'utf-8'
    );

    // 设置 currentPhase = '2'
    const state = createMinimalState(projectDir);
    store.save(state);

    // 调用 phase2.execute()
    await phase2.execute('technical-proposal');

    // 断言：currentPhase 仍然是 '2'
    const finalState = store.load();
    expect(finalState).not.toBeNull();
    expect(finalState!.currentPhase).toBe('2');
  });
});
