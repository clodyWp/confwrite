/**
 * Wave 3 TDD — 大纲智能展开 + 自适应合并 (Bug G/I)
 *
 * 核心问题：
 *   - OutlineGenerator 只按模板的 7 个 type 机械生成 7 章
 *   - 没有利用需求文档的标题层级结构
 *   - 字数超出时只打印警告，没有实际合并动作
 *
 * 修复策略：
 *   1. 解析需求文档的标题层级树（HeadingTreeBuilder）
 *   2. 估算每个节点的字数
 *   3. 逐级展开：字数 > budget.max × 0.8 → 展开子节点
 *   4. 自适应合并：总字数 > target × 1.2 → 同父叶子向上合并
 *   5. 生成 outline.md（ch001 标题 格式）
 */
import { describe, it, expect } from 'vitest';
import {
  HeadingTreeBuilder,
  type HeadingNode,
} from '../src/outline/heading-tree.js';
import {
  AdaptiveOutlinePlanner,
  type PlanOptions,
} from '../src/outline/adaptive-planner.js';

// ────────────────────────────────────────────────────────────
// 测试数据：模拟 LMERP2V2 的 requirements.md
// ────────────────────────────────────────────────────────────

const LARGE_REQUIREMENTS_DOC = `# LMERP2 二期技术方案

## 2 系统主要功能

### 2.1 战略管理

#### 2.1.1 完善数字化规划目标体系
规划目标管理是 ERP 系统的核心模块。通过建立数字化规划体系，实现企业战略目标的分解、跟踪和评估。主要功能包括规划目标制定、目标分解与下达、执行跟踪与预警。系统需要支持多层级目标分解，从公司级到部门级再到个人级。同时需要提供目标达成率的实时分析和预警功能。

#### 2.1.2 规划框架管理
规划框架管理模块提供规划框架的创建和维护功能。支持多层级规划框架的配置和管理。用户可以根据不同的业务场景创建不同的规划框架，并在框架内定义关键要素和约束条件。

#### 2.1.3 拉通集成计划参数与策略
本模块实现计划参数与策略的拉通集成，确保各业务单元的计划协调一致。需要提供参数配置、策略管理和冲突检测功能。

### 2.2 市场营销

#### 2.2.1 客户关系管理
客户关系管理模块提供客户信息管理、商机跟踪、销售漏斗等功能。需要支持客户画像、客户分级、客户生命周期管理。

#### 2.2.2 销售订单管理
支持销售订单的全生命周期管理，包括订单创建、审批、执行和关闭。需要与库存、生产、财务模块联动。

### 2.3 生产制造

#### 2.3.1 管理生产制造策略
管理生产制造策略，支持多种生产模式：按订单生产、按库存生产、按订单设计。需要根据产品特性和市场需求灵活选择生产模式。

#### 2.3.2 管理计划参数
配置和管理生产计划参数，包括产能参数、工艺路线、工作中心等。

#### 2.3.3 一本计划
实现生产、采购、销售的一体化计划管理。通过统一的计划平台，实现各部门的协同运作。需要提供计划编制、计划审批、计划执行和计划调整的全流程管理。

## 3 技术架构

### 3.1 总体架构
系统采用微服务架构，基于 Kubernetes 容器化部署。

### 3.2 数据架构
数据架构采用分层设计，包括操作层、数据仓库层和数据服务层。

## 4 项目实施

### 4.1 实施计划
项目实施分为四个阶段：需求确认、系统开发、测试上线、运维保障。

### 4.2 培训计划
提供全面的培训计划，包括系统操作培训、管理员培训、高级用户培训。
`;

// 小型文档（不需要展开）
const SMALL_DOC = `# 简要方案

## 1. 概述
本项目旨在建设一体化管理平台。

## 2. 技术方案
采用微服务架构。
`;

describe('Wave 3 — HeadingTreeBuilder', () => {
  it('解析 Markdown 标题为层级树', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);

    // 根节点应该有子节点
    expect(root.children.length).toBeGreaterThan(0);
  });

  it('正确计算每个节点下的字数', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);

    // 找到 "2.1.1 完善数字化规划目标体系" 节点
    const node211 = findNodeByNumber(root, '2.1.1');
    expect(node211).toBeDefined();
    expect(node211!.charCount).toBeGreaterThan(50); // 有详细描述
  });

  it('叶子节点没有子节点', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);

    const node211 = findNodeByNumber(root, '2.1.1');
    expect(node211).toBeDefined();
    expect(node211!.children.length).toBe(0);
  });

  it('非叶子节点的 charCount 包含所有子节点的内容', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);

    const node21 = findNodeByNumber(root, '2.1');
    expect(node21).toBeDefined();
    // 2.1 的字数应该 >= 其子节点字数之和
    const childTotal = node21!.children.reduce((sum, c) => sum + c.charCount, 0);
    expect(node21!.charCount).toBeGreaterThanOrEqual(childTotal);
  });

  it('空文档返回空根节点', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build('');
    expect(root.children.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// AdaptiveOutlinePlanner
// ────────────────────────────────────────────────────────────

describe('Wave 3 — AdaptiveOutlinePlanner', () => {
  const defaultOptions: PlanOptions = {
    targetWords: 100000,
    wordBudget: { min: 5000, max: 8000 },
    tolerance: 0.2,
  };

  it('小文档不展开，每个叶子节点作为一个 chapter', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(SMALL_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, defaultOptions);

    // 小文档只有 2 个 h2 → 2 个 chapter
    expect(chapters.length).toBe(2);
    expect(chapters[0].id).toBe('ch001');
    expect(chapters[1].id).toBe('ch002');
  });

  it('大文档逐级展开，叶子节点成为独立 chapter', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, defaultOptions);

    // 测试文档较小，展开到 h3 级别（7 个 h3 节点）
    // 真实大文档（280KB）会进一步展开到 h4 级别
    // 至少有 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2
    expect(chapters.length).toBeGreaterThanOrEqual(7);
  });

  it('chapter ID 连续且唯一', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, defaultOptions);

    const ids = chapters.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // ID 格式：ch001, ch002, ...
    expect(ids[0]).toBe('ch001');
    expect(ids[1]).toBe('ch002');
  });

  it('每个 chapter 都有标题', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, defaultOptions);

    for (const ch of chapters) {
      expect(ch.title).toBeTruthy();
      expect(ch.title.length).toBeGreaterThan(0);
    }
  });

  it('字数超出时触发合并，减少 chapter 数量', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    // 用很小的 targetWords 强制触发合并
    const tightOptions: PlanOptions = {
      targetWords: 5000,  // 远小于文档内容
      wordBudget: { min: 3000, max: 5000 },
      tolerance: 0.2,
    };

    const chaptersTight = planner.plan(root, tightOptions);
    const chaptersLoose = planner.plan(root, defaultOptions);

    // tight 的 chapter 数量应该 <= loose（合并后更少或相等）
    expect(chaptersTight.length).toBeLessThanOrEqual(chaptersLoose.length);
  });

  it('合并后的 chapter 包含子节点的描述信息', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const tightOptions: PlanOptions = {
      targetWords: 5000,
      wordBudget: { min: 3000, max: 5000 },
      tolerance: 0.2,
    };

    const chapters = planner.plan(root, tightOptions);

    // 至少有一个 chapter 有 description
    const withDesc = chapters.filter(c => c.description && c.description.length > 0);
    expect(withDesc.length).toBeGreaterThan(0);
  });

  it('每个 chapter 有字数预算', () => {
    const builder = new HeadingTreeBuilder();
    const root = builder.build(LARGE_REQUIREMENTS_DOC);
    const planner = new AdaptiveOutlinePlanner();

    const chapters = planner.plan(root, defaultOptions);

    for (const ch of chapters) {
      expect(ch.wordBudget).toBeDefined();
      expect(ch.wordBudget!.min).toBeGreaterThan(0);
      expect(ch.wordBudget!.max).toBeGreaterThan(ch.wordBudget!.min);
    }
  });
});

// ────────────────────────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────────────────────────

function findNodeByNumber(root: HeadingNode, number: string): HeadingNode | undefined {
  if (root.number === number) return root;
  for (const child of root.children) {
    const found = findNodeByNumber(child, number);
    if (found) return found;
  }
  return undefined;
}
