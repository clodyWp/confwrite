/**
 * Wave 3 集成测试 — 大纲命令使用 AdaptiveOutlinePlanner
 *
 * 验证 outline 命令能根据需求文档的标题层级自动生成合理章节。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { outlineCommand } from '../src/commands/outline.js';
import { OutlineParser } from '../src/organize/outline-parser.js';
import { ProjectStore } from '../src/state/store.js';
import type { ProjectState } from '../src/state/schema.js';

describe('Wave 3 — outline 命令集成', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'wave3-integration-'));

    // 创建模板
    const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术方案模板
targetWords: 100000
chapters:
  - type: overview
    required: true
    order: 1
---
`);

    // 创建章节类型
    const typesDir = join(projectDir, 'knowledge', 'chapter-types');
    mkdirSync(typesDir, { recursive: true });
    writeFileSync(join(typesDir, 'overview.md'), `---
name: 概述
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);
    writeFileSync(join(typesDir, 'functional.md'), `---
name: 功能模块
wordBudget:
  min: 5000
  max: 8000
importance: 4
writingStyle: functional
---
`);

    // 创建状态
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
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('根据需求文档标题层级自动生成多章节大纲', async () => {
    // 创建需求文件（模拟 LMERP2V2 的 Word 转换格式）
    const assetsDir = join(projectDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, 'requirements.json'), JSON.stringify([
      { id: 'REQ-001', title: '战略管理', priority: 'high', source: 'requirements.md', category: 'functional' },
      { id: 'REQ-002', title: '市场营销', priority: 'high', source: 'requirements.md', category: 'functional' },
      { id: 'REQ-003', title: '生产制造', priority: 'high', source: 'requirements.md', category: 'functional' },
    ]), 'utf-8');

    // 创建需求文档（带标题层级）
    const inputsDir = join(projectDir, 'inputs');
    mkdirSync(inputsDir, { recursive: true });
    writeFileSync(join(inputsDir, 'requirements.md'), `# 系统需求

## 2 系统主要功能

### 2.1 战略管理
规划目标管理是核心模块。

### 2.2 市场营销
客户关系管理模块。

### 2.3 生产制造
生产制造策略管理。

## 3 技术架构

### 3.1 总体架构
微服务架构。

### 3.2 数据架构
分层设计。
`, 'utf-8');

    const result = await outlineCommand({
      projectDir,
      template: 'technical-proposal',
      targetWords: 100000,
    });

    expect(result.success).toBe(true);

    // 读取生成的 outline.md
    const outlineContent = readFileSync(join(projectDir, 'outline.md'), 'utf-8');

    // 验证 OutlineParser 能解析
    const parser = new OutlineParser();
    const outline = parser.parse(outlineContent);
    const chapters = outline.getAllChapters();

    // 应该生成多个章节（至少展开到 h3 级别）
    expect(chapters.length).toBeGreaterThanOrEqual(5);

    // 每个章节都有 ch ID
    for (const ch of chapters) {
      expect(ch.id).toMatch(/^ch\d{3}$/);
    }
  });
});
