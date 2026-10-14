/**
 * Issue #79 回归测试：Writer 字数控制 - 硬性截断
 * 
 * 当字数超标超过 20% 时，自动截断文件内容。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';

describe('Issue #79: Writer 字数控制 - 硬性截断', () => {
  const tmpDir = join(process.cwd(), 'test-word-truncation');
  const draftsDir = join(tmpDir, 'drafts', 'chapters');
  
  beforeEach(() => {
    mkdirSync(draftsDir, { recursive: true });
  });
  
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
  
  const createMockTask = (chapterId: string): Task => ({
    id: `write-${chapterId}-r1`,
    type: 'writer',
    chapterId,
    priority: 1,
    sequence: 1,
    status: 'queued',
    attempt: 0,
    prompt: '',
    dependencies: [],
  });
  
  it('字数超标超过 20% 时应自动截断', () => {
    const chapterId = 'ch001';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    
    // 创建 12000 字的内容（超过上限 8000 的 50%）
    const longContent = '这是一个测试段落。'.repeat(2000); // ~12000 字
    writeFileSync(draftPath, longContent);
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // 应该触发截断
    const truncationCheck = result.checks.find(c => c.name === '字数截断');
    expect(truncationCheck).toBeDefined();
    expect(truncationCheck?.passed).toBe(true);
    
    // 文件应该被截断
    const truncatedContent = readFileSync(draftPath, 'utf-8');
    expect(truncatedContent.length).toBeLessThan(longContent.length);
    expect(truncatedContent.length).toBeLessThanOrEqual(8500); // 允许一些缓冲
  });
  
  it('字数超标不足 20% 时不应截断', () => {
    const chapterId = 'ch002';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    
    // 创建 9000 字的内容（超过上限 8000 的 12.5%，不足 20%）
    // 注意：中文字符每个算 1 个字符
    const content = '测'.repeat(9000);
    writeFileSync(draftPath, content);
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // 不应该触发截断（超标 12.5% < 20%）
    const truncationCheck = result.checks.find(c => c.name === '字数截断');
    expect(truncationCheck).toBeUndefined();
    
    // 文件不应该被修改
    const fileContent = readFileSync(draftPath, 'utf-8');
    expect(fileContent.length).toBe(content.length);
  });
  
  it('字数在范围内时不应截断', () => {
    const chapterId = 'ch003';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    
    // 创建 6000 字的内容（在 5000-8000 范围内）
    const content = '测'.repeat(6000);
    writeFileSync(draftPath, content);
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // 不应该触发截断
    const truncationCheck = result.checks.find(c => c.name === '字数截断');
    expect(truncationCheck).toBeUndefined();
    
    // 验证应该通过（没有错误）
    const wordCountErrors = result.errors.filter(e => e.includes('字数'));
    expect(wordCountErrors.length).toBe(0);
  });
  
  it('截断应该在段落或句子结尾处', () => {
    const chapterId = 'ch004';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    
    // 创建有明确段落结构的内容
    const paragraphs = Array(100).fill(null).map((_, i) => 
      `这是第 ${i + 1} 段的内容。这段内容用来测试截断功能。`
    );
    const content = paragraphs.join('\n\n');
    writeFileSync(draftPath, content);
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 500, max: 1000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // 应该触发截断
    const truncationCheck = result.checks.find(c => c.name === '字数截断');
    expect(truncationCheck).toBeDefined();
    
    // 截断后的内容应该包含截断标记
    const truncatedContent = readFileSync(draftPath, 'utf-8');
    expect(truncatedContent).toContain('<!-- 内容已截断以符合字数要求 -->');
  });
});
