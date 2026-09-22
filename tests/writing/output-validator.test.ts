/**
 * OutputValidator tests — 即时验证 subagent 输出
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';

function makeTask(type: 'writer' | 'reviewer' | 'fixer', chapterId: string): Task {
  return {
    id: `${type}-${chapterId}-r1`,
    type,
    chapterId,
    priority: 1,
    sequence: 1,
    status: 'completed',
    attempt: 0,
    prompt: '',
    dependencies: [],
  };
}

describe('OutputValidator', () => {
  const tmpDir = join(process.cwd(), '.test-output-validator');

  beforeEach(() => {
    mkdirSync(join(tmpDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(tmpDir, 'review'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Writer output validation', () => {
    it('should pass when file exists, enough characters, and readable', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('writer', 'ch001');
      
      // Create a valid draft file with >= 8000 characters
      const content = '# Chapter 1\n\n' + '中文字符测试'.repeat(2000);
      writeFileSync(join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md'), content);
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.checks.find(c => c.name === '文件存在')?.passed).toBe(true);
      expect(result.checks.find(c => c.name === '字数统计')?.passed).toBe(true);
      expect(result.checks.find(c => c.name === '文件可读')?.passed).toBe(true);
    });

    it('should fail when file does not exist', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('writer', 'ch001');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('不存在');
    });

    it('should fail when character count is too low', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('writer', 'ch001');
      
      writeFileSync(join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md'), '# Small');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数不足'))).toBe(true);
    });

    it('should fail when file has encoding corruption', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('writer', 'ch001');
      
      // Write file with replacement character
      const content = '# Chapter\n\n' + '\uFFFD'.repeat(10) + 'A'.repeat(2000);
      writeFileSync(join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md'), content);
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('编码损坏'))).toBe(true);
    });
  });

  describe('Reviewer output validation', () => {
    it('should pass when JSON exists, is valid, and has valid verdict', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('reviewer', 'ch001');
      
      const review = {
        chapterId: 'ch001',
        round: 1,
        verdict: 'accept',
        scores: { accuracy: 8, consistency: 9 },
        issues: [],
        summary: 'Good',
      };
      writeFileSync(join(tmpDir, 'review', 'ch001-r1.json'), JSON.stringify(review));
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when JSON file does not exist', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('reviewer', 'ch001');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('不存在');
    });

    it('should fail when JSON is empty', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('reviewer', 'ch001');
      
      writeFileSync(join(tmpDir, 'review', 'ch001-r1.json'), '');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('为空');
    });

    it('should fail when JSON is invalid', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('reviewer', 'ch001');
      
      writeFileSync(join(tmpDir, 'review', 'ch001-r1.json'), '{invalid json}');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('JSON 格式错误');
    });

    it('should fail when verdict is invalid', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('reviewer', 'ch001');
      
      const review = { verdict: 'maybe' };
      writeFileSync(join(tmpDir, 'review', 'ch001-r1.json'), JSON.stringify(review));
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('verdict 无效');
    });

    it('should accept all valid verdicts', () => {
      const validator = new OutputValidator(tmpDir);
      
      for (const verdict of ['accept', 'revise', 'reject']) {
        const task = makeTask('reviewer', 'ch001');
        const review = { verdict };
        writeFileSync(join(tmpDir, 'review', 'ch001-r1.json'), JSON.stringify(review));
        
        const result = validator.validate(task, 1);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('Fixer output validation', () => {
    it('should pass when new version file exists and is valid', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('fixer', 'ch001');
      
      // Fixer outputs v2 (round 1 → round 2) with >= 8000 characters
      const content = '# Fixed Chapter\n\n' + '中文字符测试'.repeat(2000);
      writeFileSync(join(tmpDir, 'drafts', 'chapters', 'ch001-v2.md'), content);
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when new version file does not exist', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('fixer', 'ch001');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('不存在');
    });

    it('should fail when new version character count is too low', () => {
      const validator = new OutputValidator(tmpDir);
      const task = makeTask('fixer', 'ch001');
      
      writeFileSync(join(tmpDir, 'drafts', 'chapters', 'ch001-v2.md'), '# Small fix');
      
      const result = validator.validate(task, 1);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('字数不足'))).toBe(true);
    });
  });

  describe('formatErrors', () => {
    it('should format validation errors', () => {
      const result = {
        valid: false,
        taskType: 'writer',
        chapterId: 'ch001',
        checks: [],
        errors: ['File missing', 'Too small'],
      };
      
      const msg = OutputValidator.formatErrors(result);
      
      expect(msg).toContain('验证失败');
      expect(msg).toContain('writer');
      expect(msg).toContain('ch001');
      expect(msg).toContain('File missing');
      expect(msg).toContain('Too small');
    });
  });
});
