/**
 * JSON 修复逻辑测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OutputValidator } from '../../src/writing/output-validator.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('JSON 修复逻辑', () => {
  const testProjectDir = join(process.cwd(), 'test-project-json-fix');
  const reviewDir = join(testProjectDir, 'review');

  beforeEach(() => {
    // 清理测试目录
    try {
      rmSync(testProjectDir, { recursive: true, force: true });
    } catch {}
    
    // 创建测试目录
    mkdirSync(reviewDir, { recursive: true });
  });

  const validator = new OutputValidator(testProjectDir);

  it('应该直接解析正确的 JSON', () => {
    const validJson = `{
  "chapterId": "ch001",
  "round": 1,
  "verdict": "accept",
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [],
  "summary": "总体评价"
}`;
    
    writeFileSync(join(reviewDir, 'ch001-r1.json'), validJson);
    
    const result = validator.validate({
      id: 'review-ch001-r1',
      type: 'reviewer',
      chapterId: 'ch001',
      status: 'completed',
      prompt: '',
      attempt: 0,
      priority: 0,
    }, 1);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('应该修复包含注释的 JSON', () => {
    const jsonWithComments = `{
  "chapterId": "ch002",
  "round": 1,
  "verdict": "accept", // 这是注释
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [],
  "summary": "总体评价"
}`;
    
    writeFileSync(join(reviewDir, 'ch002-r1.json'), jsonWithComments);
    
    const result = validator.validate({
      id: 'review-ch002-r1',
      type: 'reviewer',
      chapterId: 'ch002',
      status: 'completed',
      prompt: '',
      attempt: 0,
      priority: 0,
    }, 1);
    
    expect(result.valid).toBe(true);
  });

  it('应该修复包含中文引号的 JSON', () => {
    // 真实的错误 JSON：description 中包含中文引号
    const jsonWithChineseQuotes = `{
  "chapterId": "ch004",
  "round": 1,
  "verdict": "revise",
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [
    {
      "severity": "medium",
      "description": "内容不足，需要扩充“示例”",
      "location": "section-2.1",
      "suggestion": "补充案例"
    }
  ],
  "summary": "总体评价"
}`;
    
    writeFileSync(join(reviewDir, 'ch004-r1.json'), jsonWithChineseQuotes);
    
    const result = validator.validate({
      id: 'review-ch004-r1',
      type: 'reviewer',
      chapterId: 'ch004',
      status: 'completed',
      prompt: '',
      attempt: 0,
      priority: 0,
    }, 1);
    
    // 应该能修复并验证通过
    expect(result.valid).toBe(true);
  });

  it('无法修复的 JSON 应该标记为失败', () => {
    // 包含未转义引号的 JSON（当前无法修复）
    const jsonWithUnescapedQuotes = String.raw`{
  "chapterId": "ch005",
  "round": 1,
  "verdict": "accept",
  "scores": {
    "accuracy": 8,
    "consistency": 9,
    "clarity": 8,
    "depth": 7,
    "quality": 8
  },
  "issues": [
    {
      "severity": "medium",
      "description": "内容不足"示例"",
      "location": "section-2.1",
      "suggestion": "补充案例"
    }
  ],
  "summary": "总体评价"
}`;
    
    writeFileSync(join(reviewDir, 'ch005-r1.json'), jsonWithUnescapedQuotes);
    
    const result = validator.validate({
      id: 'review-ch005-r1',
      type: 'reviewer',
      chapterId: 'ch005',
      status: 'completed',
      prompt: '',
      attempt: 0,
      priority: 0,
    }, 1);
    
    // 无法修复，应该验证失败
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
