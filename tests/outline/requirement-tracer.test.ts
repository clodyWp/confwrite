import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequirementTracer } from '../../src/outline/requirement-tracer.js';
import type { Requirement } from '../../src/outline/types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-requirement-tracer-test-'));
}

describe('RequirementTracer', () => {
  let tempDir: string;
  let projectDir: string;
  let tracer: RequirementTracer;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    tracer = new RequirementTracer(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('traceRequirement', () => {
    it('应该返回需求的实现位置', () => {
      // 创建需求文件
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify(requirements, null, 2),
        'utf-8'
      );

      // 创建草稿文件
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      const draftContent = `
# 用户登录功能

<!-- requirement: REQ-001 -->
本节实现用户登录功能，包括用户名密码登录和单点登录。
`;
      writeFileSync(join(draftsDir, 'ch004-v1.md'), draftContent, 'utf-8');

      const trace = tracer.traceRequirement('REQ-001');

      expect(trace.status).toBe('implemented');
      expect(trace.chapterId).toBe('ch004');
      expect(trace.locations.length).toBe(1);
    });

    it('应该在需求未分配时返回unassigned', () => {
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
        },
      ];
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify(requirements, null, 2),
        'utf-8'
      );

      const trace = tracer.traceRequirement('REQ-001');

      expect(trace.status).toBe('unassigned');
    });

    it('应该在需求未实现时返回not_found', () => {
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify(requirements, null, 2),
        'utf-8'
      );

      // 创建草稿文件但不包含标记
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      const draftContent = `
# 用户登录功能

本节实现用户登录功能。
`;
      writeFileSync(join(draftsDir, 'ch004-v1.md'), draftContent, 'utf-8');

      const trace = tracer.traceRequirement('REQ-001');

      expect(trace.status).toBe('not_found');
    });
  });

  describe('generateCoverageReport', () => {
    it('应该生成需求覆盖报告', () => {
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          assignedChapter: 'ch004',
        },
      ];
      
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify(requirements, null, 2),
        'utf-8'
      );

      // 创建草稿文件
      const draftsDir = join(projectDir, 'drafts', 'chapters');
      mkdirSync(draftsDir, { recursive: true });
      
      const draftContent = `
# 用户登录功能

<!-- requirement: REQ-001 -->
本节实现用户登录功能。
`;
      writeFileSync(join(draftsDir, 'ch004-v1.md'), draftContent, 'utf-8');

      const report = tracer.generateCoverageReport();

      expect(report.totalRequirements).toBe(2);
      expect(report.assigned).toBe(2);
      expect(report.implemented).toBe(1);
      expect(report.notFound).toBe(1);
    });
  });
});
