/**
 * Wave 4 TDD — 审阅字数检查 + 定稿标题层级检查 (Bug M/K)
 *
 * Bug M: 审阅全部 accept，没有检查字数是否在预算范围内
 * Bug K: 定稿只是复制文件，没有检查标题层级
 *
 * 修复策略：
 * 1. Reviewer prompt 增加字数预算检查（超出 ±30% 容差 → revise）
 * 2. Finalizer 增加标题层级检查（对照 outline.md）
 */
import { describe, it, expect } from 'vitest';
import { TaskExecutor } from '../src/writing/task-executor.js';
import type { Task } from '../src/scheduler/types.js';
import {
  checkHeadingHierarchy,
  type HeadingCheckResult,
} from '../src/assemble/heading-checker.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ────────────────────────────────────────────────────────────
// Bug M: 审阅字数检查
// ────────────────────────────────────────────────────────────

describe('Wave 4 — Bug M: 审阅字数检查', () => {
  const executor = new TaskExecutor();

  const mockTask: Task = {
    id: 'review-ch001',
    type: 'review',
    chapterId: 'ch001',
    priority: 1,
    createdAt: new Date().toISOString(),
  };

  it('Reviewer prompt 包含字数预算信息', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask,
      '# 章节内容\n\n正文...',
      { metrics: {}, technicalTerms: [], requirements: [] },
      1,
      '',
      undefined,
      { min: 5000, max: 8000 }  // 字数预算
    );

    // 应该包含字数预算信息
    expect(prompt).toContain('5000');
    expect(prompt).toContain('8000');
    expect(prompt).toContain('字数预算');
  });

  it('Reviewer prompt 包含容差规则说明', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask,
      '# 章节内容\n\n正文...',
      { metrics: {}, technicalTerms: [], requirements: [] },
      1,
      '',
      undefined,
      { min: 5000, max: 8000 }
    );

    // 应该包含容差规则
    expect(prompt).toContain('容差');
    expect(prompt).toContain('30%');
  });

  it('无字数预算时不添加预算检查部分', () => {
    const prompt = executor.generateReviewerPrompt(
      mockTask,
      '# 章节内容\n\n正文...',
      { metrics: {}, technicalTerms: [], requirements: [] },
      1,
      '',
      undefined,
      undefined  // 无预算
    );

    // 不应该包含特定预算数值
    expect(prompt).not.toContain('字数预算为');
  });
});

// ────────────────────────────────────────────────────────────
// Bug K: 定稿标题层级检查
// ────────────────────────────────────────────────────────────

describe('Wave 4 — Bug K: 定稿标题层级检查', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'wave4-heading-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('正确的大纲和文档 → 检查通过', () => {
    // 创建 outline.md
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案

ch001 项目概述
本章介绍项目背景。

ch002 需求分析
本章列出需求。
`, 'utf-8');

    // 创建符合大纲的文档
    const content = `# 技术方案

## 1. 项目概述

正文内容...

## 2. 需求分析

正文内容...
`;

    const result = checkHeadingHierarchy(projectDir, content);

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('章节数量不匹配 → 报告问题', () => {
    writeFileSync(join(projectDir, 'outline.md'), `# 技术方案

ch001 项目概述
ch002 需求分析
ch003 架构设计
`, 'utf-8');

    // 文档只有 2 个章节（缺少 ch003）
    const content = `# 技术方案

## 1. 项目概述

## 2. 需求分析
`;

    const result = checkHeadingHierarchy(projectDir, content);

    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some(i => i.includes('章节数'))).toBe(true);
  });

  it('无 outline.md 时跳过检查', () => {
    const content = `# 技术方案\n\n## 1. 概述`;
    const result = checkHeadingHierarchy(projectDir, content);

    // 没有 outline.md，无法检查，返回 ok
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────

import { beforeEach, afterEach } from 'vitest';
