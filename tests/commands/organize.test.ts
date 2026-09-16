import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { organizeMaterials } from '../../src/commands/organize.js';

describe('organize command', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-organize-test-'));
    projectDir = join(tempDir, 'test-project');
    
    // 创建项目结构
    mkdirSync(join(projectDir, 'reference_material'), { recursive: true });
    mkdirSync(join(projectDir, 'assets'), { recursive: true });
    mkdirSync(join(projectDir, 'assets/indexes'), { recursive: true });
    mkdirSync(join(projectDir, 'assets/chapter-kits'), { recursive: true });
    
    // 创建大纲
    writeFileSync(
      join(projectDir, 'outline.md'),
      '# 技术方案\n\n## 1. 概述\nch001 系统概述\n\n## 2. 设计\nch002 架构设计\n',
      'utf-8'
    );
    
    // 创建示例资料
    writeFileSync(
      join(projectDir, 'reference_material', 'doc1.md'),
      '# API 文档\n\n系统性能达到 99.9%，响应时间 < 100ms\n',
      'utf-8'
    );
    
    writeFileSync(
      join(projectDir, 'reference_material', 'doc2.md'),
      '# 业务流程\n\n用户注册流程包括三个步骤\n',
      'utf-8'
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('organizeMaterials', () => {
    it('scans reference materials', async () => {
      const result = await organizeMaterials(projectDir);

      expect(result.scanStats.total).toBe(2);
    });

    it('generates index files', async () => {
      const result = await organizeMaterials(projectDir);

      expect(existsSync(join(projectDir, 'assets/indexes/index.json'))).toBe(true);
    });

    it('extracts data baseline', async () => {
      const result = await organizeMaterials(projectDir);

      expect(existsSync(join(projectDir, 'assets/data-baseline.json'))).toBe(true);
      
      const baseline = JSON.parse(
        readFileSync(join(projectDir, 'assets/data-baseline.json'), 'utf-8')
      );
      expect(baseline.sourceFiles).toBeGreaterThan(0);
    });

    it('generates chapter mappings', async () => {
      const result = await organizeMaterials(projectDir);

      expect(result.chapterMappings.length).toBe(2); // ch001, ch002
    });

    it('generates chapter kits', async () => {
      const result = await organizeMaterials(projectDir);

      expect(existsSync(join(projectDir, 'assets/chapter-kits/ch001.md'))).toBe(true);
      expect(existsSync(join(projectDir, 'assets/chapter-kits/ch002.md'))).toBe(true);
    });

    it('generates references index', async () => {
      const result = await organizeMaterials(projectDir);

      expect(existsSync(join(projectDir, 'assets/references-index.md'))).toBe(true);
    });

    it('returns comprehensive result', async () => {
      const result = await organizeMaterials(projectDir);

      expect(result.scanStats).toBeDefined();
      expect(result.conversionStats).toBeDefined();
      expect(result.indexData).toBeDefined();
      expect(result.baseline).toBeDefined();
      expect(result.chapterMappings).toBeDefined();
      expect(result.kitStats).toBeDefined();
    });

    it('handles empty reference_material directory', async () => {
      // 清空 reference_material
      rmSync(join(projectDir, 'reference_material'), { recursive: true });
      mkdirSync(join(projectDir, 'reference_material'), { recursive: true });

      const result = await organizeMaterials(projectDir);

      expect(result.scanStats.total).toBe(0);
    });

    it('handles missing outline.md', async () => {
      rmSync(join(projectDir, 'outline.md'));

      const result = await organizeMaterials(projectDir);

      // 应该仍然能扫描和索引，但没有章节映射
      expect(result.chapterMappings.length).toBe(0);
    });
  });
});
