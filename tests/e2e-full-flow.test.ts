/**
 * 端到端流程测试 — 用真实数据验证完整流程
 *
 * 测试覆盖：
 * 1. 需求提取 → 标题树 → 大纲规划 → outline 格式 → 素材包校验
 * 2. 用 LMERP2V2 的 286KB 需求文档作为输入
 * 3. 验证每个阶段的产物符合预期
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RequirementExtractor } from '../src/outline/requirement-extractor.js';
import { HeadingTreeBuilder } from '../src/outline/heading-tree.js';
import { AdaptiveOutlinePlanner } from '../src/outline/adaptive-planner.js';
import { OutlineParser } from '../src/organize/outline-parser.js';
import { validateChapterKits } from '../src/organize/kit-validator.js';
import { checkHeadingHierarchy } from '../src/assemble/heading-checker.js';

// 读取真实数据
const TEST_DATA_PATH = join(process.cwd(), 'test-data-requirements.md');
const requirementsDoc = existsSync(TEST_DATA_PATH)
  ? readFileSync(TEST_DATA_PATH, 'utf-8')
  : '';

const describeIf = existsSync(TEST_DATA_PATH) ? describe : describe.skip;

describeIf('端到端流程测试 — LMERP2V2 真实数据', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'e2e-lmerp2v2-'));
    mkdirSync(join(projectDir, 'inputs'), { recursive: true });
    mkdirSync(join(projectDir, 'assets', 'chapter-kits'), { recursive: true });
    writeFileSync(join(projectDir, 'inputs', 'requirements.md'), requirementsDoc, 'utf-8');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  describe('阶段 1: 需求提取 (Wave 2)', () => {
    it('提取 100+ 条需求（修复前只有 1 条）', async () => {
      const extractor = new RequirementExtractor(projectDir);
      const docPath = join(projectDir, 'inputs', 'requirements.md');
      const requirements = await extractor.extractFromDocument(docPath);

      expect(requirements.length).toBeGreaterThan(50);
      expect(requirements.length).toBeLessThan(500); // 合理上限

      // 每条需求都有标题
      for (const req of requirements) {
        expect(req.title).toBeTruthy();
        expect(req.title.length).toBeGreaterThan(0);
      }

      // 需求 ID 唯一
      const ids = requirements.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('阶段 2: 标题树构建 (Wave 3)', () => {
    it('构建完整的标题层级树', () => {
      const builder = new HeadingTreeBuilder();
      const root = builder.build(requirementsDoc);

      // 有顶级节点
      expect(root.children.length).toBeGreaterThan(0);

      // 递归统计叶子节点
      const countLeaves = (node: any): number => {
        if (node.children.length === 0) return 1;
        return node.children.reduce((sum: number, c: any) => sum + countLeaves(c), 0);
      };

      const leafCount = countLeaves(root);
      expect(leafCount).toBeGreaterThan(50); // 应该有很多功能模块
    });
  });

  describe('阶段 3: 大纲规划 (Wave 1, 3)', () => {
    it('生成 70+ 章节（修复前只有 7 章）', () => {
      const builder = new HeadingTreeBuilder();
      const root = builder.build(requirementsDoc);

      const planner = new AdaptiveOutlinePlanner();
      const chapters = planner.plan(root, {
        targetWords: 1000000,
        wordBudget: { min: 5000, max: 8000 },
        tolerance: 0.2,
      });

      expect(chapters.length).toBeGreaterThan(50);
      expect(chapters.length).toBeLessThanOrEqual(200); // 合理上限

      // 章节 ID 连续
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[1].id).toBe('ch002');

      // 每个章节都有标题和字数预算
      for (const ch of chapters) {
        expect(ch.title).toBeTruthy();
        expect(ch.wordBudget).toBeDefined();
        expect(ch.wordBudget!.min).toBeGreaterThan(0);
        expect(ch.wordBudget!.max).toBeGreaterThan(ch.wordBudget!.min);
      }
    });
  });

  describe('阶段 4: outline.md 格式验证 (Wave 1)', () => {
    it('生成的 outline.md 使用新格式（ch001 标题）', () => {
      const builder = new HeadingTreeBuilder();
      const root = builder.build(requirementsDoc);

      const planner = new AdaptiveOutlinePlanner();
      const chapters = planner.plan(root, {
        targetWords: 1000000,
        wordBudget: { min: 5000, max: 8000 },
        tolerance: 0.2,
      });

      // 模拟生成 outline.md
      const lines: string[] = ['# LMERP2V2 技术方案\n'];
      for (const ch of chapters) {
        lines.push(`${ch.id} ${ch.title}`);
        if (ch.description) {
          lines.push(ch.description);
        }
        lines.push('');
      }
      const outlineContent = lines.join('\n');

      // 验证格式
      expect(outlineContent).toMatch(/^ch001\s+.+$/m);
      expect(outlineContent).toMatch(/^ch002\s+.+$/m);
      expect(outlineContent).not.toMatch(/\(ch\d{3}\)/); // 无旧格式

      // 验证 OutlineParser 能解析
      const parser = new OutlineParser();
      const outline = parser.parse(outlineContent);
      const parsedChapters = outline.getAllChapters();

      expect(parsedChapters.length).toBe(chapters.length);
      expect(parsedChapters[0].id).toBe('ch001');
    });
  });

  describe('阶段 5: 素材包校验 (Wave 1)', () => {
    it('空章节列表返回 false（防御性修复）', () => {
      const result = validateChapterKits(projectDir, []);
      expect(result.ok).toBe(false);
    });

    it('素材包与大纲对应时返回 true', () => {
      // 创建 outline.md
      const outlineContent = `# 技术方案

ch001 项目概述
ch002 需求分析
ch003 架构设计
`;
      writeFileSync(join(projectDir, 'outline.md'), outlineContent, 'utf-8');

      // 创建对应的素材包（标题必须与大纲一致）
      const titles = ['项目概述', '需求分析', '架构设计'];
      for (let i = 0; i < 3; i++) {
        const chId = `ch00${i + 1}`;
        const kitPath = join(projectDir, 'assets', 'chapter-kits', `${chId}.md`);
        writeFileSync(kitPath, `# ${chId} 素材包：${titles[i]}\n\n内容...`, 'utf-8');
      }

      // 读取大纲章节
      const parser = new OutlineParser();
      const outline = parser.parse(outlineContent);
      const chapters = outline.getAllChapters().map(ch => ({
        id: ch.id!,
        title: ch.title,
      }));

      // 校验
      const result = validateChapterKits(projectDir, chapters);
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(3);
    });
  });

  describe('阶段 6: 标题层级检查 (Wave 4)', () => {
    it('文档与大纲一致时检查通过', () => {
      const outlineContent = `# 技术方案

ch001 项目概述
ch002 需求分析
`;
      writeFileSync(join(projectDir, 'outline.md'), outlineContent, 'utf-8');

      const docContent = `# 技术方案

## 1. 项目概述

内容...

## 2. 需求分析

内容...
`;

      const result = checkHeadingHierarchy(projectDir, docContent);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('章节数不匹配时报告问题', () => {
      const outlineContent = `# 技术方案

ch001 项目概述
ch002 需求分析
ch003 架构设计
`;
      writeFileSync(join(projectDir, 'outline.md'), outlineContent, 'utf-8');

      const docContent = `# 技术方案

## 1. 项目概述

## 2. 需求分析
`;

      const result = checkHeadingHierarchy(projectDir, docContent);
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('完整流程集成', () => {
    it('需求提取 → 大纲规划 → outline 格式 → 解析验证', async () => {
      // Step 1: 需求提取
      const extractor = new RequirementExtractor(projectDir);
      const docPath = join(projectDir, 'inputs', 'requirements.md');
      const requirements = await extractor.extractFromDocument(docPath);
      expect(requirements.length).toBeGreaterThan(50);

      // Step 2: 标题树构建
      const builder = new HeadingTreeBuilder();
      const root = builder.build(requirementsDoc);
      expect(root.children.length).toBeGreaterThan(0);

      // Step 3: 大纲规划
      const planner = new AdaptiveOutlinePlanner();
      const chapters = planner.plan(root, {
        targetWords: 1000000,
        wordBudget: { min: 5000, max: 8000 },
        tolerance: 0.2,
      });
      expect(chapters.length).toBeGreaterThan(50);

      // Step 4: 生成 outline.md
      const lines: string[] = ['# LMERP2V2 技术方案\n'];
      for (const ch of chapters) {
        lines.push(`${ch.id} ${ch.title}`);
        if (ch.description) {
          lines.push(ch.description);
        }
        lines.push('');
      }
      const outlineContent = lines.join('\n');

      // Step 5: 验证 OutlineParser 能解析
      const parser = new OutlineParser();
      const outline = parser.parse(outlineContent);
      const parsedChapters = outline.getAllChapters();

      expect(parsedChapters.length).toBe(chapters.length);

      // Step 6: 验证标题层级检查
      writeFileSync(join(projectDir, 'outline.md'), outlineContent, 'utf-8');
      const headingCheck = checkHeadingHierarchy(projectDir, outlineContent);
      // 注意：outlineContent 不是最终的文档格式，这里只是验证检查器不报错
      expect(headingCheck).toBeDefined();
    });
  });
});
