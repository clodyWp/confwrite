import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FormatConverter } from '../../src/assemble/converter.js';

describe('FormatConverter', () => {
  let tempDir: string;
  let converter: FormatConverter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-converter-test-'));
    converter = new FormatConverter();

    // Create test markdown file
    writeFileSync(
      join(tempDir, 'document.md'),
      `# 系统技术方案

## 1. 概述

本文档描述了系统的整体技术方案。

## 2. 架构设计

系统采用微服务架构：

- API Gateway
- User Service
- Data Service

### 2.1 技术选型

| 组件 | 技术 | 版本 |
|------|------|------|
| 后端 | Node.js | 18.x |
| 数据库 | PostgreSQL | 15.x |
| 缓存 | Redis | 7.x |

## 3. 代码示例

\`\`\`typescript
const app = express();
app.listen(3000);
\`\`\`
`,
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('convertToHtml', () => {
    it('converts markdown to HTML', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath);

      expect(result.success).toBe(true);
      expect(result.html).toContain('<h1>');
      expect(result.html).toContain('系统技术方案');
      expect(result.html).toContain('<h2>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li>');
    });

    it('converts tables correctly', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath);

      expect(result.html).toContain('<table>');
      expect(result.html).toContain('<th>');
      expect(result.html).toContain('<td>');
    });

    it('converts code blocks with syntax highlighting class', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath);

      expect(result.html).toContain('<pre>');
      expect(result.html).toContain('<code');
      expect(result.html).toContain('typescript');
    });

    it('wraps content in HTML document structure', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath, {
        wrapInDocument: true,
        title: '系统技术方案',
      });

      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<html');
      expect(result.html).toContain('<head>');
      expect(result.html).toContain('<title>系统技术方案</title>');
    });

    it('includes CSS styles when requested', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath, {
        wrapInDocument: true,
        includeStyles: true,
      });

      expect(result.html).toContain('<style>');
    });
  });

  describe('saveHtml', () => {
    it('saves HTML to file', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath);
      const outputPath = join(tempDir, 'output/document.html');

      converter.saveHtml(result, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toBe(result.html);
    });

    it('creates output directory if not exists', () => {
      const mdPath = join(tempDir, 'document.md');
      const result = converter.convertToHtml(mdPath);
      const outputPath = join(tempDir, 'output/nested/document.html');

      converter.saveHtml(result, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('generateConversionCommand', () => {
    it('generates pandoc command for DOCX', () => {
      const mdPath = join(tempDir, 'document.md');
      const outputPath = join(tempDir, 'output/document.docx');

      const cmd = converter.generateConversionCommand(mdPath, outputPath, 'docx');

      expect(cmd).toContain('pandoc');
      expect(cmd).toContain(mdPath);
      expect(cmd).toContain(outputPath);
      expect(cmd).toContain('-t docx');
    });

    it('generates pandoc command for PDF', () => {
      const mdPath = join(tempDir, 'document.md');
      const outputPath = join(tempDir, 'output/document.pdf');

      const cmd = converter.generateConversionCommand(mdPath, outputPath, 'pdf');

      expect(cmd).toContain('pandoc');
      expect(cmd).toContain('-t pdf');
    });

    it('includes reference doc when provided', () => {
      const mdPath = join(tempDir, 'document.md');
      const outputPath = join(tempDir, 'output/document.docx');
      const referenceDoc = join(tempDir, 'template.docx');

      const cmd = converter.generateConversionCommand(mdPath, outputPath, 'docx', {
        referenceDoc,
      });

      expect(cmd).toContain(`--reference-doc=${referenceDoc}`);
    });

    it('includes TOC option when requested', () => {
      const mdPath = join(tempDir, 'document.md');
      const outputPath = join(tempDir, 'output/document.docx');

      const cmd = converter.generateConversionCommand(mdPath, outputPath, 'docx', {
        toc: true,
      });

      expect(cmd).toContain('--toc');
    });
  });

  describe('checkDependencies', () => {
    it('returns dependency information', () => {
      const deps = converter.checkDependencies();

      expect(deps).toHaveProperty('pandoc');
      expect(deps).toHaveProperty('pandoc.installed');
      expect(deps).toHaveProperty('pandoc.recommended');
    });
  });
});
