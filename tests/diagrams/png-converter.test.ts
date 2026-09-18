/**
 * Tests for PNG converter
 * 
 * 将 SVG 转换为 PNG，用于 Word 文档嵌入。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { convertToPng, validatePng } from '../../src/diagrams/png-converter.js';

const TEST_DIR = join(process.cwd(), '.test-png-converter');

describe('PNGConverter', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('convertToPng', () => {
    it('converts SVG to PNG', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="white"/>
  <rect x="50" y="25" width="100" height="50" fill="#d97706" rx="6"/>
  <text x="100" y="55" text-anchor="middle" fill="white" font-size="14">测试</text>
</svg>`;

      const svgPath = join(TEST_DIR, 'test.svg');
      const pngPath = join(TEST_DIR, 'test.png');

      writeFileSync(svgPath, svgContent, 'utf-8');

      await convertToPng(svgPath, pngPath);

      expect(existsSync(pngPath)).toBe(true);
      const stat = statSync(pngPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('handles SVG with Chinese text', async () => {
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="white"/>
  <text x="100" y="50" text-anchor="middle" fill="#333" font-size="16" font-family="Microsoft YaHei, SimHei, sans-serif">中文测试</text>
</svg>`;

      const svgPath = join(TEST_DIR, 'chinese.svg');
      const pngPath = join(TEST_DIR, 'chinese.png');

      writeFileSync(svgPath, svgContent, 'utf-8');

      await convertToPng(svgPath, pngPath);

      expect(existsSync(pngPath)).toBe(true);
    });

    it('throws error for invalid SVG', async () => {
      const svgPath = join(TEST_DIR, 'invalid.svg');
      const pngPath = join(TEST_DIR, 'invalid.png');

      writeFileSync(svgPath, 'not an svg file', 'utf-8');

      await expect(convertToPng(svgPath, pngPath)).rejects.toThrow();
    });
  });

  describe('validatePng', () => {
    it('returns valid for existing PNG with size > 0', async () => {
      // 先创建一个有效的 PNG
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect width="100" height="100" fill="white"/>
      </svg>`;
      const svgPath = join(TEST_DIR, 'valid.svg');
      const pngPath = join(TEST_DIR, 'valid.png');
      writeFileSync(svgPath, svgContent, 'utf-8');
      await convertToPng(svgPath, pngPath);

      const result = validatePng(pngPath);
      expect(result.valid).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });

    it('returns invalid for non-existent file', () => {
      const result = validatePng(join(TEST_DIR, 'nonexistent.png'));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('不存在');
    });

    it('returns invalid for empty file', () => {
      const emptyPath = join(TEST_DIR, 'empty.png');
      writeFileSync(emptyPath, '', 'utf-8');

      const result = validatePng(emptyPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('为空');
    });
  });
});
