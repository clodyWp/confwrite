/**
 * H5 自测：通过 runWriteLoop + MockSubagentExecutor 验证完整写作循环
 * 
 * 测试路径：
 * init → organize → 手动推进到 4a → runWriteLoop (write+review) → assemble → finalize → export
 * 
 * 模拟真实项目数据，验证：
 * 1. runWriteLoop 能正确 tick → dispatch → execute → processTask → 循环
 * 2. MockSubagentExecutor 能写草稿和审阅报告
 * 3. 状态机能自动推进 phase
 * 4. 最终能 assemble + finalize + export
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';
import { organizeMaterials } from '../../src/commands/organize.js';
import { runWriteLoop, type WriteLoopResult, type NotifyLevel } from '../../src/index.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { ProjectStore } from '../../src/state/store.js';
import { ChapterAssembler } from '../../src/assemble/assembler.js';
import { finalize } from '../../src/assemble/finalizer.js';
import { exportDocument } from '../../src/commands/export.js';

const TEST_ROOT = join(tmpdir(), 'confwrite-h5-selftest');

function setup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
}

function createReferenceMaterials(projectDir: string) {
  const refDir = join(projectDir, 'reference_material');
  mkdirSync(refDir, { recursive: true });

  writeFileSync(join(refDir, 'requirements.md'), `# 东方电气资产管理系统需求

## 功能需求
- 设备台账管理
- 维修工单管理
- 备件库存管理
- 系统可用性: 99.9%
- 最大并发用户: 5000

## 非功能需求
- API 响应时间 P99: 200ms
- 数据备份: 每日全量
`);

  writeFileSync(join(refDir, 'architecture.md'), `# 系统架构

## 技术栈
- 前端: Vue 3 + TypeScript
- 后端: Java Spring Boot
- 数据库: MySQL 8.0
- 缓存: Redis 7

## 部署
- Docker + Kubernetes
- 多可用区部署
`);
}

function createOutline(projectDir: string) {
  writeFileSync(join(projectDir, 'outline.md'), `# 东方电气资产管理系统技术方案

ch001 项目概述
ch002 系统架构设计
ch003 核心功能模块
`);
}

describe('H5 自测: runWriteLoop + MockSubagentExecutor', () => {
  let projectDir: string;
  let messages: Array<{ msg: string; level: NotifyLevel }>;

  beforeEach(() => {
    setup();
    messages = [];
    const result = initProject({ slug: 'easte', workspaceDir: TEST_ROOT });
    expect(result.success).toBe(true);
    projectDir = result.projectDir;
  });

  afterEach(cleanup);

  function notify(msg: string, level: NotifyLevel) {
    messages.push({ msg, level });
  }

  it('完整流程: init → organize → writeLoop → assemble → finalize → export', async () => {
    // 1. 准备素材和大纲
    createReferenceMaterials(projectDir);
    createOutline(projectDir);

    // 2. organize（含 G1 大纲同步 + G2 文档转换）
    const orgResult = await organizeMaterials(projectDir);
    expect(orgResult.scanStats.total).toBeGreaterThanOrEqual(2);
    expect(orgResult.kitStats.success).toBe(3);

    // 验证 G1: 章节已同步到状态
    const store = new ProjectStore(projectDir);
    let state = store.load()!;
    expect(Object.keys(state.chapters)).toHaveLength(3);
    expect(state.chapters['ch001'].status).toBe('pending');

    // 3. 手动推进到 4a（模拟用户完成大纲后启动写作）
    state.currentPhase = '4a';
    store.save(state);

    // 4. 运行 runWriteLoop（用 MockSubagentExecutor）
    const executor = new MockSubagentExecutor(projectDir);
    const loopResult = await runWriteLoop(projectDir, notify, { executorOverride: executor });

    // 验证 loop 执行了任务
    expect(loopResult.ticks).toBeGreaterThan(0);
    expect(loopResult.tasksExecuted).toBeGreaterThan(0);
    expect(loopResult.tasksSucceeded).toBeGreaterThan(0);
    expect(loopResult.tasksFailed).toBe(0);

    // 验证草稿已创建（版本化文件）
    for (const id of ['ch001', 'ch002', 'ch003']) {
      const draftPath = join(projectDir, 'drafts', 'chapters', `${id}-v1.md`);
      expect(existsSync(draftPath)).toBe(true);
    }

    // 验证审阅报告已创建
    for (const id of ['ch001', 'ch002', 'ch003']) {
      const reviewPath = join(projectDir, 'review', `${id}-r1.json`);
      expect(existsSync(reviewPath)).toBe(true);
    }

    // 5. Assemble
    const assembler = new ChapterAssembler();
    const assemblyResult = assembler.assemble(projectDir, ['ch001', 'ch002', 'ch003'], {
      title: '东方电气资产管理系统技术方案',
      generateTOC: true,
    });
    expect(assemblyResult.success).toBe(true);
    expect(assemblyResult.stats.totalChapters).toBe(3);

    const outputPath = join(projectDir, 'output', 'final.md');
    assembler.save(assemblyResult, outputPath);
    expect(existsSync(outputPath)).toBe(true);

    // 6. Finalize (G5)
    const report = finalize(projectDir);
    expect(report.readyForExport).toBe(true);
    expect(report.stats.level2Headings).toBeGreaterThanOrEqual(3);
    expect(report.stats.words).toBeGreaterThan(0);
    expect(existsSync(join(projectDir, 'output', 'finalization.json'))).toBe(true);

    // 7. Export
    const exportResult = await exportDocument(projectDir, {
      format: 'md',
      outputPath: join(projectDir, 'output', 'document.md'),
      toc: true,
    });
    expect(exportResult.success).toBe(true);

    // 验证最终输出
    const finalContent = readFileSync(outputPath, 'utf-8');
    expect(finalContent.length).toBeGreaterThan(500);
    expect(finalContent).toContain('东方电气资产管理系统技术方案');

    // 验证通知消息包含关键步骤
    const infoMessages = messages.filter(m => m.level === 'info').map(m => m.msg);
    expect(infoMessages.some(m => m.includes('已创建'))).toBe(true);
    expect(infoMessages.some(m => m.includes('执行完成'))).toBe(true);
  });

  it('runWriteLoop 返回正确的统计信息', async () => {
    createReferenceMaterials(projectDir);
    createOutline(projectDir);
    await organizeMaterials(projectDir);

    const store = new ProjectStore(projectDir);
    const state = store.load()!;
    state.currentPhase = '4a';
    store.save(state);

    const executor = new MockSubagentExecutor(projectDir);
    const loopResult = await runWriteLoop(projectDir, notify, { executorOverride: executor });

    // 3 chapters → 3 writer tasks + 3 reviewer tasks = 6 total
    expect(loopResult.tasksExecuted).toBe(6);
    expect(loopResult.tasksSucceeded).toBe(6);
    expect(loopResult.tasksFailed).toBe(0);
    expect(loopResult.stoppedReason).toBeTruthy();
  });

  it('runWriteLoop 处理无状态文件的情况', async () => {
    const emptyDir = join(TEST_ROOT, 'empty-project');
    mkdirSync(emptyDir, { recursive: true });

    const loopResult = await runWriteLoop(emptyDir, notify);

    expect(loopResult.stoppedReason).toBe('no_state');
    expect(messages.some(m => m.level === 'error' && m.msg.includes('未找到项目状态文件'))).toBe(true);
  });
});
