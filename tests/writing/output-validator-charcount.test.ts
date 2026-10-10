import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OutputValidator } from '../../src/writing/output-validator.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('OutputValidator - Character Count', () => {
  const testProjectDir = '/tmp/test-output-validator';
  let validator: OutputValidator;

  beforeEach(() => {
    // Setup test directory
    mkdirSync(join(testProjectDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(testProjectDir, 'review'), { recursive: true });
    validator = new OutputValidator(testProjectDir);
  });

  afterEach(() => {
    // Cleanup
    rmSync(testProjectDir, { recursive: true, force: true });
  });

  it('should pass when character count >= 8000', () => {
    const content = '这是一段测试文本。'.repeat(1000); // ~8000 字符
    writeFileSync(
      join(testProjectDir, 'drafts', 'chapters', 'ch001-v1.md'),
      content,
      'utf-8'
    );

    const result = validator.validate(
      {
        id: 'test-task',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      },
      1
    );

    expect(result.valid).toBe(true);
    const charCheck = result.checks.find(c => c.name === '字数下限');
    expect(charCheck).toBeDefined();
    expect(charCheck?.passed).toBe(true);
  });

  it('should fail when character count < 8000', () => {
    const content = '这是一段测试文本。'.repeat(100); // ~1600 字符
    writeFileSync(
      join(testProjectDir, 'drafts', 'chapters', 'ch001-v1.md'),
      content,
      'utf-8'
    );

    const result = validator.validate(
      {
        id: 'test-task',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      },
      1
    );

    expect(result.valid).toBe(false);
    const charCheck = result.checks.find(c => c.name === '字数下限');
    expect(charCheck).toBeDefined();
    expect(charCheck?.passed).toBe(false);
    expect(result.errors.some(e => e.includes('字数不足'))).toBe(true);
  });

  it('should count characters correctly for mixed content', () => {
    const content = `# 标题

这是一段中文文本。

This is English text.

## 子标题

更多内容。`;
    
    writeFileSync(
      join(testProjectDir, 'drafts', 'chapters', 'ch001-v1.md'),
      content,
      'utf-8'
    );

    const result = validator.validate(
      {
        id: 'test-task',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      },
      1
    );

    const charCheck = result.checks.find(c => c.name === '字数下限');
    expect(charCheck).toBeDefined();
    // 应该统计所有字符（包括中英文、标点、空格）
    expect(charCheck?.detail).toContain('字');
  });

  it('should not check file size anymore', () => {
    const content = '短内容'; // 很小的文件
    writeFileSync(
      join(testProjectDir, 'drafts', 'chapters', 'ch001-v1.md'),
      content,
      'utf-8'
    );

    const result = validator.validate(
      {
        id: 'test-task',
        type: 'writer',
        chapterId: 'ch001',
        priority: 1,
        sequence: 1,
        status: 'queued',
        attempt: 0,
        prompt: '',
        dependencies: [],
      },
      1
    );

    // 不应该有文件大小检查
    const sizeCheck = result.checks.find(c => c.name === '文件大小');
    expect(sizeCheck).toBeUndefined();
  });
});
