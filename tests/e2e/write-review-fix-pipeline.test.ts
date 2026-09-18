/**
 * E2E 集成测试：完整 write→review→fix 流程（版本化文件）
 * 
 * 测试版本化文件设计：
 * - Writer: drafts/chapters/${chapterId}-v${round}.md
 * - Reviewer: review/${chapterId}-r${round}.json
 * - Fixer: 读取上一版本，输出新版本 drafts/chapters/${chapterId}-v${round+1}.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { Dispatcher } from '../../src/dispatcher/index.js';
import type { ProjectState } from '../../src/state/schema.js';

describe('E2E: Write→Review→Fix Pipeline (Versioned Files)', () => {
  let tempDir: string;
  let store: ProjectStore;
  let scheduler: SubagentScheduler;
  let executor: MockSubagentExecutor;
  let runner: SchedulerRunner;
  let taskExecutor: TaskExecutor;
  let orchestrator: WritingOrchestrator;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cw-e2e-versioned-'));
    
    // 创建项目结构
    mkdirSync(join(tempDir, 'assets', 'chapter-kits'), { recursive: true });
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tempDir, 'review'), { recursive: true });
    
    // 创建章节素材包
    const ch001Kit = `# ch001 系统概述

## 大纲要点
- 项目背景
- 系统目标

## 基线数据
### 关键指标
- 性能指标: 1000 QPS
- 可用性: 99.9%
`;
    writeFileSync(join(tempDir, 'assets', 'chapter-kits', 'ch001.md'), ch001Kit, 'utf-8');
    
    // 创建数据基线
    const baseline = {
      metrics: { '性能指标': '1000 QPS', '可用性': '99.9%' },
      technicalTerms: ['微服务', '容器化'],
      requirements: ['高可用'],
    };
    writeFileSync(
      join(tempDir, 'assets', 'data-baseline.json'),
      JSON.stringify(baseline, null, 2),
      'utf-8'
    );
    
    // 初始化组件
    store = new ProjectStore(tempDir);
    scheduler = new SubagentScheduler();
    executor = new MockSubagentExecutor(tempDir);
    runner = new SchedulerRunner(scheduler, executor);
    taskExecutor = new TaskExecutor();
    orchestrator = new WritingOrchestrator();
    dispatcher = new Dispatcher(tempDir, store, scheduler, taskExecutor, orchestrator);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('版本化文件：writer 创建 v1，fixer 创建 v2', async () => {
    // 初始化项目状态
    const initialState: ProjectState = {
      version: 1,
      project: 'test-project',
      projectDir: tempDir,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: '4a',
      status: 'writing',
      chapters: {
        ch001: {
          id: 'ch001',
          title: '系统概述',
          status: 'pending',
          version: 0,
          round: 1,
          attempt: 0,
        },
      },
      round: 1,
    };
    store.save(initialState);

    // === 步骤 1: 分发写作任务 (round 1) ===
    const writeResult = await dispatcher.dispatch('spawn_writers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(writeResult.tasksCreated).toBe(1);
    expect(writeResult.tasks[0].id).toBe('write-ch001-r1');

    // 执行写作任务
    const runResult = await runner.runUntilIdle();
    expect(runResult.succeeded).toBe(1);

    // 验证版本化文件创建
    const v1Path = join(tempDir, 'drafts', 'chapters', 'ch001-v1.md');
    expect(existsSync(v1Path)).toBe(true);
    const v1Content = readFileSync(v1Path, 'utf-8');
    expect(v1Content).toContain('ch001');

    // === 步骤 2: 分发审阅任务 (round 1) ===
    // 更新章节状态为 written
    const state1 = store.load()!;
    state1.chapters.ch001.status = 'written';
    store.save(state1);

    const reviewResult = await dispatcher.dispatch('spawn_reviewers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(reviewResult.tasksCreated).toBe(1);
    expect(reviewResult.tasks[0].id).toBe('review-ch001-r1');

    // 执行审阅任务
    const reviewRunResult = await runner.runUntilIdle();
    expect(reviewRunResult.succeeded).toBe(1);

    // 验证审阅报告创建
    const r1Path = join(tempDir, 'review', 'ch001-r1.json');
    expect(existsSync(r1Path)).toBe(true);

    // === 步骤 3: 模拟 revise 决定，分发修复任务 ===
    // 手动修改审阅报告为 revise
    const reviseReview = JSON.stringify({
      chapterId: 'ch001',
      round: 1,
      verdict: 'revise',
      scores: { accuracy: 6, consistency: 7, clarity: 7, depth: 5, quality: 6 },
      issues: [{ severity: 'high', description: '缺少实现细节', location: '概述', suggestion: '添加具体实现' }],
      summary: '需要补充实现细节',
    });
    writeFileSync(r1Path, reviseReview, 'utf-8');

    // 更新章节状态
    const state2 = store.load()!;
    state2.chapters.ch001.status = 'reviewed';
    state2.chapters.ch001.lastReviewVerdict = 'revise';
    store.save(state2);

    // 分发修复任务
    const fixResult = await dispatcher.dispatch('spawn_fixers', {
      chapters: ['ch001'],
      round: 1,
    });
    expect(fixResult.tasksCreated).toBe(1);
    expect(fixResult.tasks[0].id).toBe('fix-ch001-r1');

    // 执行修复任务
    const fixRunResult = await runner.runUntilIdle();
    expect(fixRunResult.succeeded).toBe(1);

    // 验证新版本文件创建 (v2)
    const v2Path = join(tempDir, 'drafts', 'chapters', 'ch001-v2.md');
    expect(existsSync(v2Path)).toBe(true);
    const v2Content = readFileSync(v2Path, 'utf-8');
    expect(v2Content).toContain('修复说明');

    // 验证旧版本文件仍然存在
    expect(existsSync(v1Path)).toBe(true);
  });

  it('Assembler 自动选择最新版本', async () => {
    // 创建多个版本的文件
    writeFileSync(
      join(tempDir, 'drafts', 'chapters', 'ch001-v1.md'),
      '# ch001 版本1\n\n这是第一版内容。',
      'utf-8'
    );
    writeFileSync(
      join(tempDir, 'drafts', 'chapters', 'ch001-v2.md'),
      '# ch001 版本2\n\n这是第二版内容，更完整。',
      'utf-8'
    );
    writeFileSync(
      join(tempDir, 'drafts', 'chapters', 'ch001-v3.md'),
      '# ch001 版本3\n\n这是第三版内容，最完整。',
      'utf-8'
    );

    // 导入 Assembler
    const { ChapterAssembler } = await import('../../src/assemble/assembler.js');
    const assembler = new ChapterAssembler();

    // 组装
    const result = assembler.assemble(tempDir, ['ch001']);
    expect(result.success).toBe(true);
    
    // 验证使用的是最新版本 (v3)
    expect(result.content).toContain('版本3');
    expect(result.content).not.toContain('版本1');
    expect(result.content).not.toContain('版本2');
  });

  it('向后兼容：支持非版本化文件', async () => {
    // 创建非版本化文件（旧格式）
    writeFileSync(
      join(tempDir, 'drafts', 'chapters', 'ch001.md'),
      '# ch001 旧格式\n\n这是旧格式的内容。',
      'utf-8'
    );

    // 导入 Assembler
    const { ChapterAssembler } = await import('../../src/assemble/assembler.js');
    const assembler = new ChapterAssembler();

    // 组装
    const result = assembler.assemble(tempDir, ['ch001']);
    expect(result.success).toBe(true);
    expect(result.content).toContain('旧格式');
  });
});
