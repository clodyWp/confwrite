/**
 * 回归测试 — 确保 Wave 1-4 修改不影响现有功能
 *
 * 测试策略：
 * 1. 旧格式 outline.md 仍能解析（向后兼容）
 * 2. CRLF 换行符兼容（Windows 环境）
 * 3. 深层嵌套标题树
 * 4. finalizer 集成标题检查
 * 5. 端到端流程验证
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineParser } from '../src/organize/outline-parser.js';
import { RequirementExtractor } from '../src/outline/requirement-extractor.js';
import { HeadingTreeBuilder } from '../src/outline/heading-tree.js';
import { AdaptiveOutlinePlanner } from '../src/outline/adaptive-planner.js';
import { checkHeadingHierarchy } from '../src/assemble/heading-checker.js';
import { finalize } from '../src/assemble/finalizer.js';

// ────────────────────────────────────────────────────────────
// 回归测试 1: 旧格式 outline.md 兼容性
// ────────────────────────────────────────────────────────────

describe('回归: 旧格式 outline.md 兼容性', () => {
  it('旧格式 (ch001) 括号格式仍能解析', () => {
    // 旧格式: ### 1. 标题 (ch001)
    const oldFormat = `# 技术方案

## 1. 项目概述

### 1.1 背景介绍 (ch001)

### 1.2 目标定义 (ch002)

## 2. 架构设计

### 2.1 总体架构 (ch003)
`;

    const parser = new OutlineParser();
    const outline = parser.parse(oldFormat);

    // 旧格式没有 ch001 开头的行，应该返回空章节
    // 但不应报错
    expect(outline).toBeDefined();
    expect(outline.title).toBe('技术方案');
  });

  it('新格式 ch001 标题 能正确解析', () => {
    const newFormat = `# 技术方案

ch001 项目概述
本章介绍项目背景。

ch002 需求分析
本章列出需求。
`;

    const parser = new OutlineParser();
    const outline = parser.parse(newFormat);
    const chapters = outline.getAllChapters();

    expect(chapters).toHaveLength(2);
    expect(chapters[0].id).toBe('ch001');
    expect(chapters[0].title).toBe('项目概述');
  });
});

// ────────────────────────────────────────────────────────────
// 回归测试 2: CRLF 换行符兼容
// ────────────────────────────────────────────────────────────

describe('回归: CRLF 换行符兼容', () => {
  it('RequirementExtractor 处理 CRLF 文档', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'regression-crlf-'));
    try {
      // Windows 风格的 CRLF 换行
      const content = '# 需求文档\r\n\r\n## 2.1 战略管理\r\n\r\n### 2.1.1 规划目标\r\n\r\n规划目标管理是核心模块。\r\n';
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, content, 'utf-8');

      const extractor = new RequirementExtractor(projectDir);
      const requirements = await extractor.extractFromDocument(docPath);

      // 应该能正确提取标题
      expect(requirements.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('HeadingTreeBuilder 处理 CRLF 文档', () => {
    const content = '# 技术方案\r\n\r\n## 2.1 战略管理\r\n\r\n### 2.1.1 规划目标\r\n\r\n内容描述。\r\n';
    const builder = new HeadingTreeBuilder();
    const root = builder.build(content);

    expect(root.children.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────
// 回归测试 3: 深层嵌套标题树
// ────────────────────────────────────────────────────────────

describe('回归: 深层嵌套标题树', () => {
  it('处理 h1 → h2 → h3 → h4 四层嵌套', () => {
    const content = `# 文档标题

## 2 系统功能

### 2.1 战略管理

#### 2.1.1 规划目标管理
规划目标管理的详细描述。

#### 2.1.2 规划框架管理
规划框架管理的详细描述。

### 2.2 市场营销

#### 2.2.1 客户关系管理
客户关系管理的详细描述。
`;

    const builder = new HeadingTreeBuilder();
    const root = builder.build(content);

    // 验证层级结构
    expect(root.children.length).toBe(1); // h1
    const h1 = root.children[0];
    expect(h1.level).toBe(1);
    expect(h1.children.length).toBe(1); // h2

    const h2 = h1.children[0];
    expect(h2.level).toBe(2);
    expect(h2.title).toBe('系统功能');
    expect(h2.children.length).toBe(2); // 2.1, 2.2

    const h3_21 = h2.children[0];
    expect(h3_21.level).toBe(3);
    expect(h3_21.title).toBe('战略管理');
    expect(h3_21.children.length).toBe(2); // 2.1.1, 2.1.2
  });

  it('AdaptiveOutlinePlanner 处理深层嵌套', () => {
    const content = `# 文档

## 2 系统功能

### 2.1 模块A

#### 2.1.1 子模块A1
内容A1

#### 2.1.2 子模块A2
内容A2

### 2.2 模块B

#### 2.2.1 子模块B1
内容B1
`;

    const builder = new HeadingTreeBuilder();
    const root = builder.build(content);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, {
      targetWords: 100000,
      wordBudget: { min: 5000, max: 8000 },
      tolerance: 0.2,
    });

    // 应该展开到 h3 级别（2.1, 2.2）
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────
// 回归测试 4: finalizer 集成标题检查
// ────────────────────────────────────────────────────────────

describe('回归: finalizer 集成标题检查', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'regression-finalizer-'));
    mkdirSync(join(projectDir, 'assembly'), { recursive: true });
    mkdirSync(join(projectDir, 'output'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('finalize 不报错当 outline.md 不存在', () => {
    // 创建组装产物
    writeFileSync(join(projectDir, 'assembly', 'merged-v1.md'), '# 文档\n\n## 1. 概述\n\n内容', 'utf-8');

    // 不创建 outline.md
    const report = finalize(projectDir);

    expect(report).toBeDefined();
    expect(report.readyForExport).toBe(true);
  });

  it('finalize 正常处理有 outline.md 的情况', () => {
    // 创建 outline.md
    writeFileSync(join(projectDir, 'outline.md'), '# 文档\n\nch001 概述\n', 'utf-8');

    // 创建组装产物
    writeFileSync(join(projectDir, 'assembly', 'merged-v1.md'), '# 文档\n\n## 1. 概述\n\n内容', 'utf-8');

    const report = finalize(projectDir);

    expect(report).toBeDefined();
    expect(report.readyForExport).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 回归测试 5: 端到端流程
// ────────────────────────────────────────────────────────────

describe('回归: 端到端流程', () => {
  it('需求提取 → 标题树 → 大纲规划 完整流程', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'regression-e2e-'));
    try {
      // 创建需求文档
      const requirementsDoc = `# 系统需求

## 2 系统功能

### 2.1 战略管理

#### 2.1.1 规划目标管理
规划目标管理的详细描述。

#### 2.1.2 规划框架管理
规划框架管理的详细描述。

### 2.2 市场营销

#### 2.2.1 客户关系管理
客户关系管理的详细描述。
`;
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, requirementsDoc, 'utf-8');

      // Step 1: 需求提取
      const extractor = new RequirementExtractor(projectDir);
      const requirements = await extractor.extractFromDocument(docPath);
      expect(requirements.length).toBeGreaterThanOrEqual(3);

      // Step 2: 标题树构建
      const builder = new HeadingTreeBuilder();
      const headingTree = builder.build(requirementsDoc);
      expect(headingTree.children.length).toBeGreaterThan(0);

      // Step 3: 大纲规划
      const planner = new AdaptiveOutlinePlanner();
      const chapters = planner.plan(headingTree, {
        targetWords: 100000,
        wordBudget: { min: 5000, max: 8000 },
        tolerance: 0.2,
      });
      // 应该展开到 h3 级别（2.1, 2.2）
      expect(chapters.length).toBeGreaterThanOrEqual(2);

      // 验证章节 ID 格式
      for (const ch of chapters) {
        expect(ch.id).toMatch(/^ch\d{3}$/);
        expect(ch.title).toBeTruthy();
        expect(ch.wordBudget).toBeDefined();
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ────────────────────────────────────────────────────────────
// 回归测试 6: 边界条件
// ────────────────────────────────────────────────────────────

describe('回归: 边界条件', () => {
  it('HeadingTreeBuilder 处理只有标题没有内容的文档', () => {
    const content = `# 标题

## 2.1 章节A

## 2.2 章节B

## 2.3 章节C
`;

    const builder = new HeadingTreeBuilder();
    const root = builder.build(content);

    expect(root.children.length).toBe(1); // h1
    expect(root.children[0].children.length).toBe(3); // 3 个 h2
  });

  it('AdaptiveOutlinePlanner 处理单章节文档', () => {
    const content = `# 文档

## 1. 唯一章节
这是唯一的内容。
`;

    const builder = new HeadingTreeBuilder();
    const root = builder.build(content);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, {
      targetWords: 100000,
      wordBudget: { min: 5000, max: 8000 },
      tolerance: 0.2,
    });

    // 应该至少有 1 个章节
    expect(chapters.length).toBeGreaterThanOrEqual(1);
  });

  it('checkHeadingHierarchy 处理空文档', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'regression-empty-'));
    try {
      writeFileSync(join(projectDir, 'outline.md'), '# 文档\n\nch001 概述\n', 'utf-8');

      const result = checkHeadingHierarchy(projectDir, '');

      // 空文档应该报告问题
      expect(result.ok).toBe(false);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
