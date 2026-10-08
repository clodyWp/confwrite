import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { outlineCommand } from '../../src/commands/outline.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState, Requirement } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-outline-command-test-'));
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

describe('outline command', () => {
  let tempDir: string;
  let projectDir: string;
  let store: ProjectStore;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    store = new ProjectStore(projectDir);

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
  - type: architecture
    required: true
    order: 3
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
    
    writeFileSync(join(chapterTypesDir, 'architecture.md'), `---
name: 架构章
wordBudget:
  min: 10000
  max: 15000
importance: 5
writingStyle: functional
---
`);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('应该生成大纲文件', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      // 创建需求文件
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
      ];
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify(requirements, null, 2),
        'utf-8'
      );

      // 执行命令
      await outlineCommand({
        projectDir,
        template: 'technical-proposal',
      });

      // 验证大纲文件已生成
      const outlinePath = join(projectDir, 'outline.md');
      expect(existsSync(outlinePath)).toBe(true);

      const outlineContent = readFileSync(outlinePath, 'utf-8');
      expect(outlineContent).toContain('技术方案');
      expect(outlineContent).toContain('概述章');
      expect(outlineContent).toContain('需求章');
      expect(outlineContent).toContain('架构章');
    });

    it('应该生成大纲评估报告', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      await outlineCommand({
        projectDir,
        template: 'technical-proposal',
      });

      // 验证评估报告已生成
      const reportPath = join(projectDir, 'assets', 'outline-evaluation.md');
      expect(existsSync(reportPath)).toBe(true);

      const reportContent = readFileSync(reportPath, 'utf-8');
      expect(reportContent).toContain('大纲评估报告');
      expect(reportContent).toContain('字数预算');
    });

    it('应该更新项目状态', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      await outlineCommand({
        projectDir,
        template: 'technical-proposal',
      });

      // 验证状态已更新
      const updatedState = store.load();
      expect(updatedState).not.toBeNull();
      expect(updatedState!.currentPhase).toBe('3');
    });

    it('应该在缺少需求文件时抛出错误', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      // 不创建需求文件

      // 执行命令应该抛出错误
      await expect(
        outlineCommand({
          projectDir,
          template: 'technical-proposal',
        })
      ).rejects.toThrow('未找到需求文件');
    });

    it('应该支持指定目标字数', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([], null, 2),
        'utf-8'
      );

      await outlineCommand({
        projectDir,
        template: 'technical-proposal',
        targetWords: 80000,
      });

      // 验证大纲文件
      const outlinePath = join(projectDir, 'outline.md');
      const outlineContent = readFileSync(outlinePath, 'utf-8');
      expect(outlineContent).toContain('80000');
    });
  });
});
