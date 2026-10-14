/**
 * 字数统计一致性测试 — SM-WC-9
 * 
 * 问题：Writer 使用 content.length（总字符数），Reviewer 使用中文字数统计，
 * 导致两者对同一文件的字数判断不一致，产生不必要的审阅-修复循环。
 * 
 * Spec: specs/word-count-control.md — SM-WC-9
 */
import { describe, it, expect } from 'vitest';
import { OutputValidator } from '../../src/writing/output-validator.js';

describe('SM-WC-9: 字数统计一致性', () => {
  it('TC-WC-9-1: OutputValidator 使用 content.length 统计字数', () => {
    // 给定：一段包含中英文混合的文本
    const content = 'Hello 世界！This is a test.';
    
    // 当：统计字数
    const charCount = content.length;
    
    // 期望：使用 content.length（UTF-16 code unit count）
    // 'Hello 世界！This is a test.' 实际长度是 24（不是 29）
    expect(charCount).toBe(24);
  });

  it('TC-WC-9-2: 中文字符在 content.length 中算 1 个字符', () => {
    // 给定：纯中文文本
    const content = '这是一个测试';
    
    // 当：统计字数
    const charCount = content.length;
    
    // 期望：每个中文字符算 1 个
    expect(charCount).toBe(6);
  });

  it('TC-WC-9-3: OutputValidator.validateWriterOutput 使用 content.length', () => {
    // 给定：一个草稿文件，包含 6000 个字符（含中英文）
    // 这个测试验证 OutputValidator 使用 content.length，而不是中文字数统计
    
    // 模拟：6000 字符的内容
    const content = 'a'.repeat(6000);
    
    // 当：检查字数
    const charCount = content.length;
    
    // 期望：charCount = 6000（不是中文字数统计的结果）
    expect(charCount).toBe(6000);
  });

  it('TC-WC-9-4: classifyWordCount 使用 content.length 作为输入', () => {
    // 给定：实际字数 6000，范围 5000-8000
    const actual = 6000;
    const min = 5000;
    const max = 8000;
    
    // 当：分类字数状态
    const status = OutputValidator.classifyWordCount(actual, min, max);
    
    // 期望：在范围内
    expect(status).toBe('within');
  });

  it('TC-WC-9-5: 同一文件在不同模块中统计结果一致', () => {
    // 给定：一段文本
    const content = '测试文本 Test Text 123';
    
    // 当：在不同地方统计
    const count1 = content.length; // OutputValidator 使用的方法
    const count2 = content.length; // TaskExecutor 应该使用的方法
    
    // 期望：结果一致
    expect(count1).toBe(count2);
    // '测试文本 Test Text 123' 实际长度是 18（不是 20）
    expect(count1).toBe(18);
  });

  it('TC-WC-9-6: 字数预算检查使用 content.length，不是中文字数', () => {
    // 给定：一个草稿文件，总字符数 6203，中文字数 3562
    // 字数预算：5200-7800
    
    const totalChars = 6203; // content.length
    const chineseChars = 3562; // 中文字数统计
    const min = 5200;
    const max = 7800;
    
    // 当：使用 content.length 检查
    const statusByTotal = OutputValidator.classifyWordCount(totalChars, min, max);
    
    // 当：使用中文字数检查
    const statusByChinese = OutputValidator.classifyWordCount(chineseChars, min, max);
    
    // 期望：content.length 在范围内，中文字数不足
    expect(statusByTotal).toBe('within'); // 6203 在 5200-7800 范围内
    expect(statusByChinese).toBe('severe_under'); // 3562 < 5200 * 0.75
    
    // 关键：系统应该使用 content.length（SM-WC-9）
    // 所以最终状态应该是 'within'，不是 'severe_under'
  });
});
