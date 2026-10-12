/**
 * 章节数一致性测试 — Issue #35
 *
 * TOC 的 `## 目录` 不应被计为章节标题。
 * 验证 finalizer.ts 的 computeStats 和 heading-checker.ts 的 extractH2Headings
 * 都正确排除 TOC 标题。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { finalize } from '../../src/assemble/finalizer.js';
import { checkHeadingHierarchy } from '../../src/assemble/heading-checker.js';

describe('章节数一致性 (Issue #35)', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  /** 创建包含 TOC 的测试文档并运行 finalize */
  function setupAndFinalize(docContent: string) {
    tempDir = mkdtempSync(join(tmpdir(), 'chapter-count-'));
    mkdirSync(join(tempDir, 'output'), { recursive: true });
    mkdirSync(join(tempDir, 'assets'), { recursive: true });
    writeFileSync(join(tempDir, 'output', 'final.md'), docContent, 'utf-8');
    return finalize(tempDir);
  }

  it('TOC 标题 `## 目录` 不应该被计为章节 (computeStats)', () => {
    const content = `# 文档标题

## 目录

- 第1章 概述
- 第2章 架构
- 第3章 实现

## 第1章 概述

内容...

## 第2章 架构

内容...

## 第3章 实现

内容...
`;
    const report = setupAndFinalize(content);

    // 有 4 个 ## 标题（目录 + 3 章），但 level2Headings 应只计 3 个章节
    expect(report.stats.level2Headings).toBe(3);
  });

  it('无 TOC 时正常统计所有章节', () => {
    const content = `# 文档标题

## 第1章 概述

内容...

## 第2章 架构

内容...
`;
    const report = setupAndFinalize(content);

    expect(report.stats.level2Headings).toBe(2);
  });

  it('heading-checker 的 extractH2Headings 应排除 TOC', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'chapter-count-'));
    mkdirSync(join(tempDir, 'output'), { recursive: true });
    mkdirSync(join(tempDir, 'assets'), { recursive: true });

    // 创建 outline.md，声明 3 个章节（使用 ch- 标记）
    const outlineContent = `# 大纲

ch01 概述
概述内容

ch02 架构
架构内容

ch03 实现
实现内容
`;
    writeFileSync(join(tempDir, 'outline.md'), outlineContent, 'utf-8');

    // 文档包含 TOC + 3 个实际章节
    const docContent = `# 文档标题

## 目录

- 第1章
- 第2章
- 第3章

## 第1章 概述

内容...

## 第2章 架构

内容...

## 第3章 实现

内容...
`;
    writeFileSync(join(tempDir, 'output', 'final.md'), docContent, 'utf-8');

    const result = checkHeadingHierarchy(tempDir, docContent);

    // 大纲有 3 章，文档应匹配 3 章（排除 TOC）
    expect(result.documentChapterCount).toBe(3);
    expect(result.outlineChapterCount).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
