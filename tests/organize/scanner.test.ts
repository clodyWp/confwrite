import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MaterialScanner } from '../../src/organize/scanner.js';
import type { MaterialFile } from '../../src/organize/scanner.js';

describe('MaterialScanner', () => {
  let tempDir: string;
  let scanner: MaterialScanner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-scanner-test-'));
    scanner = new MaterialScanner();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('scan', () => {
    it('scans markdown files', () => {
      writeFileSync(join(tempDir, 'test.md'), '# Test\nContent', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files.length).toBe(1);
      expect(result.files[0].filename).toBe('test.md');
      expect(result.files[0].format).toBe('markdown');
    });

    it('scans multiple file types', () => {
      writeFileSync(join(tempDir, 'doc.md'), '# Doc', 'utf-8');
      writeFileSync(join(tempDir, 'doc.pdf'), 'fake pdf', 'utf-8');
      writeFileSync(join(tempDir, 'doc.docx'), 'fake docx', 'utf-8');
      writeFileSync(join(tempDir, 'doc.html'), '<html></html>', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files.length).toBe(4);
      const formats = result.files.map(f => f.format).sort();
      expect(formats).toEqual(['docx', 'html', 'markdown', 'pdf']);
    });

    it('extracts title from markdown H1', () => {
      writeFileSync(join(tempDir, 'test.md'), '# My Title\nContent', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].title).toBe('My Title');
    });

    it('uses filename as title when no H1', () => {
      writeFileSync(join(tempDir, 'my-doc.md'), 'No heading', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].title).toBe('my-doc');
    });

    it('extracts keywords from content', () => {
      writeFileSync(join(tempDir, 'test.md'), '# Test\nAPI 接口 系统 架构', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].keywords.length).toBeGreaterThan(0);
    });

    it('generates summary from first paragraph', () => {
      writeFileSync(join(tempDir, 'test.md'), '# Title\n\nFirst paragraph.\n\nSecond paragraph.', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].summary).toContain('First paragraph');
    });

    it('scans subdirectories recursively', () => {
      mkdirSync(join(tempDir, 'sub'));
      writeFileSync(join(tempDir, 'root.md'), '# Root', 'utf-8');
      writeFileSync(join(tempDir, 'sub', 'child.md'), '# Child', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files.length).toBe(2);
      const paths = result.files.map(f => f.relativePath).sort();
      expect(paths).toEqual([join('root.md'), join('sub', 'child.md')]);
    });

    it('ignores non-document files', () => {
      writeFileSync(join(tempDir, 'test.md'), '# Test', 'utf-8');
      writeFileSync(join(tempDir, 'image.png'), 'fake png', 'utf-8');
      writeFileSync(join(tempDir, 'data.json'), '{}', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files.length).toBe(1);
      expect(result.files[0].filename).toBe('test.md');
    });

    it('returns statistics', () => {
      writeFileSync(join(tempDir, 'doc1.md'), '# Doc1', 'utf-8');
      writeFileSync(join(tempDir, 'doc2.md'), '# Doc2', 'utf-8');
      writeFileSync(join(tempDir, 'doc3.pdf'), 'fake pdf', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.stats.total).toBe(3);
      expect(result.stats.byFormat.markdown).toBe(2);
      expect(result.stats.byFormat.pdf).toBe(1);
    });

    it('handles empty directory', () => {
      const result = scanner.scan(tempDir);
      
      expect(result.files.length).toBe(0);
      expect(result.stats.total).toBe(0);
    });
  });

  describe('categorize', () => {
    it('categorizes by directory name', () => {
      mkdirSync(join(tempDir, '01_政策与背景'));
      writeFileSync(join(tempDir, '01_政策与背景', 'doc.md'), '# Doc', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].category).toBe('政策与背景');
    });

    it('categorizes by filename prefix', () => {
      writeFileSync(join(tempDir, '01A_政策.md'), '# Doc', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].category).toBeDefined();
    });

    it('marks uncategorized files', () => {
      writeFileSync(join(tempDir, 'random.md'), '# Doc', 'utf-8');
      
      const result = scanner.scan(tempDir);
      
      expect(result.files[0].category).toBe('未分类');
    });
  });
});
