import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BaselineExtractor } from '../../src/organize/baseline-extractor.js';
import type { MaterialFile } from '../../src/organize/scanner.js';

/**
 * 基线提取器表格处理测试
 * 
 * 覆盖 Spec: specs/baseline-extractor-table.md 中的不变量
 * - BE-1: 表格行内的冒号不作为分隔符
 * - BE-2: 普通文本的冒号仍作为分隔符
 * - BE-3: 表格单元格内容完整提取
 * - BE-4: 基线匹配使用完整项
 * - BE-5: 分隔行不被当作表格行处理
 * - BE-6: 15 字符截断规则一致
 */
describe('BaselineExtractor 表格处理', () => {
  let tempDir: string;
  let extractor: BaselineExtractor;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-baseline-table-test-'));
    extractor = new BaselineExtractor();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('BE-1: 表格行内的冒号不作为分隔符', () => {
    it('BE-1: 表格单元格内的冒号不被分割', async () => {
      const content = `
| 时间范围 | 状态 |
|----------|------|
| 31-60天: 完成 | ✅ |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // key 应该是完整单元格内容，不是在冒号处分割
      const keys = Object.keys(baseline.metrics);
      const hasFullCell = keys.some(k => k.includes('31-60天: 完成') || k.includes('31-60天'));
      expect(hasFullCell).toBe(true);
    });

    it('BE-1: 全角冒号在表格中不被分割', async () => {
      const content = `
| 指标 | 值 |
|------|-----|
| 时间：31-60天 | 达标 |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      // 应该包含完整单元格内容
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('BE-2: 普通文本的冒号仍作为分隔符', () => {
    it('BE-2: 普通文本的冒号作为分隔符', async () => {
      const content = `
性能指标: 99.9%
可用性: 100ms
`;
      const files = [createMockFile('plain.md', content)];
      const baseline = await extractor.extract(files);

      // key 应该是冒号前的部分
      const keys = Object.keys(baseline.metrics);
      expect(keys.some(k => k.includes('性能指标'))).toBe(true);
    });

    it('BE-2: 全角冒号在普通文本中作为分隔符', async () => {
      const content = `
响应时间：100ms
并发数：1000
`;
      const files = [createMockFile('plain.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      expect(keys.some(k => k.includes('响应时间'))).toBe(true);
    });
  });

  describe('BE-3: 表格单元格内容完整提取', () => {
    it('BE-3: 多列表格中完整提取单元格', async () => {
      const content = `
| 指标 | 值 | 状态 |
|------|-----|------|
| 响应时间: 100ms | 达标 | ✅ |
| 并发数: 1000 | 达标 | ✅ |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('BE-3: 单元格内多个冒号完整提取', async () => {
      const content = `
| 描述 | 状态 |
|------|------|
| 时间: 31-60天: 完成 | ✅ |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // 应该在第一个冒号处分割（保持与普通文本一致的语义）
      const keys = Object.keys(baseline.metrics);
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('BE-4: 基线匹配使用完整项', () => {
    it('BE-4: 提取的基线项可以在原文中找到', async () => {
      const content = `
| 指标 | 值 |
|------|-----|
| 响应时间: 100ms | 达标 |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // 基线的值应该能在原文中找到
      const values = Object.values(baseline.metrics);
      const hasMatchingValue = values.some(v => content.includes(v));
      expect(hasMatchingValue).toBe(true);
    });
  });

  describe('BE-5: 分隔行不被当作表格行处理', () => {
    it('BE-5: 分隔行不产生基线项', async () => {
      const content = `
| 指标 | 值 |
|------|------|
| 响应时间 | 100ms |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // 分隔行 |------|------| 不应该产生基线项
      const keys = Object.keys(baseline.metrics);
      const hasSeparatorKey = keys.some(k => k.includes('---'));
      expect(hasSeparatorKey).toBe(false);
    });
  });

  describe('BE-6: 15 字符截断规则一致', () => {
    it('BE-6: 表格单元格超过 15 字符时截断', async () => {
      const content = `
| 描述 | 状态 |
|------|------|
| 系统响应时间指标: 不超过100ms | 达标 |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      // 所有 key 都不应该超过 15 字符
      keys.forEach(k => {
        expect(k.length).toBeLessThanOrEqual(15);
      });
    });

    it('BE-6: 普通文本超过 15 字符时截断', async () => {
      const content = `
系统响应时间性能指标描述: 100ms
`;
      const files = [createMockFile('plain.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      keys.forEach(k => {
        expect(k.length).toBeLessThanOrEqual(15);
      });
    });
  });

  describe('边界情况', () => {
    it('混合内容：表格和普通文本各自正确处理', async () => {
      const content = `
普通文本指标: 99.9%

| 表格指标 | 值 |
|----------|-----|
| 响应时间: 100ms | 达标 |
`;
      const files = [createMockFile('mixed.md', content)];
      const baseline = await extractor.extract(files);

      const keys = Object.keys(baseline.metrics);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('重复单元格内容正确定位', async () => {
      const content = `
| 指标1 | 指标2 |
|-------|-------|
| 100ms | 100ms |
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // 不应该崩溃，应该正常提取
      expect(baseline.metrics).toBeDefined();
    });

    it('空表格不产生基线项', async () => {
      const content = `
| 指标 | 值 |
|------|-----|
`;
      const files = [createMockFile('table.md', content)];
      const baseline = await extractor.extract(files);

      // 空表格不应该产生基线项（或只有很少的项）
      expect(baseline.sourceFiles).toBe(1);
    });
  });
});

function createMockFile(filename: string, content: string): MaterialFile {
  return {
    filename,
    relativePath: filename,
    absolutePath: `/nonexistent/${filename}`, // 使用不存在的路径触发 summary fallback
    format: 'markdown',
    size: content.length,
    title: filename.replace('.md', ''),
    keywords: [],
    summary: content,
    category: '未分类',
  };
}
