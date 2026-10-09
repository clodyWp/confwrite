import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineGenerator } from '../../src/outline/generator.js';
import type { Requirement } from '../../src/outline/types.js';
import type { LLMCaller } from '../../src/outline/llm-planner.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-outline-generator-test-'));
}

describe('OutlineGenerator', () => {
  let tempDir: string;
  let projectDir: string;
  let generator: OutlineGenerator;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    
    // 创建模板目录和模板文件
    const templatesDir = join(projectDir, 'knowledge', 'outline-templates');
    mkdirSync(templatesDir, { recursive: true });
    
    writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术方案模板
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
  - type: requirements
    required: true
    order: 2
  - type: architecture
    required: true
    order: 3
  - type: functional
    required: true
    order: 4
  - type: implementation
    required: true
    order: 5
---
`);

    // 创建章节类型目录和类型文件
    const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
    mkdirSync(chapterTypesDir, { recursive: true });
    
    writeFileSync(join(chapterTypesDir, 'overview.md'), `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`);
    
    writeFileSync(join(chapterTypesDir, 'requirements.md'), `---
name: 需求章
wordBudget:
  min: 8000
  max: 12000
importance: 4
writingStyle: functional
---
`);
    
    writeFileSync(join(chapterTypesDir, 'architecture.md'), `---
name: 架构章
wordBudget:
  min: 10000
  max: 15000
importance: 5
writingStyle: functional
---
`);
    
    writeFileSync(join(chapterTypesDir, 'functional.md'), `---
name: 功能章
wordBudget:
  min: 12000
  max: 20000
importance: 5
writingStyle: functional
---
`);
    
    writeFileSync(join(chapterTypesDir, 'implementation.md'), `---
name: 实施章
wordBudget:
  min: 10000
  max: 15000
importance: 4
writingStyle: process
---
`);

    generator = new OutlineGenerator(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('应该根据模板生成大纲', async () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
        {
          id: 'REQ-002',
          title: '数据导出',
          priority: 'medium',
          source: 'doc1.md',
          category: 'functional',
        },
      ];

      const outline = await generator.generate('technical-proposal', requirements);

      expect(outline).toBeDefined();
      expect(outline.title).toBe('技术方案');
      expect(outline.chapters.length).toBeGreaterThan(0);
    });

    it('应该为每个章节分配字数预算', async () => {
      const requirements: Requirement[] = [];

      const outline = await generator.generate('technical-proposal', requirements);

      for (const chapter of outline.chapters) {
        expect(chapter.wordBudget).toBeDefined();
        expect(chapter.wordBudget!.min).toBeGreaterThan(0);
        expect(chapter.wordBudget!.max).toBeGreaterThan(chapter.wordBudget!.min);
      }
    });

    it('应该为每个章节生成描述', async () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
      ];

      const outline = await generator.generate('technical-proposal', requirements);

      for (const chapter of outline.chapters) {
        expect(chapter.description).toBeDefined();
        expect(chapter.description!.length).toBeGreaterThan(0);
      }
    });

    it('应该将需求分配到章节', async () => {
      const requirements: Requirement[] = [
        {
          id: 'REQ-001',
          title: '用户登录',
          priority: 'high',
          source: 'doc1.md',
          category: 'functional',
        },
        {
          id: 'REQ-002',
          title: '性能要求',
          priority: 'high',
          source: 'doc1.md',
          category: 'performance',
        },
      ];

      const outline = await generator.generate('technical-proposal', requirements);

      // 检查需求是否被分配
      const assignedRequirements = requirements.filter(r => r.assignedChapter);
      expect(assignedRequirements.length).toBeGreaterThan(0);
    });

    it('应该根据章节类型设置重要度', async () => {
      const requirements: Requirement[] = [];

      const outline = await generator.generate('technical-proposal', requirements);

      for (const chapter of outline.chapters) {
        expect(chapter.importance).toBeDefined();
        expect(chapter.importance!).toBeGreaterThanOrEqual(1);
        expect(chapter.importance!).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('evaluateWordCount', () => {
    it('应该评估字数预算总和', async () => {
      const requirements: Requirement[] = [];

      const outline = await generator.generate('technical-proposal', requirements);
      const evaluation = generator.evaluateWordCount(outline);

      expect(evaluation.totalMin).toBeGreaterThan(0);
      expect(evaluation.totalMax).toBeGreaterThan(evaluation.totalMin);
      expect(evaluation.targetWords).toBe(50000);
    });

    it('应该计算偏差率', async () => {
      const requirements: Requirement[] = [];

      const outline = await generator.generate('technical-proposal', requirements);
      const evaluation = generator.evaluateWordCount(outline);

      expect(evaluation.deviation).toBeDefined();
      expect(evaluation.deviationRate).toBeDefined();
    });

    it('应该在偏差超过阈值时生成警告', async () => {
      const requirements: Requirement[] = [];

      const outline = await generator.generate('technical-proposal', requirements);
      const evaluation = generator.evaluateWordCount(outline, 0.1); // 10%阈值

      // 如果偏差超过10%，应该有警告
      if (Math.abs(evaluation.deviationRate) > 0.1) {
        expect(evaluation.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('LLMPlanner integration', () => {
    it('should use LLMPlanner when llmCaller is provided and requirements exist', async () => {
      // Write requirements.md
      const inputsDir = join(projectDir, 'inputs');
      mkdirSync(inputsDir, { recursive: true });
      writeFileSync(join(inputsDir, 'requirements.md'), '# 需求文档\n\n## 一、项目概述\n\n本项目是一个ERP系统。\n\n## 二、功能需求\n\n### 2.1 用户管理\n\n系统应支持用户注册和登录。');

      const mockChapters = [
        { id: 'ch001', title: '项目概述', type: 'overview', description: '项目背景', requirementSource: ['一'] },
        { id: 'ch002', title: '功能需求', type: 'functional', description: '用户管理', requirementSource: ['二'] },
      ];

      let promptReceived = '';
      const mockCaller: LLMCaller = async (prompt) => {
        promptReceived = prompt;
        return JSON.stringify(mockChapters);
      };

      const llmGenerator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });
      const outline = await llmGenerator.generate('technical-proposal', []);

      expect(outline.chapters).toHaveLength(2);
      expect(outline.chapters[0].title).toBe('项目概述');
      expect(outline.chapters[0].requirementSource).toEqual({ sections: ['一'], headings: [] });
      expect(promptReceived).toContain('需求文档');
    });

    it('should fall back to AdaptiveOutlinePlanner when LLM fails', async () => {
      // Write requirements.md with Markdown headings (AdaptiveOutlinePlanner can handle)
      const inputsDir = join(projectDir, 'inputs');
      mkdirSync(inputsDir, { recursive: true });
      writeFileSync(join(inputsDir, 'requirements.md'), '# 需求文档\n\n## 1 项目概述\n\n内容\n\n## 2 功能需求\n\n内容');

      const failingCaller: LLMCaller = async () => {
        throw new Error('LLM unavailable');
      };

      const llmGenerator = new OutlineGenerator(projectDir, { llmCaller: failingCaller });
      const outline = await llmGenerator.generate('technical-proposal', []);

      // Should fall back to AdaptiveOutlinePlanner which uses # headings
      expect(outline.chapters.length).toBeGreaterThan(0);
    });

    it('should fall back to template when both LLM and AdaptivePlanner fail', async () => {
      // No requirements.md at all
      const failingCaller: LLMCaller = async () => {
        throw new Error('LLM unavailable');
      };

      const llmGenerator = new OutlineGenerator(projectDir, { llmCaller: failingCaller });
      const outline = await llmGenerator.generate('technical-proposal', []);

      // Should fall back to template-based generation
      expect(outline.chapters.length).toBeGreaterThan(0);
      expect(outline.title).toBe('技术方案');
    });

    it('should work without llmCaller (backward compatible)', async () => {
      // No llmCaller provided - should skip LLMPlanner entirely
      const outline = await generator.generate('technical-proposal', []);
      expect(outline.chapters.length).toBeGreaterThan(0);
    });
  });
});
