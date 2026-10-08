import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Phase2OutlinePlanning } from '../../src/orchestrator/phase2.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-phase2-test-'));
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

describe('Phase2OutlinePlanning', () => {
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
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('应该在需求文件存在时自动生成大纲', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      // 创建需求文件
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      // 执行Phase 2
      await phase2.execute('technical-proposal');

      // 验证大纲文件已生成
      const outlinePath = join(projectDir, 'outline.md');
      expect(existsSync(outlinePath)).toBe(true);
    });

    it('应该更新项目状态到Phase 3', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      await phase2.execute('technical-proposal');

      // 验证状态已更新
      const updatedState = store.load();
      expect(updatedState).not.toBeNull();
      expect(updatedState!.currentPhase).toBe('3');
    });

    it('应该在大纲已存在时跳过生成', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      // 创建已存在的大纲文件
      writeFileSync(join(projectDir, 'outline.md'), '# 已存在的大纲', 'utf-8');

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      await phase2.execute('technical-proposal');

      // 验证大纲文件未被覆盖
      const outlineContent = require('fs').readFileSync(join(projectDir, 'outline.md'), 'utf-8');
      expect(outlineContent).toBe('# 已存在的大纲');
    });
  });

  describe('validate', () => {
    it('应该验证大纲文件存在', () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      writeFileSync(join(projectDir, 'outline.md'), '# 大纲', 'utf-8');

      const isValid = phase2.validate();
      expect(isValid).toBe(true);
    });

    it('应该在大纲文件不存在时返回false', () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const isValid = phase2.validate();
      expect(isValid).toBe(false);
    });
  });
});
