import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportDocument } from '../../src/commands/export.js';

describe('export command', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-export-test-'));
    projectDir = join(tempDir, 'test-project');

    // Create project structure
    mkdirSync(join(projectDir, 'drafts/chapters'), { recursive: true });
    mkdirSync(join(projectDir, 'output'), { recursive: true });

    // Create test chapters
    writeFileSync(
      join(projectDir, 'drafts/chapters/ch001.md'),
      `# 系统概述

## 1.1 项目背景

本项目旨在构建一个高性能的分布式系统。
`,
      'utf-8'
    );

    writeFileSync(
      join(projectDir, 'drafts/chapters/ch002.md'),
      `# 架构设计

## 2.1 整体架构

系统采用微服务架构。
`,
      'utf-8'
    );

    // Create outline
    writeFileSync(
      join(projectDir, 'outline.md'),
      `# 系统技术方案

## 1. 概述
ch001 1.1 系统概述

## 2. 设计
ch002 2.1 架构设计
`,
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('exportDocument', () => {
    it('exports assembled markdown document', async () => {
      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
      });

      expect(result.success).toBe(true);
      expect(existsSync(result.outputPath)).toBe(true);

      const content = readFileSync(result.outputPath, 'utf-8');
      expect(content).toContain('# 系统概述');
      expect(content).toContain('# 架构设计');
    });

    it('exports HTML document', async () => {
      const result = await exportDocument(projectDir, {
        format: 'html',
        outputPath: join(projectDir, 'output/document.html'),
      });

      expect(result.success).toBe(true);
      expect(existsSync(result.outputPath)).toBe(true);

      const content = readFileSync(result.outputPath, 'utf-8');
      expect(content).toContain('<h1>');
      expect(content).toContain('系统概述');
    });

    it('generates conversion command for DOCX', async () => {
      const result = await exportDocument(projectDir, {
        format: 'docx',
        outputPath: join(projectDir, 'output/document.docx'),
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.conversionCommand).toContain('pandoc');
      expect(result.conversionCommand).toContain('-t docx');
    });

    it('generates conversion command for PDF', async () => {
      const result = await exportDocument(projectDir, {
        format: 'pdf',
        outputPath: join(projectDir, 'output/document.pdf'),
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.conversionCommand).toContain('pandoc');
      expect(result.conversionCommand).toContain('-t pdf');
    });

    it('includes table of contents when requested', async () => {
      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
        toc: true,
      });

      expect(result.success).toBe(true);
      const content = readFileSync(result.outputPath, 'utf-8');
      expect(content).toContain('# 目录');
    });

    it('adds document title when provided', async () => {
      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
        title: '完整技术方案',
      });

      expect(result.success).toBe(true);
      const content = readFileSync(result.outputPath, 'utf-8');
      expect(content).toMatch(/^# 完整技术方案/);
    });

    it('returns document statistics', async () => {
      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
      });

      expect(result.stats).toBeDefined();
      expect(result.stats!.totalChapters).toBe(2);
      expect(result.stats!.totalCharacters).toBeGreaterThan(0);
      expect(result.stats!.totalWords).toBeGreaterThan(0);
    });

    it('handles missing chapters gracefully', async () => {
      // Add a chapter reference in outline that doesn't exist
      writeFileSync(
        join(projectDir, 'outline.md'),
        `# 系统技术方案

## 1. 概述
ch001 1.1 系统概述

## 2. 设计
ch002 2.1 架构设计

## 3. 缺失
ch999 3.1 不存在的章节
`,
        'utf-8'
      );

      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
      });

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Chapter ch999 not found');
    });

    it('fails when no chapters exist', async () => {
      // Remove all chapters
      rmSync(join(projectDir, 'drafts/chapters'), { recursive: true });

      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath: join(projectDir, 'output/document.md'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No chapters found');
    });

    it('creates output directory if not exists', async () => {
      const outputPath = join(projectDir, 'output/nested/deep/document.md');

      const result = await exportDocument(projectDir, {
        format: 'md',
        outputPath,
      });

      expect(result.success).toBe(true);
      expect(existsSync(outputPath)).toBe(true);
    });
  });
});
