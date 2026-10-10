/**
 * E2E 测试：验证 Writer 输出是否符合字数要求
 * 
 * 使用 OutputValidator 验证 MockExecutor 生成的内容
 * 
 * Bug 41 修复后：
 * - ContentValidator（每个子节 ≥ 5000 字）已被废弃，不再使用
 * - 字数控制由 OutputValidator 负责，检查总字数在 wordBudget 范围内
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { OutputValidator } from '../../src/writing/output-validator.js';

describe('E2E: Writer 字数验证', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cw-e2e-depth-'));
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tempDir, 'review'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('MockExecutor 生成的内容应符合字数要求', async () => {
    const scheduler = new SubagentScheduler();
    const executor = new MockSubagentExecutor(tempDir);
    const runner = new SchedulerRunner(scheduler, executor);

    // 提交写作任务
    scheduler.submit({
      id: 'write-ch001-r1',
      type: 'writer',
      chapterId: 'ch001',
      status: 'queued',
      priority: 1,
      sequence: 1,
      attempt: 0,
      prompt: 'Write chapter ch001',
      dependencies: [],
    });

    // 执行任务
    const result = await runner.runUntilIdle();
    expect(result.succeeded).toBe(1);

    // 读取生成的内容
    const draftPath = join(tempDir, 'drafts', 'chapters', 'ch001-v1.md');
    expect(existsSync(draftPath)).toBe(true);
    const content = readFileSync(draftPath, 'utf-8');

    // Bug 41 修复：使用 OutputValidator 验证字数
    const validator = new OutputValidator(tempDir);
    const task = {
      id: 'write-ch001-r1',
      type: 'writer' as const,
      chapterId: 'ch001',
      status: 'completed' as const,
      priority: 1,
      sequence: 1,
      attempt: 0,
      prompt: 'Write chapter ch001',
      dependencies: [],
    };
    const validationResult = validator.validate(task, 1, { min: 5200, max: 7800 });

    // 验证结果
    if (!validationResult.valid) {
      console.log('验证失败:', validationResult.errors);
      console.log('检查项:', validationResult.checks);
    }
    expect(validationResult.valid).toBe(true);
  });
});
