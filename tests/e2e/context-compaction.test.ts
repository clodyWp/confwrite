/**
 * 上下文压缩功能测试
 * 
 * 测试 compact 逻辑：
 * - 超过阈值时触发压缩
 * - 压缩失败时重试
 * - 重试仍失败时暂停并通知用户
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWriteLoop } from '../../src/index.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { initProject } from '../../src/commands/init.js';
import { organizeMaterials } from '../../src/commands/organize.js';
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Context Compaction', () => {
  let workspaceDir: string;
  let projectDir: string;
  let mockExecutor: MockSubagentExecutor;

  beforeEach(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'confwrite-compact-'));
    
    // 初始化项目
    const initResult = initProject({
      slug: 'test-project',
      workspaceDir,
    });
    projectDir = initResult.projectDir;
    
    // 创建大纲
    writeFileSync(join(projectDir, 'outline.md'), `# 测试项目\n\n## ch001 测试章节\n\n测试内容`);
    
    // 创建素材目录和文件
    mkdirSync(join(projectDir, 'reference_material'), { recursive: true });
    writeFileSync(join(projectDir, 'reference_material', 'test.md'), `# 测试素材\n\n这是测试内容。`);
    
    // 整理素材
    await organizeMaterials(projectDir);
    
    // 设置 mock executor
    mockExecutor = new MockSubagentExecutor(projectDir);
  });

  afterEach(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('should not trigger compact when threshold is 0', async () => {
    const notify = vi.fn();
    const getContextTokens = vi.fn(() => 200000); // 200k tokens
    const triggerCompact = vi.fn();

    // threshold = 0 表示禁用
    const result = await runWriteLoop(projectDir, notify, {
      executorOverride: mockExecutor,
      getContextTokens,
      triggerCompact,
      configOverride: { compactThresholdTokens: 0 },
    });

    expect(triggerCompact).not.toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });

  it('should trigger compact when tokens exceed threshold', async () => {
    const notify = vi.fn();
    
    // 第一次返回高 token，compact 成功后返回低 token
    let tokenCount = 150000;
    const getContextTokens = vi.fn(() => tokenCount);
    const triggerCompact = vi.fn().mockImplementation(() => {
      tokenCount = 50000;
      return Promise.resolve();
    });

    const result = await runWriteLoop(projectDir, notify, {
      executorOverride: mockExecutor,
      getContextTokens,
      triggerCompact,
      configOverride: { compactThresholdTokens: 120000 }, // 阈值 120k
    });

    expect(triggerCompact).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('触发压缩'), 'warning');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('压缩完成'), 'info');
    expect(result.completed).toBe(true);
  });

  it('should retry once when compact fails', async () => {
    const notify = vi.fn();
    
    // 第一次返回高 token，compact 成功后返回低 token
    let tokenCount = 150000;
    const getContextTokens = vi.fn(() => tokenCount);
    
    // 第一次失败，第二次成功
    let callCount = 0;
    const triggerCompact = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('compact failed'));
      }
      // compact 成功后降低 token
      tokenCount = 50000;
      return Promise.resolve();
    });

    const result = await runWriteLoop(projectDir, notify, {
      executorOverride: mockExecutor,
      getContextTokens,
      triggerCompact,
      configOverride: { compactThresholdTokens: 120000 },
    });

    expect(triggerCompact).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('重试'), 'warning');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('压缩完成'), 'info');
    expect(result.completed).toBe(true);
  });

  it('should pause when compact fails after retry', async () => {
    const notify = vi.fn();
    const getContextTokens = vi.fn(() => 150000);
    const triggerCompact = vi.fn().mockRejectedValue(new Error('compact failed'));

    const result = await runWriteLoop(projectDir, notify, {
      executorOverride: mockExecutor,
      getContextTokens,
      triggerCompact,
      configOverride: { compactThresholdTokens: 120000 },
    });

    // 重试 2 次后失败
    expect(triggerCompact).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('压缩失败'), 'error');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('手动执行'), 'info');
    expect(result.stoppedReason).toBe('compact_failed');
    expect(result.completed).toBe(false);
  });

  it('should not check compact when getContextTokens returns null', async () => {
    const notify = vi.fn();
    const getContextTokens = vi.fn(() => null);
    const triggerCompact = vi.fn();

    const result = await runWriteLoop(projectDir, notify, {
      executorOverride: mockExecutor,
      getContextTokens,
      triggerCompact,
      configOverride: { compactThresholdTokens: 120000 },
    });

    expect(triggerCompact).not.toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });
});
