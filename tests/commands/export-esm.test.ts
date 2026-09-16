import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportDocument } from '../../src/commands/export.js';

describe('exportDocument — ESM compatibility', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-export-esm-'));
    projectDir = join(tempDir, 'test-project');

    // Create minimal project structure
    mkdirSync(join(projectDir, 'drafts', 'chapters'), { recursive: true });
    mkdirSync(join(projectDir, 'output'), { recursive: true });

    // Create outline with one chapter
    writeFileSync(join(projectDir, 'outline.md'), `# Test Document

ch001 1. Introduction
ch002 2. Background
`, 'utf-8');

    // Create chapter drafts
    writeFileSync(join(projectDir, 'drafts', 'chapters', 'ch001.md'), '# Introduction\n\nHello world.\n', 'utf-8');
    writeFileSync(join(projectDir, 'drafts', 'chapters', 'ch002.md'), '# Background\n\nSome context.\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exportMarkdown writes file without require()', async () => {
    const outputPath = join(tempDir, 'output', 'test.md');

    const result = await exportDocument(projectDir, {
      format: 'md',
      outputPath,
      title: 'Test',
    });

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('Introduction');
    expect(content).toContain('Background');
  });

  it('exportHtml writes file without require()', async () => {
    const outputPath = join(tempDir, 'output', 'test.html');

    const result = await exportDocument(projectDir, {
      format: 'html',
      outputPath,
      title: 'Test',
    });

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('<html');
    expect(content).toContain('Introduction');
  });

  it('exportWithPandoc dryRun returns command without require()', async () => {
    const outputPath = join(tempDir, 'output', 'test.docx');

    const result = await exportDocument(projectDir, {
      format: 'docx',
      outputPath,
      title: 'Test',
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.conversionCommand).toBeDefined();
    expect(result.conversionCommand).toContain('pandoc');
  });

  it('creates output directory if it does not exist', async () => {
    const outputPath = join(tempDir, 'deep', 'nested', 'dir', 'test.md');

    const result = await exportDocument(projectDir, {
      format: 'md',
      outputPath,
      title: 'Test',
    });

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);
  });
});
