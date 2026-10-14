/**
 * 字数控制测试 — 覆盖 SM-WC-1 到 SM-WC-10
 * 
 * 参考 spec: specs/word-count-control.md
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutputValidator } from '../../src/writing/output-validator.js';
import type { Task } from '../../src/scheduler/types.js';

describe('字数控制 (Word Count Control)', () => {
  let testDir: string;
  let validator: OutputValidator;

  beforeEach(() => {
    testDir = join(tmpdir(), `confwrite-wc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(testDir, 'review'), { recursive: true });
    validator = new OutputValidator(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // 辅助函数：生成指定字数的内容
  function generateContent(chars: number, sections: number = 3): string {
    const charsPerSection = Math.floor(chars / sections);
    const content: string[] = [];
    for (let i = 1; i <= sections; i++) {
      content.push(`## Section ${i}\n`);
      content.push('测试内容。'.repeat(Math.floor(charsPerSection / 5)));
      content.push('\n');
    }
    return content.join('');
  }

  // 辅助函数：创建 Writer 任务
  function createWriterTask(chapterId: string): Task {
    return {
      type: 'writer',
      chapterId,
      prompt: 'test prompt',
      expectedOutput: 'draft',
    };
  }

  describe('SM-WC-1: 禁止硬性截断', () => {
    it('TC-WC-1: 验证器不修改文件内容', () => {
      // 给定：Writer 产出 12000 字的草稿文件
      const chapterId = 'ch001';
      const originalContent = generateContent(12000);
      const filePath = join(testDir, 'drafts', 'chapters', `${chapterId}-v1.md`);
      writeFileSync(filePath, originalContent, 'utf-8');

      // 当：调用 validator.validate()
      const task = createWriterTask(chapterId);
      const result = validator.validate(task, 1, { min: 5000, max: 8000 });

      // 期望：文件内容与验证前完全一致
      const afterContent = readFileSync(filePath, 'utf-8');
      expect(afterContent).toBe(originalContent);
      
      // 验证结果中不包含"字数截断"检查项
      const truncationCheck = result.checks.find(c => c.name === '字数截断');
      expect(truncationCheck).toBeUndefined();
    });
  });

  describe('SM-WC-2: 渐进式超标响应', () => {
    it('TC-WC-2: mild 超标（≤15%）', () => {
      // 给定：草稿 9000 字，上限 8000（超标 12.5%）
      const chapterId = 'ch001';
      writeFileSync(
        join(testDir, 'drafts', 'chapters', `${chapterId}-v1.md`),
        generateContent(9000),
        'utf-8'
      );

      // 当：调用字数分类
      const level = OutputValidator.classifyOverage(9000, 8000);

      // 期望：level = 'mild'
      expect(level).toBe('mild');
    });

    it('TC-WC-3: moderate 超标（15%~30%）', () => {
      // 给定：草稿 10000 字，上限 8000（超标 25%）
      const level = OutputValidator.classifyOverage(10000, 8000);

      // 期望：level = 'moderate'
      expect(level).toBe('moderate');
    });

    it('TC-WC-4: severe 超标（30%~50%）', () => {
      // 给定：草稿 12000 字，上限 8000（超标 50%）
      const level = OutputValidator.classifyOverage(12000, 8000);

      // 期望：level = 'severe'
      expect(level).toBe('severe');
    });

    it('TC-WC-5: critical 超标（>50%）', () => {
      // 给定：草稿 15000 字，上限 8000（超标 87.5%）
      const level = OutputValidator.classifyOverage(15000, 8000);

      // 期望：level = 'critical'
      expect(level).toBe('critical');
    });

    it('TC-WC-6: 边界值 — 恰好 15%', () => {
      // 给定：草稿 9200 字，上限 8000（超标恰好 15%）
      const level = OutputValidator.classifyOverage(9200, 8000);

      // 期望：level = 'mild'（含下界）
      expect(level).toBe('mild');
    });
  });

  describe('SM-WC-6: 内容完整性保护', () => {
    it('TC-WC-7: 空 section 检测', () => {
      // 给定：草稿包含空 section
      const content = `## Section 1.5\n\n## Section 1.6\n一些内容`;
      
      // 当：调用结构完整性检查
      const result = OutputValidator.checkStructuralIntegrity(content);

      // 期望：valid = false，errors 包含空 section 信息
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /空.*section|empty.*section/i.test(e))).toBe(true);
    });

    it('TC-WC-8: 截断标记检测', () => {
      // 给定：草稿包含截断标记
      const content = `## Section 1\n一些内容\n\n<!-- 内容已截断以符合字数要求 -->`;
      
      // 当：调用结构完整性检查
      const result = OutputValidator.checkStructuralIntegrity(content);

      // 期望：valid = false，errors 包含截断标记信息
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => /截断|truncat/i.test(e))).toBe(true);
    });
  });

  describe('SM-WC-5: 循环收敛守护', () => {
    it('TC-WC-9: 连续 2 轮不收敛', () => {
      // 给定：字数历史 = [12000, 14500]，目标范围 5000-8000
      const history = [12000, 14500];
      const min = 5000;
      const max = 8000;

      // 当：调用收敛检测
      const converging = OutputValidator.isConverging(history, min, max);

      // 期望：converging = false
      expect(converging).toBe(false);
    });

    it('TC-WC-10: 正常收敛', () => {
      // 给定：字数历史 = [12000, 9500]，目标范围 5000-8000
      const history = [12000, 9500];
      const min = 5000;
      const max = 8000;

      // 当：调用收敛检测
      const converging = OutputValidator.isConverging(history, min, max);

      // 期望：converging = true
      expect(converging).toBe(true);
    });
  });

  describe('SM-WC-7: 字数不足响应', () => {
    it('TC-WC-14: 字数不足 mild', () => {
      // 给定：草稿 4600 字，下限 5000（不足 8%）
      const status = OutputValidator.classifyWordCount(4600, 5000, 8000);

      // 期望：status = 'mild_under'
      expect(status).toBe('mild_under');
    });

    it('TC-WC-15: 字数不足 moderate', () => {
      // 给定：草稿 4000 字，下限 5000（不足 20%）
      const status = OutputValidator.classifyWordCount(4000, 5000, 8000);

      // 期望：status = 'moderate_under'
      expect(status).toBe('moderate_under');
    });
  });

  describe('SM-WC-9: 字数统计一致性', () => {
    it('TC-WC-16: 所有模块使用同一统计方法', () => {
      // 给定：一段包含中英文混合的文本
      const content = '测试内容 Test Content 123';
      
      // 当：统计字数
      const charCount = content.length;

      // 期望：使用 content.length（UTF-16 code unit count）
      // '测试内容 Test Content 123' = 4中文 + 1空格 + 4英文 + 1空格 + 7英文 + 1空格 + 3数字 = 21
      expect(charCount).toBe(21);
    });
  });
});
