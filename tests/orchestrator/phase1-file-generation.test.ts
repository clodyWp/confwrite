import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Phase1RequirementAnalysis } from '../../src/orchestrator/phase1.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-phase1-filegen-'));
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

describe('Phase1 文件生成', () => {
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

  it('execute() 应该生成 requirements.json', async () => {
    // 创建测试状态
    const state = createMinimalState(projectDir);
    store.save(state);

    // 创建输入目录和文档
    const inputsDir = join(projectDir, 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeFileSync(
      join(inputsDir, 'requirements.md'),
      `# 系统需求

## 功能需求
1. 系统需要支持用户登录
2. 系统需要支持数据导出

## 性能需求
1. 系统响应时间不超过2秒
`,
      'utf-8'
    );

    // 调用 phase1.execute()
    await phase1.execute();

    // 断言：assets/requirements.json 存在
    const requirementsPath = join(projectDir, 'assets', 'requirements.json');
    expect(existsSync(requirementsPath)).toBe(true);
  });

  it('execute() 应该生成 requirement-report.md', async () => {
    const state = createMinimalState(projectDir);
    store.save(state);

    const inputsDir = join(projectDir, 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeFileSync(
      join(inputsDir, 'requirements.md'),
      '# 系统需求\n1. 需求1\n2. 需求2\n',
      'utf-8'
    );

    await phase1.execute();

    const reportPath = join(projectDir, 'assets', 'requirement-report.md');
    expect(existsSync(reportPath)).toBe(true);
  });
});
