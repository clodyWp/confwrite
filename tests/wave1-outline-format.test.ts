/**
 * Wave 1 TDD — outline 格式统一 (Bug A / J / N)
 *
 * 核心问题：
 *   - generateOutlineMarkdown() 输出 `### 1. 标题 (ch001)` 格式
 *   - OutlineParser 期望 `ch001 标题` 格式
 *   - getChapterOrder() 用独立正则，与 OutlineParser 不一致
 *   - readChaptersFromOutline() 返回空时 kitsMatchOutline vacuously true
 *
 * 测试策略：先写失败测试，再实现修复
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineParser } from '../src/organize/outline-parser.js';
import {
  readChaptersFromOutline,
  validateChapterKits,
} from '../src/organize/kit-validator.js';

// ────────────────────────────────────────────────────────────
// Bug A: outline 生成格式与 OutlineParser 不匹配
// ────────────────────────────────────────────────────────────

describe('Wave 1 — Bug A: outline 格式统一', () => {
  describe('OutlineParser 能解析新格式', () => {
    it('解析 `ch001 标题` 格式的章节标记', () => {
      const content = `# 技术方案

## 1. 项目概述
ch001 项目背景与目标
本章介绍项目背景、目标和范围。

ch002 需求分析
本章详细列出系统需求。

## 2. 架构设计
ch003 总体架构
`;
      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      expect(chapters).toHaveLength(3);
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[0].title).toBe('项目背景与目标');
      expect(chapters[0].description).toContain('本章介绍项目背景');
      expect(chapters[1].id).toBe('ch002');
      expect(chapters[2].id).toBe('ch003');
    });

    it('新格式大纲能被 getChapterOrder 等价逻辑正确提取', () => {
      // 模拟新格式大纲
      const content = `# LMERP2V2 技术方案

ch001 项目概述
本章介绍项目背景。覆盖需求：
- 2.1 战略管理
字数预算: 5000-8000字

ch002 需求分析
本章列出功能需求。

ch003 架构设计
本章描述系统架构。
`;
      const parser = new OutlineParser();
      const outline = parser.parse(content);
      const chapters = outline.getAllChapters();

      // 应提取出全部 3 个章节 ID
      expect(chapters.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003']);
    });
  });

  describe('generateOutlineMarkdown 输出格式', () => {
    it('生成的 outline.md 必须包含 ch001 标题 格式的行', async () => {
      // 动态导入避免路径问题
      const { outlineCommand } = await import('../src/commands/outline.js');

      const projectDir = mkdtempSync(join(tmpdir(), 'wave1-outline-'));
      try {
        // 设置模板
        const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
        mkdirSync(templatesDir, { recursive: true });
        writeFileSync(join(templatesDir, 'test.md'), `---
name: 测试模板
description: 测试
targetWords: 30000
chapters:
  - type: overview
    required: true
    order: 1
  - type: requirements
    required: true
    order: 2
---
`);

        // 设置章节类型
        const typesDir = join(projectDir, 'knowledge', 'chapter-types');
        mkdirSync(typesDir, { recursive: true });
        writeFileSync(join(typesDir, 'overview.md'), `---
name: 项目概述
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);
        writeFileSync(join(typesDir, 'requirements.md'), `---
name: 需求分析
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---
`);

        // 创建需求文件
        const assetsDir = join(projectDir, 'assets');
        mkdirSync(assetsDir, { recursive: true });
        writeFileSync(join(assetsDir, 'requirements.json'), '[]', 'utf-8');

        // 创建状态文件
        const { ProjectStore } = await import('../src/state/store.js');
        const store = new ProjectStore(projectDir);
        store.save({
          version: 1,
          project: 'test',
          projectDir,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          currentPhase: '2',
          status: 'init',
          chapters: {},
          round: 1,
        });

        await outlineCommand({ projectDir, template: 'test' });

        // 读取生成的 outline.md
        const outlineContent = readFileSync(join(projectDir, 'outline.md'), 'utf-8');

        // 核心断言：必须包含 ch001 和 ch002 开头的行（新格式）
        expect(outlineContent).toMatch(/^ch001\s+.+$/m);
        expect(outlineContent).toMatch(/^ch002\s+.+$/m);

        // 核心断言：不应该包含旧格式 (ch001) 括号格式
        expect(outlineContent).not.toMatch(/\(ch\d{3}\)/);

        // 验证 OutlineParser 能解析生成的内容
        const parser = new OutlineParser();
        const outline = parser.parse(outlineContent);
        const chapters = outline.getAllChapters();

        // 应该解析出 2 个章节
        expect(chapters).toHaveLength(2);
        expect(chapters[0].id).toBe('ch001');
        expect(chapters[1].id).toBe('ch002');
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    });
  });
});

// ────────────────────────────────────────────────────────────
// Bug J/N: export 的 getChapterOrder 与 OutlineParser 统一
// ────────────────────────────────────────────────────────────

describe('Wave 1 — Bug J/N: export 使用 OutlineParser', () => {
  it('export 应使用 OutlineParser 提取章节顺序，而非独立正则', async () => {
    // 新格式大纲
    const projectDir = mkdtempSync(join(tmpdir(), 'wave1-export-'));
    try {
      writeFileSync(join(projectDir, 'outline.md'), `# 技术方案

ch001 项目概述
本章介绍项目背景。

ch002 需求分析
本章列出需求。

ch003 架构设计
本章描述架构。
`, 'utf-8');

      // 导入 export 模块的章节提取逻辑
      // 修复后 export 应使用 OutlineParser，能正确提取 ch001/ch002/ch003
      const { getChapterOrderFromOutline } = await import('../src/commands/export.js');
      const order = getChapterOrderFromOutline(projectDir);

      expect(order).toEqual(['ch001', 'ch002', 'ch003']);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ────────────────────────────────────────────────────────────
// 防御性修复: chapters 为空时 kitsMatchOutline 应返回 false
// ────────────────────────────────────────────────────────────

describe('Wave 1 — 防御性修复: 空大纲校验', () => {
  it('readChaptersFromOutline 返回空数组时 validateChapterKits 应返回 false', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'wave1-empty-'));
    try {
      // outline.md 存在但不含任何 ch 标记
      writeFileSync(join(projectDir, 'outline.md'), `# 技术方案

## 1. 项目概述
## 2. 架构设计
`, 'utf-8');

      const chapters = readChaptersFromOutline(projectDir);
      expect(chapters).toHaveLength(0);

      // 关键：空章节列表应该返回 NOT ok
      // 因为「没有解析出章节」意味着格式有问题，不应该认为「全部匹配」
      const result = validateChapterKits(projectDir, chapters);
      expect(result.ok).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('outline.md 不存在时 validateChapterKits 应返回 false', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'wave1-no-outline-'));
    try {
      const chapters = readChaptersFromOutline(projectDir);
      expect(chapters).toHaveLength(0);

      const result = validateChapterKits(projectDir, chapters);
      expect(result.ok).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
