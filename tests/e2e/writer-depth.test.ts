/**
 * E2E 测试：验证 Writer 输出是否符合深度要求
 * 
 * 使用 ContentValidator 验证 MockExecutor 生成的内容
 * 
 * TDD: 先写测试，确认失败，再修改 MockExecutor
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import { MockSubagentExecutor } from '../../src/scheduler/mock-executor.js';
import { ContentValidator } from '../../src/writing/content-validator.js';

describe('E2E: Writer 内容深度验证', () => {
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

  it('MockExecutor 生成的内容应符合深度要求', async () => {
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

    // 使用 ContentValidator 验证
    const validator = new ContentValidator();
    const validationResult = validator.validate(content);

    // 验证结果
    expect(validationResult.sectionLengthValid).toBe(true);
    expect(validationResult.paragraphLengthValid).toBe(true);
    expect(validationResult.isValid).toBe(true);
  });
});
