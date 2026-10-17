/**
 * E2E v26 回归测试：verdict 一致性检查增强
 * 
 * Issue #80: Reviewer verdict 矛盾
 * 
 * 当独立字数验证发现超标但 verdict 是 accept 时，应该标记为验证失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';

describe('Issue #80: verdict 一致性检查增强', () => {
  const tmpDir = join(process.cwd(), 'test-verdict-consistency');
  const reviewDir = join(tmpDir, 'review');
  const draftsDir = join(tmpDir, 'drafts', 'chapters');
  
  beforeEach(() => {
    mkdirSync(reviewDir, { recursive: true });
    mkdirSync(draftsDir, { recursive: true });
  });
  
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
  
  const createMockTask = (chapterId: string): Task => ({
    id: `review-${chapterId}-r1`,
    type: 'reviewer',
    chapterId,
    priority: 1,
    sequence: 1,
    status: 'queued',
    attempt: 0,
    prompt: '',
    dependencies: [],
  });
  
  it('verdict=accept 但字数超标时应修正 verdict（SM-22）', () => {
    // 创建超标的草稿
    const chapterId = 'ch001';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    // 创建 10000 字的内容（超过上限 8000）
    writeFileSync(draftPath, '测试内容'.repeat(2500)); // ~10000 字
    
    // 创建审阅报告（verdict=accept 但实际字数超标）
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify({
      verdict: 'accept',
      issues: [],
      summary: '内容质量良好',
    }));
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // SM-22: reviewer 验收不绑草稿字数，验证通过但 verdict 被修正
    expect(result.valid).toBe(true);
    expect(result.verdictCorrected).toBe(true);
    expect(result.correctedVerdict).toBe('revise');
    expect(result.correctionReason).toContain('草稿超预算');
  });
  
  it('verdict=accept 但字数不足时应修正 verdict（SM-22）', () => {
    // 创建字数不足的草稿
    const chapterId = 'ch002';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    // 创建 3000 字的内容（不足下限 5000）
    writeFileSync(draftPath, '测试内容'.repeat(750)); // ~3000 字
    
    // 创建审阅报告（verdict=accept 但实际字数不足）
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify({
      verdict: 'accept',
      issues: [],
      summary: '内容质量良好',
    }));
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // SM-22: reviewer 验收不绑草稿字数，验证通过但 verdict 被修正
    expect(result.valid).toBe(true);
    expect(result.verdictCorrected).toBe(true);
    expect(result.correctedVerdict).toBe('revise');
    expect(result.correctionReason).toContain('草稿超预算');
  });
  
  it('verdict=accept 且字数在范围内时应验证通过', () => {
    // 创建字数合适的草稿
    const chapterId = 'ch003';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    // 创建 6000 字的内容（在 5000-8000 范围内）
    writeFileSync(draftPath, '测试内容'.repeat(1500)); // ~6000 字
    
    // 创建审阅报告（verdict=accept 且字数合适）
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify({
      verdict: 'accept',
      issues: [],
      summary: '内容质量良好',
    }));
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // 应该通过（没有 verdict 矛盾）
    const verdictErrors = result.errors.filter(e => e.includes('verdict 矛盾'));
    expect(verdictErrors.length).toBe(0);
  });
  
  it('verdict=revise 且字数超标时应验证通过（一致）', () => {
    // 创建超标的草稿
    const chapterId = 'ch004';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    writeFileSync(draftPath, '测试内容'.repeat(2500)); // ~10000 字
    
    // 创建审阅报告（verdict=revise 且字数超标）
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify({
      verdict: 'revise',
      issues: [{ severity: 'high', description: '字数超标，需要精简' }],
      summary: '内容需要精简',
    }));
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    // verdict 一致性检查应该通过（verdict=revise 与字数超标一致）
    const verdictErrors = result.errors.filter(e => e.includes('verdict 矛盾'));
    expect(verdictErrors.length).toBe(0);
  });
  
  it('verdict=accept 但 issues 中提到字数问题时应验证失败', () => {
    // 创建字数合适的草稿
    const chapterId = 'ch005';
    const round = 1;
    const draftPath = join(draftsDir, `${chapterId}-v${round}.md`);
    writeFileSync(draftPath, '测试内容'.repeat(1500)); // ~6000 字
    
    // 创建审阅报告（verdict=accept 但 issues 中提到字数问题）
    const reviewPath = join(reviewDir, `${chapterId}-r${round}.json`);
    writeFileSync(reviewPath, JSON.stringify({
      verdict: 'accept',
      issues: [{ severity: 'medium', description: '字数略多，建议精简' }],
      summary: '内容质量良好',
    }));
    
    const validator = new OutputValidator(tmpDir);
    const task = createMockTask(chapterId);
    const wordBudget = { min: 5000, max: 8000 };
    
    const result = validator.validate(task, round, wordBudget);
    
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('verdict 矛盾'))).toBe(true);
  });
});
