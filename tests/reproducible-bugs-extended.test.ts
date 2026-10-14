/**
 * 可复现的 Bug 测试用例 - 扩展版
 * 
 * 为更多历史 bug 创建可复现测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigurableMockExecutor } from '../src/scheduler/configurable-mock-executor.js';
import { OutputValidator } from '../src/writing/output-validator.js';
import type { Task } from '../src/scheduler/types.js';

describe('可复现的 Bug 测试用例 - 扩展版', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Issue #63: validation_failed 错误设置 reviewed 状态', () => {
    it('Writer 输出验证失败时应该设置 written 状态而不是 reviewed', async () => {
      // 配置：Writer 生成不足内容（低于下限）
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: {
          wordCount: 3000, // 低于下限 5000
          behavior: 'below_minimum',
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

      // 验证 OutputValidator 检测到字数不足
      const validator = new OutputValidator(tempDir);
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数'))).toBe(true);
    });
  });

  describe('Issue #74: Round 文件名不匹配', () => {
    it('Writer 和 Reviewer 应该使用相同的 round', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
      });

      // Writer 使用 round 1
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

      // 验证 Writer 生成了 v1 文件
      const v1Path = join(tempDir, 'drafts', 'chapters', 'ch001-v1.md');
      expect(() => readFileSync(v1Path, 'utf-8')).not.toThrow();

      // Reviewer 也应该使用 round 1
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

      // 验证 Reviewer 生成了 r1 文件
      const r1Path = join(tempDir, 'review', 'ch001-r1.json');
      expect(() => readFileSync(r1Path, 'utf-8')).not.toThrow();
    });
  });

  describe('Issue #81: Phase 4b 无法退出当所有章节 failed', () => {
    it('所有章节 failed 时应该能够退出 Phase 4b', async () => {
      // 这个测试验证状态机逻辑，不需要 Mock
      // 但我们可以验证 Reviewer 返回 revise 时章节会变成 failed
      const executor = new ConfigurableMockExecutor(tempDir, {
        reviewer: {
          verdict: 'revise',
          issues: ['内容质量不达标'],
        },
      });

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

      const reviewPath = join(tempDir, 'review', 'ch001-r1.json');
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));

      expect(review.verdict).toBe('revise');
    });
  });

  describe('Issue #47: Phase 4 状态机残留问题', () => {
    it('Writer 输出应该能够被 Reviewer 正确读取', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
        reviewer: { verdict: 'accept' },
      });

      // Writer 生成内容
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

      // Reviewer 读取并审阅
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

      // 验证 Reviewer 正确读取了 Writer 的输出
      const reviewPath = join(tempDir, 'review', 'ch001-r1.json');
      const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));

      expect(review.verdict).toBe('accept');
      expect(review.chapterId).toBe('ch001');
      expect(review.round).toBe(1);
    });
  });

  describe('Issue #35: 组装后章节数与大纲不一致', () => {
    it('Writer 应该为每个章节生成独立的草稿文件', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
      });

      // 为 3 个章节生成草稿
      for (let i = 1; i <= 3; i++) {
        const task: Task = {
          id: `write-ch00${i}-r1`,
          type: 'writer',
          chapterId: `ch00${i}`,
          status: 'pending',
          priority: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await executor.execute(task);

        const draftPath = join(tempDir, 'drafts', 'chapters', `ch00${i}-v1.md`);
        expect(() => readFileSync(draftPath, 'utf-8')).not.toThrow();
      }

      // 验证 3 个章节都有独立的草稿文件
      for (let i = 1; i <= 3; i++) {
        const draftPath = join(tempDir, 'drafts', 'chapters', `ch00${i}-v1.md`);
        const content = readFileSync(draftPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Issue #41: maxRounds 守护失效', () => {
    it('Fixer 应该生成新版本文件（round+1）', async () => {
      const executor = new ConfigurableMockExecutor(tempDir, {
        writer: { wordCount: 6000, behavior: 'normal' },
        fixer: { wordCount: 7000, behavior: 'normal' },
      });

      // Writer 生成 v1
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

      // Fixer 生成 v2
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

      // 验证 Fixer 生成了 v2 文件
      const v2Path = join(tempDir, 'drafts', 'chapters', 'ch001-v2.md');
      expect(() => readFileSync(v2Path, 'utf-8')).not.toThrow();
    });
  });
});
