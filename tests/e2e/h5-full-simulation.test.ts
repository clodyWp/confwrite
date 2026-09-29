/**
 * H5: Full project simulation with mock data
 * 
 * Tests the complete ConfWrite lifecycle with realistic mock data:
 * init → organize (with chapter-sync G1) → write → review → fix → assemble → finalize (G5) → export
 * 
 * Includes:
 * - Multiple reference materials (MD, HTML)
 * - Outline with ch-markers that get synced to state (G1)
 * - Mock writer/reviewer/fixer subagents
 * - Mermaid diagrams in drafts
 * - Data baseline consistency checks
 * - Phase 7 finalization (G5)
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
import { finalize } from '../../src/assemble/finalizer.js';
import { exportDocument } from '../../src/commands/export.js';

const TEST_DIR = join(process.cwd(), '.test-h5-simulation');

function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

function createRealisticMaterials(projectDir: string) {
  const refDir = join(projectDir, 'reference_material');
  mkdirSync(refDir, { recursive: true });

  // Requirements doc
  writeFileSync(join(refDir, 'requirements.md'), `# 电商平台技术需求

## 1. 业务需求
- 支持 B2C 和 B2B 双模式
- 日均订单量: 50000 单
- 峰值 QPS: 5000
- 系统可用性: 99.95%

## 2. 功能模块
### 2.1 商品管理
- 商品发布、编辑、上下架
- SKU 管理、库存同步
- 商品搜索（Elasticsearch）

### 2.2 订单系统
- 下单、支付、退款
- 订单状态流转
- 物流跟踪

### 2.3 用户系统
- 注册、登录、实名认证
- 会员等级体系
- 收货地址管理

## 3. 非功能需求
- API 响应时间 P99: 200ms
- 数据库读写分离
- 缓存命中率 > 95%
- 数据备份: 每日全量 + 每小时增量
`);

  // Architecture doc (HTML format — tests HTML conversion)
  writeFileSync(join(refDir, 'architecture.html'), `<html>
<body>
<h1>电商平台架构设计</h1>
<h2>技术栈</h2>
<p>前端: React + TypeScript + Ant Design</p>
<p>后端: Java Spring Boot + MyBatis</p>
<p>数据库: MySQL 8.0 + Redis 7</p>
<p>消息队列: RocketMQ</p>
<p>搜索引擎: Elasticsearch 8</p>
<h2>部署架构</h2>
<p>容器化: Docker + Kubernetes</p>
<p>网关: Nginx + Spring Cloud Gateway</p>
<p>监控: Prometheus + Grafana + SkyWalking</p>
</body>
</html>`);

  // API spec
  writeFileSync(join(refDir, 'api-spec.md'), `# API 接口规范

## 商品接口
- GET /api/products — 商品列表（分页）
- GET /api/products/:id — 商品详情
- POST /api/products — 创建商品
- PUT /api/products/:id — 更新商品

## 订单接口
- POST /api/orders — 创建订单
- GET /api/orders/:id — 订单详情
- POST /api/orders/:id/pay — 支付
- POST /api/orders/:id/refund — 退款

## 用户接口
- POST /api/users/register — 注册
- POST /api/users/login — 登录
- GET /api/users/profile — 个人信息
`);
}

function createOutline(projectDir: string) {
  writeFileSync(join(projectDir, 'outline.md'), `# 电商平台技术方案

ch001 项目概述
ch002 系统架构设计
ch003 核心模块实现
`);
}

describe('H5: Full Project Simulation', () => {
  let projectDir: string;

  beforeEach(() => {
    setup();
    const result = initProject({ slug: 'ecommerce-platform', workspaceDir: TEST_DIR });
    expect(result.success).toBe(true);
    projectDir = result.projectDir;
  });

  afterEach(cleanup);

  it('Step 1: init creates project with correct structure', () => {
    expect(existsSync(join(projectDir, 'project-state.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material'))).toBe(true);
    expect(existsSync(join(projectDir, 'inputs', 'agent-instructions.md'))).toBe(true);

    const state = new ProjectStore(projectDir).load()!;
    expect(state.project).toBe('ecommerce-platform');
    expect(state.currentPhase).toBe('0a');
    expect(state.status).toBe('init');
  });

  it('Step 2: organize processes materials + syncs chapters from outline (G1)', async () => {
    createRealisticMaterials(projectDir);
    createOutline(projectDir);

    const result = await organizeMaterials(projectDir);

    // Materials scanned
    expect(result.scanStats.total).toBeGreaterThanOrEqual(3);
    expect(result.baseline).toBeDefined();

    // G1: chapters auto-synced from outline
    const state = new ProjectStore(projectDir).load()!;
    expect(Object.keys(state.chapters)).toHaveLength(3);
    expect(state.chapters['ch001']).toBeDefined();
    expect(state.chapters['ch001'].title).toBe('项目概述');
    expect(state.chapters['ch001'].status).toBe('pending');
    expect(state.chapters['ch002'].title).toBe('系统架构设计');
    expect(state.chapters['ch003'].title).toBe('核心模块实现');
    expect(state.totalChapters).toBe(3);

    // Chapter kits generated
    expect(result.kitStats.success).toBe(3);
    expect(existsSync(join(projectDir, 'assets', 'chapter-kits', 'ch001.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'data-baseline.json'))).toBe(true);
  });

  it('Step 3: write → review → assemble → finalize → export (full pipeline)', async () => {
    createRealisticMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;

    // Advance to writing phase
    state.currentPhase = '4a';
    store.save(state);

    // Setup executor pipeline
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    const chapterIds = ['ch001', 'ch002', 'ch003'];

    // === Phase 4a: Write ===
    await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    const writeRun = await runner.runUntilIdle();
    expect(writeRun.succeeded).toBe(3);

    for (const id of chapterIds) {
      const draftPath = join(projectDir, 'drafts', 'chapters', `${id}-v1.md`);
      expect(existsSync(draftPath)).toBe(true);
    }

    // Mark as written
    const s1 = store.load()!;
    for (const id of chapterIds) s1.chapters[id].status = 'written';
    store.save(s1);

    // === Phase 4b: Review ===
    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    const reviewRun = await runner.runUntilIdle();
    expect(reviewRun.succeeded).toBe(3);

    for (const id of chapterIds) {
      expect(existsSync(join(projectDir, 'review', `${id}-r1.json`))).toBe(true);
    }

    // Mark as completed
    const s2 = store.load()!;
    for (const id of chapterIds) {
      s2.chapters[id].status = 'completed';
      s2.chapters[id].lastReviewVerdict = 'accept';
    }
    store.save(s2);

    // === Phase 5: Diagrams ===
    const machine = new StateMachine(projectDir);
    const s3 = store.load()!;
    s3.currentPhase = '5';
    store.save(s3);

    await machine.tick();
    // Phase 5 runs (no mermaid in mock output, but pipeline doesn't crash)

    // === Phase 6: Assemble ===
    const s4 = store.load()!;
    s4.currentPhase = '6';
    store.save(s4);

    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, chapterIds, {
      title: '电商平台技术方案',
      generateTOC: true,
    });
    expect(assemblyResult.success).toBe(true);
    expect(assemblyResult.stats.totalChapters).toBe(3);

    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);
    expect(existsSync(outputPath)).toBe(true);

    // === Phase 7: Finalize (G5) ===
    const report = finalize(projectDir);
    expect(report.readyForExport).toBe(true);
    expect(report.stats.level2Headings).toBeGreaterThanOrEqual(3);
    expect(report.stats.characters).toBeGreaterThan(100);
    expect(report.stats.words).toBeGreaterThan(0);
    expect(existsSync(join(projectDir, 'output', 'finalization.json'))).toBe(true);

    const savedReport = JSON.parse(readFileSync(join(projectDir, 'output', 'finalization.json'), 'utf-8'));
    expect(savedReport.stats).toBeDefined();
    expect(savedReport.finalizedAt).toBeDefined();

    // === Phase 8: Export ===
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'document.md'),
      toc: true,
    });
    expect(exportResult.success).toBe(true);
    expect(exportResult.stats!.totalChapters).toBe(3);
    expect(existsSync(join(projectDir, 'output', 'document.md'))).toBe(true);

    // Final content check
    const finalContent = readFileSync(outputPath, 'utf-8');
    expect(finalContent).toContain('电商平台技术方案');
    expect(finalContent.length).toBeGreaterThan(500);
  });

  it('G1: editing outline and re-organizing syncs new chapters', async () => {
    createRealisticMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    // Verify initial 3 chapters
    let state = new ProjectStore(projectDir).load()!;
    expect(Object.keys(state.chapters)).toHaveLength(3);

    // User adds a new chapter to outline
    writeFileSync(join(projectDir, 'outline.md'), `# 电商平台技术方案

ch001 项目概述
ch002 系统架构设计
ch003 核心模块实现
ch004 部署与运维
`);

    // Re-organize triggers sync
    await organizeMaterials(projectDir);

    state = new ProjectStore(projectDir).load()!;
    expect(Object.keys(state.chapters)).toHaveLength(4);
    expect(state.chapters['ch004']).toBeDefined();
    expect(state.chapters['ch004'].title).toBe('部署与运维');
    expect(state.chapters['ch004'].status).toBe('pending');
    expect(state.totalChapters).toBe(4);
  });

  it('G1: removing a pending chapter from outline removes it from state', async () => {
    createRealisticMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    let state = new ProjectStore(projectDir).load()!;
    expect(Object.keys(state.chapters)).toHaveLength(3);

    // User removes ch003 from outline
    writeFileSync(join(projectDir, 'outline.md'), `# 电商平台技术方案

ch001 项目概述
ch002 系统架构设计
`);

    await organizeMaterials(projectDir);

    state = new ProjectStore(projectDir).load()!;
    expect(Object.keys(state.chapters)).toHaveLength(2);
    expect(state.chapters['ch003']).toBeUndefined();
    expect(state.totalChapters).toBe(2);
  });

  it('G5: finalization detects baseline consistency', async () => {
    createRealisticMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    // Create assembled output with baseline data
    const baseline = JSON.parse(readFileSync(join(projectDir, 'assets', 'data-baseline.json'), 'utf-8'));

    // Write a final.md that includes some baseline data
    const finalContent = `# 电商平台技术方案

## 第1章 项目概述

本电商平台日均订单量 50000 单，系统可用性达到 99.95%。

峰值 QPS 为 5000，API 响应时间 P99 控制在 200ms 以内。

## 第2章 系统架构设计

采用微服务架构，使用 Kubernetes 部署。

缓存命中率目标 > 95%。
`;

    mkdirSync(join(projectDir, 'output'), { recursive: true });
    writeFileSync(join(projectDir, 'output', 'final.md'), finalContent, 'utf-8');

    const report = finalize(projectDir);

    expect(report.readyForExport).toBe(true);
    expect(report.stats.level2Headings).toBe(2);
    expect(report.stats.words).toBeGreaterThan(50);
    expect(report.consistency.baselineMatches).toBeGreaterThan(0);
  });
});
