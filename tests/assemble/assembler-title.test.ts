import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChapterAssembler } from '../../src/assemble/assembler.js';

/**
 * 文档标题（Bug 22）
 *
 * 实测事故：LmERP2 的最终文档 output/final.md 开头是 `# 目录`，
 * **没有文档标题**；而 outline.md 第一行明明写着
 * `# 智慧园区综合管理平台项目投标文件——技术方案`。
 *
 * 原因：
 *   phase6 组装时未传 title ——
 *     assembler.assemble(projectDir, chapters, { generateTOC: true })
 *   而 finalizer 会把 assembly/merged-v1.md 原样写入 output/final.md，
 *   于是「无标题」被固定成最终产物。
 *
 * 此前一直未暴露：phase6 的 execute 被 waitPoint 跳过（Bug 10），
 * 组装从未真正执行过。
 */

const OUTLINE = [
  '# 智慧园区综合管理平台项目投标文件——技术方案',
  '',
  '## 1. 投标概述',
  'ch001 1.1 项目理解与需求分析',
  '',
  '## 2. 总体技术方案',
  'ch002 2.1 系统总体架构设计',
].join('\n');

describe('文档标题解析（Bug 22）', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'confwrite-title-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('从 outline.md 的一级标题解析文档标题', () => {
    writeFileSync(join(dir, 'outline.md'), OUTLINE);
    const a = new ChapterAssembler();
    expect(a.resolveDocumentTitle(dir)).toBe('智慧园区综合管理平台项目投标文件——技术方案');
  });

  it('outline.md 不存在时返回 undefined', () => {
    const a = new ChapterAssembler();
    expect(a.resolveDocumentTitle(dir)).toBeUndefined();
  });

  it('outline.md 没有一级标题时返回 undefined', () => {
    writeFileSync(join(dir, 'outline.md'), '正文但没有一级标题\n## 二级');
    const a = new ChapterAssembler();
    expect(a.resolveDocumentTitle(dir)).toBeUndefined();
  });

  it('忽略一级标题之前的前言内容', () => {
    writeFileSync(join(dir, 'outline.md'), '前言\n\n# 真正的标题\n\n## 1. 章');
    const a = new ChapterAssembler();
    expect(a.resolveDocumentTitle(dir)).toBe('真正的标题');
  });

  it('传入 title 时组装产物包含该标题', () => {
    writeFileSync(join(dir, 'outline.md'), OUTLINE);
    mkdirSync(join(dir, 'drafts', 'chapters'), { recursive: true });
    writeFileSync(join(dir, 'drafts', 'chapters', 'ch001-v1.md'), '# 1.1 章节\n\n正文。\n');

    const a = new ChapterAssembler();
    const r = a.assemble(dir, ['ch001'], { title: a.resolveDocumentTitle(dir), generateTOC: true });

    expect(r.content).toContain('# 智慧园区综合管理平台项目投标文件——技术方案');
    // 标题应在 TOC 之前
    expect(r.content.indexOf('智慧园区')).toBeLessThan(r.content.indexOf('# 目录'));
  });
});
