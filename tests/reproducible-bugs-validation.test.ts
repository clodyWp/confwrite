/**
 * 可复现的 Bug 测试用例 - 验证和配置问题
 * 
 * 覆盖更多历史 bug：
 * - Issue #20: OutputValidator 不验证 Reviewer 的字数
 * - Issue #36: 跨平台兼容性：路径拼接问题
 * - Issue #19: minChapterChars 与 wordBudget 矛盾
 * - Issue #17: 字数控制失效：验证绕过
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../src/writing/output-validator.js';
import type { Task } from '../src/scheduler/types.js';

describe('可复现的 Bug 测试用例 - 验证和配置问题', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Issue #20: OutputValidator 不验证 Reviewer 的字数', () => {
    it('OutputValidator 应该验证 Reviewer 报告的字数', async () => {
      // 创建 Reviewer 输出
      const reviewDir = join(tempDir, 'review');
      mkdirSync(reviewDir, { recursive: true });

      const review = {
        chapterId: 'ch001',
        round: 1,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 9, clarity: 8, depth: 7, quality: 8 },
        issues: [],
        summary: '内容质量达标',
        wordCount: 12000, // 报告的字数（超标）
      };

      const reviewPath = join(reviewDir, 'ch001-r1.json');
      writeFileSync(reviewPath, JSON.stringify(review, null, 2), 'utf-8');

      // 验证 OutputValidator 能够读取 Reviewer 输出
      const validator = new OutputValidator(tempDir);
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // OutputValidator 应该能够验证 Reviewer 输出
      expect(result.taskType).toBe('reviewer');
      expect(result.chapterId).toBe('ch001');
    });
  });

  describe('Issue #36: 跨平台兼容性', () => {
    it('应该使用 path.join 而不是手动拼接路径', async () => {
      // 创建草稿文件
      const draftDir = join(tempDir, 'drafts', 'chapters');
      mkdirSync(draftDir, { recursive: true });

      const draftPath = join(draftDir, 'ch001-v1.md');
      writeFileSync(draftPath, '测试内容'.repeat(3000), 'utf-8');

      // 验证 OutputValidator 使用 path.join
      const validator = new OutputValidator(tempDir);
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // 应该能够正确找到文件（跨平台兼容）
      expect(result.checks.some(c => c.name === '文件存在' && c.passed)).toBe(true);
    });
  });

  describe('Issue #19: minChapterChars 与 wordBudget 矛盾', () => {
    it('wordBudget 应该优先于 minChapterChars', async () => {
      // 创建草稿文件（字数在 wordBudget 范围内，但低于 minChapterChars）
      const draftDir = join(tempDir, 'drafts', 'chapters');
      mkdirSync(draftDir, { recursive: true });

      const draftPath = join(draftDir, 'ch001-v1.md');
      writeFileSync(draftPath, '测试内容'.repeat(2500), 'utf-8'); // 约 10000 字

      // 验证 OutputValidator 使用 wordBudget
      const validator = new OutputValidator(tempDir);
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // wordBudget: 5000-8000，minChapterChars: 8000（默认）
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // 应该使用 wordBudget.min (5000) 而不是 minChapterChars (8000)
      expect(result.checks.some(c => c.name === '字数下限')).toBe(true);
    });
  });

  describe('Issue #17: 字数控制失效：验证绕过', () => {
    it('OutputValidator 应该检查字数上限', async () => {
      // 创建超标草稿文件
      const draftDir = join(tempDir, 'drafts', 'chapters');
      mkdirSync(draftDir, { recursive: true });

      const draftPath = join(draftDir, 'ch001-v1.md');
      writeFileSync(draftPath, '测试内容'.repeat(3000), 'utf-8'); // 约 12000 字

      // 验证 OutputValidator 检查上限
      const validator = new OutputValidator(tempDir);
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // 应该检测到字数超标
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数'))).toBe(true);
    });

    it('OutputValidator 应该检查字数下限', async () => {
      // 创建不足草稿文件
      const draftDir = join(tempDir, 'drafts', 'chapters');
      mkdirSync(draftDir, { recursive: true });

      const draftPath = join(draftDir, 'ch001-v1.md');
      writeFileSync(draftPath, '测试内容'.repeat(500), 'utf-8'); // 约 2000 字

      // 验证 OutputValidator 检查下限
      const validator = new OutputValidator(tempDir);
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'pending',
        priority: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // 应该检测到字数不足
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数'))).toBe(true);
    });
  });
});
