/**
 * G5: Finalizer (Phase 7 定稿) 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { finalize } from '../../src/assemble/finalizer.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-finalizer-test-'));
}

function createProjectStructure(projectDir: string, content?: string): void {
  mkdirSync(join(projectDir, 'output'), { recursive: true });
  mkdirSync(join(projectDir, 'assets'), { recursive: true });

  const finalContent = content || `# 技术方案

## 第1章 系统概述

本系统采用微服务架构，可用性达到 99.99%。

| 组件 | 说明 |
|------|------|
| API Gateway | 入口网关 |

## 第2章 架构设计

使用 Kubernetes 部署，响应时间 < 100ms。

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

![架构图](../figures/arch.png)
`;

  writeFileSync(join(projectDir, 'output', 'final.md'), finalContent, 'utf-8');
}

describe('finalize', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTempDir();
  });

  it('should compute document stats', () => {
    createProjectStructure(projectDir);

    const report = finalize(projectDir);

    expect(report.stats.level2Headings).toBe(2);
    expect(report.stats.headings).toBeGreaterThanOrEqual(2);
    expect(report.stats.tables).toBeGreaterThanOrEqual(1);
    expect(report.stats.mermaidBlocks).toBe(1);
    expect(report.stats.images).toBe(1);
    expect(report.stats.characters).toBeGreaterThan(0);
    expect(report.stats.words).toBeGreaterThan(0);
  });

  it('should check baseline consistency', () => {
    createProjectStructure(projectDir);

    // Create baseline with matching data (Record<string, string> format)
    writeFileSync(
      join(projectDir, 'assets', 'data-baseline.json'),
      JSON.stringify({
        metrics: { '可用性': '99.99%', '响应时间': '100ms' },
        technicalTerms: ['Kubernetes', '微服务'],
      }, null, 2),
      'utf-8',
    );

    const report = finalize(projectDir);

    expect(report.consistency.baselineMatches).toBe(2);
    expect(report.consistency.baselineMissing).toEqual([]);
    expect(report.consistency.termConsistency).toBe('pass');
  });

  it('should detect missing baseline data', () => {
    createProjectStructure(projectDir);

    writeFileSync(
      join(projectDir, 'assets', 'data-baseline.json'),
      JSON.stringify({
        metrics: { '可用性': '99.99%', 'QPS': '50000' },  // QPS not in document
        technicalTerms: [],
      }, null, 2),
      'utf-8',
    );

    const report = finalize(projectDir);

    expect(report.consistency.baselineMatches).toBe(1);
    expect(report.consistency.baselineMissing).toHaveLength(1);
    expect(report.consistency.baselineMissing[0]).toContain('QPS');
  });

  it('should write finalization.json report', () => {
    createProjectStructure(projectDir);

    const report = finalize(projectDir);

    const reportPath = join(projectDir, 'output', 'finalization.json');
    expect(existsSync(reportPath)).toBe(true);

    const saved = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(saved.stats).toEqual(report.stats);
    expect(saved.readyForExport).toBe(true);
    expect(saved.finalizedAt).toBeDefined();
  });

  it('should throw if final.md does not exist', () => {
    expect(() => finalize(projectDir)).toThrow('Assembled document not found');
  });

  it('should handle missing baseline gracefully', () => {
    createProjectStructure(projectDir);
    // No data-baseline.json

    const report = finalize(projectDir);

    expect(report.consistency.baselineMatches).toBe(0);
    expect(report.consistency.baselineMissing).toEqual([]);
    expect(report.consistency.termConsistency).toBe('pass');
  });

  it('should mark readyForExport as true', () => {
    createProjectStructure(projectDir);

    const report = finalize(projectDir);

    expect(report.readyForExport).toBe(true);
  });
});
