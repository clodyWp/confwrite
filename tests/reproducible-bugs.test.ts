/**
 * 可复现的 Bug 测试用例
 * 
 * 使用 ConfigurableMockExecutor 模拟真实的 bug 场景
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigurableMockExecutor } from '../src/scheduler/configurable-mock-executor.js';
import { OutputValidator } from '../src/writing/output-validator.js';
import type { Task } from '../src/scheduler/types.js';

describe('可复现的 Bug 测试用例', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Issue #80: Reviewer verdict 矛盾', () => {
    it('Writer 生成超标内容，Reviewer 返回 accept 但指出字数问题', async () => {
      // 配置：Writer 生成 12000 字（上限 8000），Reviewer 返回 accept 但指出字数超标
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: {
          wordCount: 12000,
          behavior: 'exceeds_limit',
        },
        reviewer: {
          verdict: 'accept',
          contradictory: true, // 产生矛盾
          issues: ['字数超标 50%，需要压缩'],
        },
      });

      // 执行 Writer
      const writeTask: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(writeTask);

      // 验证 Writer 生成了超标内容
      const draftPath = join(tempDir, 'drafts', 'chapters', 'ch001-v1.md');
      const content = readFileSync(draftPath, 'utf-8');
      expect(content.length).toBe(12000);

      // 执行 Reviewer
      const reviewTask: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(reviewTask);

      // 验证 Reviewer 返回了矛盾的审阅报告
      const reviewPath = join(tempDir, 'review', 'ch001-r1.json');
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
      
      expect(review.verdict).toBe('accept');
      expect(review.issues).toContain('字数超标 50%，需要压缩');

      // 使用 OutputValidator 验证 Writer 输出
      const validator = new OutputValidator(tempDir);
      const validationResult = validator.validate(writeTask, 1, { min: 5000, max: 8000 });

      // 应该检测到字数超标
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.some(e => e.includes('字数'))).toBe(true);
    });
  });

  describe('Issue #96: 字数截断方案导致恶性循环', () => {
    it('Writer 生成超标内容，Fixer 过度补偿生成更严重超标内容', async () => {
      // 配置：Writer 生成 12000 字，Fixer 过度补偿生成 14000 字
      
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: {
          wordCount: 12000,
          behavior: 'exceeds_limit',
        },
        fixer: {
          wordCount: 14000,
          behavior: 'over_compensate',
        },
      });

      // 执行 Writer
      const writeTask: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(writeTask);

      // 验证 Writer 生成了超标内容
      const draftPath = join(tempDir, 'drafts', 'chapters', 'ch001-v1.md');
      const content = readFileSync(draftPath, 'utf-8');
      expect(content.length).toBe(12000);

      // 执行 Fixer（模拟修复后）
      const fixTask: Task = {
        id: 'fix-ch001-r1',
        type: 'fixer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(fixTask);

      // 验证 Fixer 生成了更严重超标的内容
      const fixedPath = join(tempDir, 'drafts', 'chapters', 'ch001-v2.md');
      const fixedContent = readFileSync(fixedPath, 'utf-8');
      
      // 验证 Fixer 输出超过 Writer 输出（恶性循环）
      expect(fixedContent.length).toBeGreaterThan(content.length);

      // 使用 OutputValidator 验证 Fixer 输出
      const validator = new OutputValidator(tempDir);
      const validationResult = validator.validate(fixTask, 2, { min: 5000, max: 8000 });

      // 应该检测到字数超标
      expect(validationResult.valid).toBe(false);
    });
  });

  describe('Issue #42: LLM 不遵守字数约束', () => {
    it('Writer 生成符合字数要求的内容', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: {
          wordCount: 6000, // 在上限内
          behavior: 'normal',
        },
      });

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(task);

      // 使用 OutputValidator 验证
      const validator = new OutputValidator(tempDir);
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      expect(result.valid).toBe(true);
    });

    it('Writer 生成超过字数上限的内容', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: {
          wordCount: 10000, // 超过上限 8000
          behavior: 'exceeds_limit',
        },
      });

      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await executor.execute(task);

      // 使用 OutputValidator 验证
      const validator = new OutputValidator(tempDir);
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // OutputValidator 会检查上限，所以应该失败
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数'))).toBe(true);
    });
  });
});
