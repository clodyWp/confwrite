import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChapterAssembler } from '../../src/assemble/assembler.js';

describe('ChapterAssembler', () => {
  let tempDir: string;
  let assembler: ChapterAssembler;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-assembler-test-'));
    assembler = new ChapterAssembler();

    // Create test chapter files
    const chaptersDir = join(tempDir, 'drafts/chapters');
    mkdirSync(chaptersDir, { recursive: true });

    writeFileSync(
      join(chaptersDir, 'ch001.md'),
      `# 系统概述

## 1.1 项目背景

本项目旨在构建一个高性能的分布式系统。

## 1.2 系统目标

- 高可用性: 99.99%
- 响应时间: < 100ms
`,
      'utf-8'
    );

    writeFileSync(
      join(chaptersDir, 'ch002.md'),
      `# 架构设计

## 2.1 整体架构

系统采用微服务架构，包含以下核心组件：

1. API Gateway
2. User Service
3. Data Service

## 2.2 技术选型

- 后端框架: Node.js + Express
- 数据库: PostgreSQL
- 缓存: Redis
`,
      'utf-8'
    );

    writeFileSync(
      join(chaptersDir, 'ch003.md'),
      `# 详细设计

## 3.1 用户服务

用户服务负责处理所有与用户相关的操作。

### 3.1.1 用户注册

\`\`\`typescript
POST /api/users/register
\`\`\`

### 3.1.2 用户登录

\`\`\`typescript
POST /api/users/login
\`\`\`
`,
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('assemble', () => {
    it('assembles chapters in correct order', () => {
      const chapterOrder = ['ch001', 'ch002', 'ch003'];
      const result = assembler.assemble(tempDir, chapterOrder);

      expect(result.success).toBe(true);
      expect(result.content).toContain('# 系统概述');
      expect(result.content).toContain('# 架构设计');
      expect(result.content).toContain('# 详细设计');
    });

    it('adds page breaks between chapters', () => {
      const chapterOrder = ['ch001', 'ch002'];
      const result = assembler.assemble(tempDir, chapterOrder);

      // 分隔符为 *** 而非 ---：
      // 「空行 + --- + 紧跟非空行」会被 pandoc 识别为 YAML 元数据块开头，
      // 导致 docx 导出直接失败（Bug 25）。
      expect(result.content).toContain('***');
      expect(result.content).not.toMatch(/^---\s*\n\S/m);
    });

    it('handles missing chapters gracefully', () => {
      const chapterOrder = ['ch001', 'ch999', 'ch002'];
      const result = assembler.assemble(tempDir, chapterOrder);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Chapter ch999 not found');
      expect(result.content).toContain('# 系统概述');
      expect(result.content).toContain('# 架构设计');
    });

    it('returns error when no chapters found', () => {
      const chapterOrder = ['ch999'];
      const result = assembler.assemble(tempDir, chapterOrder);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No chapters found');
    });

    it('preserves chapter content exactly', () => {
      const chapterOrder = ['ch001'];
      const result = assembler.assemble(tempDir, chapterOrder);

      expect(result.content).toContain('## 1.1 项目背景');
      expect(result.content).toContain('高可用性: 99.99%');
    });

    it('generates table of contents when requested', () => {
      const chapterOrder = ['ch001', 'ch002'];
      const result = assembler.assemble(tempDir, chapterOrder, { generateTOC: true });

      expect(result.content).toContain('# 目录');
      expect(result.content).toContain('- [系统概述]');
      expect(result.content).toContain('- [架构设计]');
    });

    it('adds document title when provided', () => {
      const chapterOrder = ['ch001', 'ch002'];
      const result = assembler.assemble(tempDir, chapterOrder, {
        title: '系统技术方案',
      });

      expect(result.content).toMatch(/^# 系统技术方案/);
    });

    it('calculates correct statistics', () => {
      const chapterOrder = ['ch001', 'ch002', 'ch003'];
      const result = assembler.assemble(tempDir, chapterOrder);

      expect(result.stats.totalChapters).toBe(3);
      expect(result.stats.totalCharacters).toBeGreaterThan(0);
      expect(result.stats.totalWords).toBeGreaterThan(0);
    });
  });

  describe('save', () => {
    it('saves assembled content to file', () => {
      const chapterOrder = ['ch001', 'ch002'];
      const result = assembler.assemble(tempDir, chapterOrder);
      const outputPath = join(tempDir, 'output/document.md');

      assembler.save(result, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toBe(result.content);
    });

    it('creates output directory if not exists', () => {
      const chapterOrder = ['ch001'];
      const result = assembler.assemble(tempDir, chapterOrder);
      const outputPath = join(tempDir, 'output/nested/document.md');

      assembler.save(result, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('listChapters', () => {
    it('lists all available chapters', () => {
      const chapters = assembler.listChapters(tempDir);

      expect(chapters.length).toBe(3);
      expect(chapters).toContain('ch001');
      expect(chapters).toContain('ch002');
      expect(chapters).toContain('ch003');
    });

    it('returns empty array when no chapters exist', () => {
      const emptyDir = join(tempDir, 'empty');
      mkdirSync(emptyDir, { recursive: true });

      const chapters = assembler.listChapters(emptyDir);

      expect(chapters.length).toBe(0);
    });
  });
});
