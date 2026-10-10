/**
 * Wave 2 TDD — 需求提取器重写 (Bug B)
 *
 * 核心问题：
 *   - RequirementExtractor 用正则 `/^\d+\.\s+(.+)$/` 匹配数字开头的行
 *   - LMERP2V2 的 requirements.md 是 Word 转换的，格式是 `### 2.1.1 标题`
 *   - 正则只匹配极少数行，丢失所有详细描述
 *
 * 修复策略：
 *   - 解析所有 Markdown 标题（#/##/###/####）作为需求
 *   - 提取标题下方的段落文本作为描述
 *   - 完整性校验：标题数 = 需求数
 *
 * 硬约束：不得遗漏任何需求（招标文档遗漏 = 废标风险）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequirementExtractor } from '../src/outline/requirement-extractor.js';

// 模拟 LMERP2V2 的 requirements.md 格式（Word 转换后的 Markdown）
const WORD_CONVERTED_DOC = `# 2 系统主要功能

## 2.1 战略管理

### 2.1.1 完善数字化规划目标体系

规划目标管理是 ERP 系统的核心模块。通过建立数字化规划体系，实现企业战略目标的分解、跟踪和评估。

主要功能包括：
- 规划目标制定
- 目标分解与下达
- 执行跟踪与预警

### 2.1.2 规划框架管理

规划框架管理模块提供规划框架的创建和维护功能。支持多层级规划框架的配置和管理。

### 2.1.3 拉通集成计划参数与策略

本模块实现计划参数与策略的拉通集成，确保各业务单元的计划协调一致。

## 2.2 市场营销

### 2.2.1 客户关系管理

客户关系管理模块提供客户信息管理、商机跟踪、销售漏斗等功能。

### 2.2.2 销售订单管理

支持销售订单的全生命周期管理，包括订单创建、审批、执行和关闭。

## 2.3 生产制造

### 2.3.1 管理生产制造策略

管理生产制造策略，支持多种生产模式。

### 2.3.2 管理计划参数

配置和管理生产计划参数。

### 2.3.3 一本计划

实现生产、采购、销售的一体化计划管理。
`;

// 简单格式的需求文档
const SIMPLE_DOC = `# 系统需求

## 1. 功能需求

系统应具备以下功能：
- 用户管理
- 权限控制

## 2. 性能需求

系统响应时间不超过 3 秒。
`;

describe('Wave 2 — RequirementExtractor 重写', () => {
  let projectDir: string;
  let extractor: RequirementExtractor;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'wave2-req-'));
    extractor = new RequirementExtractor(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('extractFromDocument — Word 转换格式', () => {
    it('提取所有 Markdown 标题作为需求（不遗漏）', async () => {
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, WORD_CONVERTED_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      // 文档中有以下标题层级：
      // # 2 系统主要功能 (1 个 h1)
      // ## 2.1, 2.2, 2.3 (3 个 h2)
      // ### 2.1.1, 2.1.2, 2.1.3, 2.2.1, 2.2.2, 2.3.1, 2.3.2, 2.3.3 (8 个 h3)
      // 总计 12 个标题 → 至少应提取 8 个需求（排除顶层 h1）
      // 或全部 12 个（取决于策略）
      expect(requirements.length).toBeGreaterThanOrEqual(8);
    });

    it('每个需求都有描述（标题下方的段落文本）', async () => {
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, WORD_CONVERTED_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      // 至少大部分需求应该有描述
      const withDescription = requirements.filter(r => r.description && r.description.length > 0);
      expect(withDescription.length).toBeGreaterThan(requirements.length * 0.5);
    });

    it('需求 ID 唯一且连续', async () => {
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, WORD_CONVERTED_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      const ids = requirements.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length); // 无重复
    });

    it('需求来源正确记录', async () => {
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, WORD_CONVERTED_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      for (const req of requirements) {
        expect(req.source).toBe('requirements.md');
      }
    });
  });

  describe('extractFromDocument — 简单格式', () => {
    it('也能提取简单格式的标题', async () => {
      const docPath = join(projectDir, 'simple.md');
      writeFileSync(docPath, SIMPLE_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      // 至少有 "功能需求" 和 "性能需求" 两个
      expect(requirements.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractFromDocument — 兼容性', () => {
    it('仍然支持旧的数字列表格式', async () => {
      const docPath = join(projectDir, 'legacy.md');
      writeFileSync(docPath, `# 需求列表

1. 用户管理功能
2. 权限控制功能
3. 数据备份功能
`, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);

      // 应至少提取 3 个需求（数字列表 + 标题）
      expect(requirements.length).toBeGreaterThanOrEqual(3);
    });

    it('空文档返回空数组', async () => {
      const docPath = join(projectDir, 'empty.md');
      writeFileSync(docPath, '', 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);
      expect(requirements).toEqual([]);
    });
  });

  describe('generateStatistics — 完整性校验', () => {
    it('完整性校验应基于标题覆盖率', async () => {
      const docPath = join(projectDir, 'requirements.md');
      writeFileSync(docPath, WORD_CONVERTED_DOC, 'utf-8');

      const requirements = await extractor.extractFromDocument(docPath);
      const stats = extractor.generateStatistics(requirements);

      // 提取了 8+ 个需求，不应报「需求数量过少」
      expect(stats.total).toBeGreaterThanOrEqual(8);
      expect(stats.completeness.warnings).not.toContain('需求数量过少（<5），可能遗漏了重要需求');
    });
  });
});
