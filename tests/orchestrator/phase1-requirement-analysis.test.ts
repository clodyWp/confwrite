import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Phase1RequirementAnalysis } from '../../src/orchestrator/phase1.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-phase1-test-'));
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

describe('Phase1RequirementAnalysis', () => {
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

  describe('execute', () => {
    it('应该从输入文档中提取需求', async () => {
      // 创建测试状态
      const state = createMinimalState(projectDir);
      store.save(state);

      // 创建输入目录和文档
      const inputsDir = join(projectDir, 'inputs');
      mkdirSync(inputsDir, { recursive: true });
      writeFileSync(
        join(inputsDir, 'requirements.md'),
        `
# 系统需求

## 功能需求
1. 系统需要支持用户登录
2. 系统需要支持数据导出

## 性能需求
1. 系统响应时间不超过2秒
`,
        'utf-8'
      );

      // 执行Phase 1
      await phase1.execute();

      // 验证requirements.json已生成
      const requirementsPath = join(projectDir, 'assets', 'requirements.json');
      expect(existsSync(requirementsPath)).toBe(true);

      // 验证需求内容
      const requirements = JSON.parse(readFileSync(requirementsPath, 'utf-8'));
      expect(requirements.length).toBeGreaterThan(0);
    });

    it('应该生成需求报告', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const inputsDir = join(projectDir, 'inputs');
      mkdirSync(inputsDir, { recursive: true });
      writeFileSync(
        join(inputsDir, 'requirements.md'),
        `
# 系统需求
1. 需求1
2. 需求2
`,
        'utf-8'
      );

      await phase1.execute();

      // 验证报告已生成
      const reportPath = join(projectDir, 'assets', 'requirement-report.md');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf-8');
      expect(report).toContain('需求提取报告');
    });

    it('应该更新项目状态', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const inputsDir = join(projectDir, 'inputs');
      mkdirSync(inputsDir, { recursive: true });
      writeFileSync(
        join(inputsDir, 'requirements.md'),
        `
# 系统需求
1. 需求1
`,
        'utf-8'
      );

      await phase1.execute();

      // 验证状态已更新
      const updatedState = store.load();
      expect(updatedState).not.toBeNull();
      expect(updatedState!.currentPhase).toBe('2');
    });

    it('应该在缺少输入文档时抛出错误', async () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      // 不创建输入文档

      // 执行Phase 1应该抛出错误
      await expect(phase1.execute()).rejects.toThrow('未找到输入文档');
    });
  });

  describe('validate', () => {
    it('应该验证需求文件存在', () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      const requirementsPath = join(assetsDir, 'requirements.json');
      writeFileSync(requirementsPath, '[]', 'utf-8');

      const isValid = phase1.validate();
      expect(isValid).toBe(true);
    });

    it('应该在需求文件不存在时返回false', () => {
      const state = createMinimalState(projectDir);
      store.save(state);

      const isValid = phase1.validate();
      expect(isValid).toBe(false);
    });
  });
});
