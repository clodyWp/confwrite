import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WordCountAnalyzer } from '../../src/outline/word-count-analyzer.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-word-count-analyzer-test-'));
}

describe('WordCountAnalyzer', () => {
  let tempDir: string;
  let projectDir: string;
  let analyzer: WordCountAnalyzer;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    analyzer = new WordCountAnalyzer(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('analyzeChapter', () => {
    it('应该统计章节字数', () => {
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      const content = 'a'.repeat(5000);
      writeFileSync(join(draftsDir, 'ch001-v1.md'), content, 'utf-8');

      const stats = analyzer.analyzeChapter('ch001', 1);

      expect(stats.chapterId).toBe('ch001');
      expect(stats.actualWords).toBe(5000);
    });

    it('应该在章节不存在时返回null', () => {
      const stats = analyzer.analyzeChapter('ch999', 1);
      expect(stats).toBeNull();
    });
  });

  describe('analyzeAll', () => {
    it('应该统计所有章节字数', () => {
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      writeFileSync(join(draftsDir, 'ch001-v1.md'), 'a'.repeat(5000), 'utf-8');
      writeFileSync(join(draftsDir, 'ch002-v1.md'), 'b'.repeat(8000), 'utf-8');

      const stats = analyzer.analyzeAll(['ch001', 'ch002']);

      expect(stats.length).toBe(2);
      expect(stats[0].actualWords).toBe(5000);
      expect(stats[1].actualWords).toBe(8000);
    });
  });

  describe('generateReport', () => {
    it('应该生成篇幅统计报告', () => {
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      writeFileSync(join(draftsDir, 'ch001-v1.md'), 'a'.repeat(5000), 'utf-8');
      writeFileSync(join(draftsDir, 'ch002-v1.md'), 'b'.repeat(8000), 'utf-8');

      const chapterStats = [
        { chapterId: 'ch001', wordBudget: { min: 5000, max: 8000 } },
        { chapterId: 'ch002', wordBudget: { min: 8000, max: 12000 } },
      ];

      const report = analyzer.generateReport(chapterStats);

      expect(report).toContain('篇幅统计报告');
      expect(report).toContain('ch001');
      expect(report).toContain('ch002');
      expect(report).toContain('5000');
      expect(report).toContain('8000');
    });
  });
});
