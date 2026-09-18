import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FormatConverter } from '../../src/organize/converter.js';
import type { ConversionResult } from '../../src/organize/converter.js';

/**
 * Create a minimal valid DOCX buffer for testing.
 * DOCX is a ZIP with specific XML structure.
 */
async function createMinimalDocx(text: string): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf;
}

describe('FormatConverter', () => {
  let tempDir: string;
  let converter: FormatConverter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-converter-test-'));
    converter = new FormatConverter();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('convert', () => {
    it('converts HTML to Markdown', async () => {
      const htmlPath = join(tempDir, 'test.html');
      writeFileSync(htmlPath, '<html><body><h1>Title</h1><p>Content</p></body></html>', 'utf-8');
      
      const result = await converter.convert(htmlPath, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('html');
      expect(result.outputPath).toContain('.md');
      expect(existsSync(result.outputPath!)).toBe(true);
      
      const content = readFileSync(result.outputPath!, 'utf-8');
      expect(content).toContain('# Title');
      expect(content).toContain('Content');
    });

    it('handles conversion errors gracefully', async () => {
      const pdfPath = join(tempDir, 'test.pdf');
      writeFileSync(pdfPath, 'not a real pdf', 'utf-8');
      
      const result = await converter.convert(pdfPath, tempDir);
      
      // PDF 转换可能失败（因为没有真实 PDF），但应该返回错误信息
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('preserves markdown files as-is', async () => {
      const mdPath = join(tempDir, 'test.md');
      writeFileSync(mdPath, '# Original\nContent', 'utf-8');
      
      const result = await converter.convert(mdPath, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('markdown');
      expect(result.outputPath).toBe(mdPath); // 不转换，直接返回原路径
    });

    it('creates output directory if not exists', async () => {
      const htmlPath = join(tempDir, 'test.html');
      writeFileSync(htmlPath, '<h1>Test</h1>', 'utf-8');
      
      const outputDir = join(tempDir, 'output');
      const result = await converter.convert(htmlPath, outputDir);
      
      expect(result.success).toBe(true);
      expect(existsSync(outputDir)).toBe(true);
    });
  });

  describe('convertBatch', () => {
    it('converts multiple files', async () => {
      const files = [
        join(tempDir, 'doc1.html'),
        join(tempDir, 'doc2.html'),
      ];
      
      writeFileSync(files[0], '<h1>Doc1</h1>', 'utf-8');
      writeFileSync(files[1], '<h1>Doc2</h1>', 'utf-8');
      
      const results = await converter.convertBatch(files, tempDir);
      
      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('continues on individual failures', async () => {
      const files = [
        join(tempDir, 'good.html'),
        join(tempDir, 'bad.pdf'),
      ];
      
      writeFileSync(files[0], '<h1>Good</h1>', 'utf-8');
      writeFileSync(files[1], 'not a pdf', 'utf-8');
      
      const results = await converter.convertBatch(files, tempDir);
      
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('returns statistics', async () => {
      const files = [
        join(tempDir, 'doc1.html'),
        join(tempDir, 'doc2.html'),
        join(tempDir, 'doc3.pdf'),
      ];
      
      writeFileSync(files[0], '<h1>Doc1</h1>', 'utf-8');
      writeFileSync(files[1], '<h1>Doc2</h1>', 'utf-8');
      writeFileSync(files[2], 'not a pdf', 'utf-8');
      
      const results = await converter.convertBatch(files, tempDir);
      const stats = converter.getStats(results);
      
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
    });
  });

  describe('DOCX conversion', () => {
    it('converts DOCX to Markdown via mammoth', async () => {
      const docxPath = join(tempDir, 'test.docx');
      const buf = await createMinimalDocx('Hello World from DOCX');
      writeFileSync(docxPath, buf);

      const result = await converter.convert(docxPath, tempDir);

      expect(result.success).toBe(true);
      expect(result.format).toBe('docx');
      expect(result.outputPath).toContain('.md');

      const content = readFileSync(result.outputPath!, 'utf-8');
      expect(content).toContain('Hello World from DOCX');
    });

    it('rejects invalid DOCX (not a ZIP)', async () => {
      const docxPath = join(tempDir, 'fake.docx');
      writeFileSync(docxPath, 'not a zip file', 'utf-8');

      const result = await converter.convert(docxPath, tempDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid DOCX');
    });
  });

  describe('PDF conversion', () => {
    it('rejects invalid PDF', async () => {
      const pdfPath = join(tempDir, 'fake.pdf');
      writeFileSync(pdfPath, 'not a real pdf', 'utf-8');

      const result = await converter.convert(pdfPath, tempDir);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
