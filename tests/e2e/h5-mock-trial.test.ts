/**
 * H5: Mock Project Trial — Full pipeline with realistic mock data
 *
 * Simulates a real project from init through finalize (phase 7),
 * covering G1 (outline sync), G2 (real doc conversion), G5 (finalization).
 * Uses MockSubagentExecutor for LLM simulation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';
import { organizeMaterials } from '../../src/commands/organize.js';
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

const TEST_ROOT = join(tmpdir(), 'confwrite-h5-trial');

function setup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
}

/**
 * Create realistic reference materials for a "cloud platform" project.
 * Includes HTML (for G2 converter test) and Markdown files.
 */
function createReferenceMaterials(projectDir: string) {
  const refDir = join(projectDir, 'reference_material');

  // HTML file — tests real mammoth/pdf-parse path via converter
  writeFileSync(join(refDir, 'platform-overview.html'), `<html><body>
<h1>云平台技术方案</h1>
<p>本平台采用<strong>微服务架构</strong>，支持多租户部署。</p>
<h2>核心指标</h2>
<p>系统可用性: 99.99%</p>
<p>API 响应时间 P99: 200ms</p>
<p>最大并发用户: 50000</p>
<h2>技术栈</h2>
<ul>
<li>Kubernetes 1.28</li>
<li>PostgreSQL 16</li>
<li>Redis 7.2</li>
<li>Kafka 3.6</li>
</ul>
<h2>部署架构</h2>
<p>采用多可用区部署，RPO=0, RTO&lt;30s。</p>
</body></html>`);

  // Markdown — requirements
  writeFileSync(join(refDir, 'requirements.md'), `# 平台需求规格

## 功能需求
- 多租户资源隔离
- 细粒度 RBAC 权限控制
- 自动化运维（自动扩缩容、故障自愈）
- 实时告警与监控

## 性能需求
- 系统可用性: 99.99%
- API 响应时间 P99: 200ms
- 最大并发用户: 50000
- 数据吞吐量: 100K events/s

## 安全需求
- 零信任网络架构
- 数据加密（传输中 + 静态）
- 审计日志保留 180 天
`);

  // Markdown — API spec
  writeFileSync(join(refDir, 'api-design.md'), `# API 设计规范

## 认证
所有 API 使用 Bearer Token 认证，Token 有效期 24h。

## 核心接口
- POST /api/v2/auth/login — 用户登录
- GET /api/v2/resources — 资源列表
- POST /api/v2/deployments — 创建部署
- GET /api/v2/metrics — 监控指标

## 错误码
- 401: 认证失败
- 403: 权限不足
- 429: 请求限流
`);
}

function createOutline(projectDir: string) {
  writeFileSync(join(projectDir, 'outline.md'), `# 云平台技术方案

ch001 1 项目概述
ch002 2 系统架构
ch003 3 核心功能设计
`);
}

describe('H5: Mock Project Trial', () => {
  let projectDir: string;

  beforeEach(() => {
    setup();
    const result = initProject({ slug: 'cloud-platform', workspaceDir: TEST_ROOT });
    expect(result.success).toBe(true);
    projectDir = result.projectDir;
  });

  afterEach(cleanup);

  it('step 1: init creates project structure', () => {
    expect(existsSync(join(projectDir, 'project-state.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material'))).toBe(true);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;
    expect(state.currentPhase).toBe('0a');
    expect(state.project).toBe('cloud-platform');
  });

  it('step 2: organize with real HTML conversion (G2)', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    const result = await organizeMaterials(projectDir);

    // G2: HTML file should be converted to MD
    expect(result.scanStats.total).toBeGreaterThanOrEqual(3);
    expect(result.conversionStats.success).toBeGreaterThanOrEqual(1);

    // Verify baseline extracted key metrics
    expect(result.baseline.metrics).toBeDefined();

    // Verify chapter kits generated
    expect(result.kitStats.success).toBeGreaterThan(0);

    // Verify generated files
    expect(existsSync(join(projectDir, 'assets', 'data-baseline.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'indexes', 'index.json'))).toBe(true);
    expect(existsSync(join(projectDir, 'assets', 'chapter-kits'))).toBe(true);
  });

  it('step 3: outline→state auto-sync (G1)', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    // organizeMaterials calls syncChaptersFromOutline internally
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;

    // G1: chapters should be synced from outline
    expect(Object.keys(state.chapters)).toHaveLength(3);
    expect(state.chapters['ch001']).toBeDefined();
    expect(state.chapters['ch001'].title).toBe('1 项目概述');
    expect(state.chapters['ch001'].status).toBe('pending');
    expect(state.chapters['ch002'].title).toBe('2 系统架构');
    expect(state.chapters['ch003'].title).toBe('3 核心功能设计');
    expect(state.totalChapters).toBe(3);
  });

  it('step 4: write → review cycle with mock executor', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;
    state.currentPhase = '4a';
    store.save(state);

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

    // Verify drafts (versioned files)
    for (const id of chapterIds) {
      const draftPath = join(projectDir, 'drafts', 'chapters', `${id}-v1.md`);
      expect(existsSync(draftPath)).toBe(true);
    }

    // Mark as written, then review
    const s2 = store.load()!;
    for (const id of chapterIds) s2.chapters[id].status = 'written';
    store.save(s2);

    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    const reviewRun = await runner.runUntilIdle();
    expect(reviewRun.succeeded).toBe(3);

    // Verify reviews
    for (const id of chapterIds) {
      const reviewPath = join(projectDir, 'review', `${id}-r1.json`);
      expect(existsSync(reviewPath)).toBe(true);
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      expect(review.verdict).toBe('accept');
    }
  });

  it('step 5: assemble → finalize (G5) → export', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;
    state.currentPhase = '4a';
    store.save(state);

    // Write + Review
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    const chapterIds = ['ch001', 'ch002', 'ch003'];
    await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    await runner.runUntilIdle();

    const s2 = store.load()!;
    for (const id of chapterIds) s2.chapters[id].status = 'written';
    store.save(s2);

    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    await runner.runUntilIdle();

    // Mark all completed
    const s3 = store.load()!;
    for (const id of chapterIds) {
      s3.chapters[id].status = 'completed';
      s3.chapters[id].lastReviewVerdict = 'accept';
    }
    store.save(s3);

    // Assemble
    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, chapterIds, {
      title: '云平台技术方案',
      generateTOC: true,
    });
    expect(assemblyResult.success).toBe(true);
    expect(assemblyResult.stats.totalChapters).toBe(3);

    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);
    expect(existsSync(outputPath)).toBe(true);

    // G5: Finalize
    const report = finalize(projectDir);
    expect(report.stats.level2Headings).toBeGreaterThanOrEqual(3); // 3+ (mock content has sub-headings)
    expect(report.stats.characters).toBeGreaterThan(100);
    expect(report.stats.words).toBeGreaterThan(0);
    expect(report.readyForExport).toBe(true);
    expect(existsSync(join(projectDir, 'output', 'finalization.json'))).toBe(true);

    // Export
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'document.md'),
      toc: true,
    });
    expect(exportResult.success).toBe(true);
    expect(exportResult.stats!.totalChapters).toBe(3);
  });

  it('full flow: init → organize → write → review → assemble → finalize → export', async () => {
    // The complete journey
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    // 1. Organize (includes G1 sync + G2 HTML conversion)
    const orgResult = await organizeMaterials(projectDir);
    expect(orgResult.scanStats.total).toBeGreaterThanOrEqual(3);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;

    // G1: chapters synced
    expect(Object.keys(state.chapters)).toHaveLength(3);
    expect(state.totalChapters).toBe(3);

    // 2. Write + Review
    state.currentPhase = '4a';
    store.save(state);

    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(projectDir);
    const runner = new SchedulerRunner(scheduler, executor);
    const taskExecutor = new TaskExecutor();
    const writingOrchestrator = new WritingOrchestrator();
    const dispatcher = new Dispatcher(projectDir, store, scheduler, taskExecutor, writingOrchestrator);

    const chapterIds = ['ch001', 'ch002', 'ch003'];

    await dispatcher.dispatch('spawn_writers', { chapters: chapterIds });
    const writeRun = await runner.runUntilIdle();
    expect(writeRun.succeeded).toBe(3);

    // Mark written
    const s2 = store.load()!;
    for (const id of chapterIds) s2.chapters[id].status = 'written';
    store.save(s2);

    await dispatcher.dispatch('spawn_reviewers', { chapters: chapterIds, round: 1 });
    const reviewRun = await runner.runUntilIdle();
    expect(reviewRun.succeeded).toBe(3);

    // Mark completed
    const s3 = store.load()!;
    for (const id of chapterIds) {
      s3.chapters[id].status = 'completed';
      s3.chapters[id].lastReviewVerdict = 'accept';
    }
    store.save(s3);

    // 3. Assemble
    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, chapterIds, {
      title: '云平台技术方案',
      generateTOC: true,
    });
    expect(assemblyResult.success).toBe(true);

    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);

    // 4. Finalize (G5)
    const finalReport = finalize(projectDir);
    expect(finalReport.readyForExport).toBe(true);
    expect(finalReport.stats.level2Headings).toBeGreaterThanOrEqual(3);

    // 5. Export
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'document.md'),
      toc: true,
    });
    expect(exportResult.success).toBe(true);

    // Final content verification
    const finalContent = readFileSync(outputPath, 'utf-8');
    expect(finalContent.length).toBeGreaterThan(500);
    expect(finalContent).toContain('云平台技术方案');
  });
});
