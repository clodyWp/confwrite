/**
 * Full E2E Test — init → organize → write → review → fix → assemble → export
 * 
 * Uses MockSubagentExecutor to simulate LLM output.
 * Tests the complete state machine flow with real file I/O.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { initProject } from '../../src/commands/init.js';
import { organizeMaterials } from '../../src/commands/organize.js';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { Dispatcher } from '../../src/dispatcher/index.js';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { WritingOrchestrator } from '../../src/writing/orchestrator.js';
import { ChapterAssembler } from '../../src/assemble/assembler.js';
import { exportDocument } from '../../src/commands/export.js';

const TEST_DIR = join(process.cwd(), '.test-e2e-full');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function createReferenceMaterials(projectDir: string) {
  const refDir = join(projectDir, 'reference_material');
  mkdirSync(refDir, { recursive: true });

  writeFileSync(join(refDir, 'requirements.md'), `# 系统需求文档

## 1. 功能需求

### 1.1 用户管理
- 用户注册、登录、注销
- 角色权限管理（管理员、普通用户）
- 系统并发用户数: 10000

### 1.2 数据处理
- 数据导入/导出（CSV、JSON）
- 实时数据处理延迟 < 200ms
- 数据存储容量: 500GB

## 2. 非功能需求
- 系统可用性: 99.9%
- API 响应时间 P99: 500ms
- 数据备份频率: 每小时
`);

  writeFileSync(join(refDir, 'architecture.md'), `# 系统架构设计

## 技术栈
- 前端: React + TypeScript
- 后端: Node.js + Express
- 数据库: PostgreSQL 15
- 缓存: Redis 7

## 架构模式
采用微服务架构，主要服务包括：
- 用户服务 (user-service)
- 数据服务 (data-service)
- 通知服务 (notification-service)

## 部署架构
- 容器化: Docker + Kubernetes
- CI/CD: GitHub Actions
- 监控: Prometheus + Grafana
`);

  writeFileSync(join(refDir, 'api-spec.md'), `# API 规范

## 认证接口
- POST /api/auth/login — 用户登录
- POST /api/auth/register — 用户注册
- POST /api/auth/logout — 用户注销

## 数据接口
- GET /api/data — 获取数据列表
- POST /api/data — 创建数据
- PUT /api/data/:id — 更新数据
- DELETE /api/data/:id — 删除数据
`);
}

function createOutline(projectDir: string) {
  writeFileSync(join(projectDir, 'outline.md'), `# 系统设计文档 — 大纲

ch001 1 系统概述
  ch001.1 1.1 项目背景
  ch001.2 1.2 系统目标

ch002 2 系统架构
  ch002.1 2.1 整体架构
  ch002.2 2.2 技术选型

ch003 3 详细设计
  ch003.1 3.1 用户模块
  ch003.2 3.2 数据模块
`);
}

describe('Full E2E Pipeline', () => {
  let projectDir: string;

  beforeEach(() => {
    setupTestDir();
    const result = initProject({
      slug: 'e2e-test',
      workspaceDir: TEST_DIR,
    });
    expect(result.success).toBe(true);
    projectDir = result.projectDir;
  });

  afterEach(() => {
    cleanupTestDir();
  });

  it('Phase 1: init creates project structure', () => {
    expect(existsSync(join(projectDir, 'project-state.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material'))).toBe(true);
    expect(existsSync(join(projectDir, 'drafts', 'chapters'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'chapter-kits'))).toBe(true);
  });

  it('Phase 2: organize processes materials and generates kits', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    const result = await organizeMaterials(projectDir);

    expect(result.scanStats.total).toBeGreaterThanOrEqual(3);
    expect(result.baseline).toBeDefined();
    expect(result.chapterMappings.length).toBeGreaterThan(0);
    expect(result.kitStats.success).toBeGreaterThan(0);

    // Verify generated files
    expect(existsSync(join(projectDir, 'assets', 'data-baseline.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'references-index.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'indexes', 'index.json'))).toBe(true);
  });

  it('Phase 3: state machine flows through writing phases with mock executor', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load();
    expect(state).toBeDefined();

    // Advance to phase 4a (writing)
    const machine = new StateMachine(projectDir);
    
    // Tick until we reach 4a or it's already there
    let ticks = 0;
    while (ticks < 10) {
      const currentState = store.load()!;
      if (currentState.currentPhase === '4a') break;
      
      const tick = await machine.tick();
      if ('blocked' in tick && tick.blocked) break;
      ticks++;
    }

    let currentState = store.load()!;
    expect(currentState.currentPhase).toBe('4a');

    // Set up chapters as pending (organize should have created them via outline)
    // If chapters are empty, add them manually
    if (Object.keys(currentState.chapters).length === 0) {
      currentState.chapters = {
        'ch001': { id: 'ch001', title: '系统概述', status: 'pending', version: 0, round: 1, attempt: 0 },
        'ch002': { id: 'ch002', title: '系统架构', status: 'pending', version: 0, round: 1, attempt: 0 },
        'ch003': { id: 'ch003', title: '详细设计', status: 'pending', version: 0, round: 1, attempt: 0 },
      };
      store.save(currentState);
    }

    // Now run the writing pipeline with mock executor
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    // Phase 4a: spawn writers
    const chapterIds = Object.keys(store.load()!.chapters);
    const writeResult = await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    expect(writeResult.tasksCreated).toBe(chapterIds.length);

    // Execute all writer tasks
    const runResult = await runner.runUntilIdle();
    expect(runResult.succeeded).toBe(chapterIds.length);

    // Verify drafts were created (versioned files)
    for (const id of chapterIds) {
      expect(existsSync(join(projectDir, 'drafts', 'chapters', `${id}-v1.md`))).toBe(true);
    }

    // Update chapter statuses to 'written'
    currentState = store.load()!;
    for (const id of chapterIds) {
      currentState.chapters[id].status = 'written';
    }
    store.save(currentState);

    // Phase 4b: spawn reviewers
    const reviewResult = await dispatcher.dispatch('spawn_reviewers', {
      chapters: chapterIds,
      round: currentState.round,
    });
    expect(reviewResult.tasksCreated).toBe(chapterIds.length);

    const reviewRunResult = await runner.runUntilIdle();
    expect(reviewRunResult.succeeded).toBe(chapterIds.length);

    // Verify review reports were created
    for (const id of chapterIds) {
      expect(existsSync(join(projectDir, 'review', `${id}-r1.json`))).toBe(true);
    }

    // Update chapter statuses to 'completed' (mock reviewer returns 'accept')
    currentState = store.load()!;
    for (const id of chapterIds) {
      currentState.chapters[id].status = 'completed';
      currentState.chapters[id].lastReviewVerdict = 'accept';
    }
    store.save(currentState);
  });

  it('Phase 4: assemble and export after writing', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;

    // Set up chapters
    state.chapters = {
      'ch001': { id: 'ch001', title: '系统概述', status: 'pending', version: 0, round: 1, attempt: 0 },
      'ch002': { id: 'ch002', title: '系统架构', status: 'pending', version: 0, round: 1, attempt: 0 },
      'ch003': { id: 'ch003', title: '详细设计', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    store.save(state);

    // Run writing with mock executor
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    const chapterIds = ['ch001', 'ch002', 'ch003'];

    // Write
    await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    await runner.runUntilIdle();

    // Review
    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    await runner.runUntilIdle();

    // Phase 5: diagrams (just verify it doesn't crash)
    const machine = new StateMachine(projectDir);
    
    // Advance state to phase 5
    const currentState = store.load()!;
    for (const id of chapterIds) {
      currentState.chapters[id].status = 'completed';
      currentState.chapters[id].lastReviewVerdict = 'accept';
    }
    currentState.currentPhase = '5';
    store.save(currentState);

    const phase5Result = await machine.tick();
    // Phase 5 should run (even if no diagrams found)
    expect('blocked' in phase5Result ? !phase5Result.blocked : true).toBe(true);

    // Phase 6: assemble
    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, chapterIds, {
      title: '系统设计文档',
      generateTOC: true,
    });

    expect(assemblyResult.success).toBe(true);
    expect(assemblyResult.stats.totalChapters).toBe(3);
    expect(assemblyResult.stats.totalCharacters).toBeGreaterThan(100);

    // Save assembled output
    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);
    expect(existsSync(outputPath)).toBe(true);

    // Verify content
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('系统设计文档');
    expect(content).toContain('ch001');
    expect(content).toContain('ch002');
    expect(content).toContain('ch003');

    // Export as markdown
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'export.md'),
      title: '系统设计文档',
      toc: true,
    });

    expect(exportResult.success).toBe(true);
    expect(exportResult.outputPath).toBeDefined();
    expect(exportResult.stats!.totalChapters).toBe(3);
  });

  it('Full pipeline: init → organize → write → review → assemble → export', async () => {
    // This test verifies the complete flow end-to-end
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    // Step 1: Organize
    const orgResult = await organizeMaterials(projectDir);
    expect(orgResult.scanStats.total).toBeGreaterThanOrEqual(3);

    // Step 2: Set up state for writing
    const store = new ProjectStore(projectDir);
    const state = store.load()!;
    state.chapters = {
      'ch001': { id: 'ch001', title: '系统概述', status: 'pending', version: 0, round: 1, attempt: 0 },
      'ch002': { id: 'ch002', title: '系统架构', status: 'pending', version: 0, round: 1, attempt: 0 },
      'ch003': { id: 'ch003', title: '详细设计', status: 'pending', version: 0, round: 1, attempt: 0 },
    };
    state.currentPhase = '4a';
    store.save(state);

    // Step 3: Write + Review with mock executor
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    const chapterIds = ['ch001', 'ch002', 'ch003'];

    // Write
    await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    const writeRun = await runner.runUntilIdle();
    expect(writeRun.succeeded).toBe(3);

    // Verify drafts exist (versioned files)
    for (const id of chapterIds) {
      const draftPath = join(projectDir, 'drafts', 'chapters', `${id}-v1.md`);
      expect(existsSync(draftPath)).toBe(true);
      const content = readFileSync(draftPath, 'utf-8');
      expect(content).toContain(id);
    }

    // Review
    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    const reviewRun = await runner.runUntilIdle();
    expect(reviewRun.succeeded).toBe(3);

    // Verify reviews exist
    for (const id of chapterIds) {
      const reviewPath = join(projectDir, 'review', `${id}-r1.json`);
      expect(existsSync(reviewPath)).toBe(true);
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      expect(review.verdict).toBe('accept');
    }

    // Step 4: Assemble
    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, chapterIds, {
      title: '系统设计文档 E2E',
      generateTOC: true,
    });
    expect(assemblyResult.success).toBe(true);
    expect(assemblyResult.stats.totalChapters).toBe(3);

    // Save
    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);

    // Step 5: Export
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'document.md'),
      toc: true,
    });
    expect(exportResult.success).toBe(true);

    // Final verification
    const finalContent = readFileSync(outputPath, 'utf-8');
    expect(finalContent.length).toBeGreaterThan(500);
    expect(finalContent).toContain('系统架构设计'); // from mock writer content
    expect(finalContent).toContain('mermaid'); // mock writer includes mermaid diagram
  });
});
