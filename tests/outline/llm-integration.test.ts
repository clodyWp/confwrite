/**
 * OutlineGenerator LLM 路径集成测试
 *
 * 覆盖 spec: specs/outline-llm-integration.md
 * 关联 Issue: #90
 *
 * 验证 OutlineGenerator 通过 LLMPlanner 调用 LLM 生成大纲时的行为不变量和降级策略。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineGenerator } from '../../src/outline/generator.js';
import type { LLMCaller } from '../../src/outline/llm-planner.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-llm-integration-'));
}

/** 创建标准测试项目结构（模板 + 章节类型） */
function setupProject(projectDir: string): void {
  // 创建 outline-templates
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

  // 创建 chapter-types
  const chapterTypesDir = join(projectDir, 'knowledge', 'chapter-types');
  mkdirSync(chapterTypesDir, { recursive: true });
  for (const [type, name, min, max, imp] of [
    ['overview', '概述章', 5000, 8000, 3],
    ['requirements', '需求章', 8000, 12000, 4],
    ['architecture', '架构章', 10000, 15000, 5],
    ['functional', '功能章', 12000, 20000, 5],
    ['implementation', '实施章', 10000, 15000, 4],
  ]) {
    writeFileSync(join(chapterTypesDir, `${type}.md`), `---
name: ${name}
wordBudget:
  min: ${min}
  max: ${max}
importance: ${imp}
writingStyle: functional
---
`);
  }
}

/** 创建需求文档 */
function writeRequirements(projectDir: string, content: string): void {
  const inputsDir = join(projectDir, 'inputs');
  mkdirSync(inputsDir, { recursive: true });
  writeFileSync(join(inputsDir, 'requirements.md'), content);
}

/** 标准 LLM 响应（3 章） */
const STANDARD_LLM_RESPONSE = JSON.stringify([
  { id: 'ch001', title: '项目概述', type: 'overview', description: '项目背景和目标', requirementSource: ['一'] },
  { id: 'ch002', title: '系统架构', type: 'architecture', description: '技术架构设计', requirementSource: ['二', '2.1'] },
  { id: 'ch003', title: '功能实现', type: 'functional', description: '核心功能模块', requirementSource: ['三'] },
]);

describe('OutlineGenerator LLM integration', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
    setupProject(projectDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('LLM 成功路径', () => {
    it('INV-OL-1/2/3: 标准 JSON 响应产生完整章节列表', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 一、项目概述\n\n内容\n\n## 二、架构需求\n\n内容\n\n## 三、功能需求\n\n内容');

      const mockCaller: LLMCaller = async () => STANDARD_LLM_RESPONSE;
      const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert
      // INV-OL-1: 章节数量与 LLM 返回一致
      expect(outline.chapters).toHaveLength(3);
      expect(outline.chapters[0].title).toBe('项目概述');
      expect(outline.chapters[1].title).toBe('系统架构');
      expect(outline.chapters[2].title).toBe('功能实现');

      // INV-OL-2: 每个章节都有 wordBudget（由 OutlineGenerator 填充，非 LLM 提供）
      for (const ch of outline.chapters) {
        expect(ch.wordBudget).toBeDefined();
        expect(ch.wordBudget!.min).toBeGreaterThan(0);
        expect(ch.wordBudget!.max).toBeGreaterThan(ch.wordBudget!.min);
      }

      // INV-OL-3: requirementSource 转换为 { sections, headings } 结构
      expect(outline.chapters[0].requirementSource).toEqual({ sections: ['一'], headings: [] });
      expect(outline.chapters[1].requirementSource).toEqual({ sections: ['二', '2.1'], headings: [] });
      expect(outline.chapters[2].requirementSource).toEqual({ sections: ['三'], headings: [] });
    });

    it('INV-OL-4: LLM 未返回 id 时必须自动生成', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 一、概述\n\n内容');

      const noIdResponse = JSON.stringify([
        { title: '概述', type: 'overview', description: '概述内容' },
        { title: '架构', type: 'architecture', description: '架构内容' },
      ]);
      const mockCaller: LLMCaller = async () => noIdResponse;
      const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-4: 自动生成 id
      expect(outline.chapters).toHaveLength(2);
      expect(outline.chapters[0].id).toBe('ch001');
      expect(outline.chapters[1].id).toBe('ch002');
    });
  });

  describe('LLM 降级路径', () => {
    it('INV-OL-5/6: LLM 返回无效 JSON 时降级到 Tier 2/3', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 1 项目概述\n\n内容\n\n## 2 功能需求\n\n内容');

      const badCaller: LLMCaller = async () => '这是一份大纲规划建议，但格式不对';
      const generator = new OutlineGenerator(projectDir, { llmCaller: badCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-5: 不抛异常，返回有效 Outline
      expect(outline).toBeDefined();
      expect(outline.title).toBe('技术方案');
      expect(outline.chapters.length).toBeGreaterThan(0);
      // 降级成功 — 章节不来自 LLM（因为 LLM 返回无效）
    });

    it('INV-OL-5: LLM 抛异常（超时）时降级到 Tier 2/3', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 1 项目概述\n\n内容\n\n## 2 功能需求\n\n内容');

      const timeoutCaller: LLMCaller = async () => {
        throw new Error('LLM request timed out after 30000ms');
      };
      const generator = new OutlineGenerator(projectDir, { llmCaller: timeoutCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-5: 不抛异常
      expect(outline).toBeDefined();
      expect(outline.chapters.length).toBeGreaterThan(0);

      // 额外验证：Outline 结构完整
      expect(outline.createdAt).toBeDefined();
      expect(outline.version).toBe('1.0.0');
      for (const ch of outline.chapters) {
        expect(ch.id).toBeDefined();
        expect(ch.title).toBeDefined();
        expect(ch.type).toBeDefined();
      }
    });

    it('INV-OL-7: LLM 返回空数组时降级', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 1 概述\n\n内容');

      const emptyCaller: LLMCaller = async () => '[]';
      const generator = new OutlineGenerator(projectDir, { llmCaller: emptyCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-7: 空数组触发降级
      expect(outline).toBeDefined();
      expect(outline.chapters.length).toBeGreaterThan(0);
    });

    it('INV-OL-8: LLM 返回缺少必填字段的章节时降级', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 1 概述\n\n内容');

      const badFieldsCaller: LLMCaller = async () =>
        JSON.stringify([{ id: 'ch001' }]); // 缺少 title 和 type
      const generator = new OutlineGenerator(projectDir, { llmCaller: badFieldsCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-8: 缺少必填字段触发降级
      expect(outline).toBeDefined();
      expect(outline.chapters.length).toBeGreaterThan(0);
    });
  });

  describe('LLM 数据验证', () => {
    it('INV-OL-10: Tier 3（模板方式）始终成功', async () => {
      // Arrange — 无需求文档、无 LLM
      const generator = new OutlineGenerator(projectDir);

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — INV-OL-10: 即使无 LLM 和需求文档，也返回有效 Outline
      expect(outline).toBeDefined();
      expect(outline.title).toBe('技术方案');
      expect(outline.chapters.length).toBeGreaterThan(0);
      expect(outline.createdAt).toBeDefined();
      expect(outline.version).toBe('1.0.0');
    });

    it('INV-OL-9: 无 Markdown 标题时 Tier 2 失败，降级到 Tier 3', async () => {
      // Arrange — 需求文档没有 Markdown # 标题
      writeRequirements(projectDir, '这是一段纯文本需求，没有任何 Markdown 标题格式。');

      const failingCaller: LLMCaller = async () => {
        throw new Error('LLM unavailable');
      };
      const generator = new OutlineGenerator(projectDir, { llmCaller: failingCaller });

      // Act
      const outline = await generator.generate('technical-proposal', []);

      // Assert — 降级到 Tier 3（模板方式）
      expect(outline).toBeDefined();
      expect(outline.chapters.length).toBeGreaterThan(0);
      expect(outline.title).toBe('技术方案');
    });

    it('INV-OL-11: 超长需求文档截断到 30000 字符', async () => {
      // Arrange
      const longContent = '# 需求文档\n\n' + 'A'.repeat(35000);
      writeRequirements(projectDir, longContent);

      let receivedPrompt = '';
      const mockCaller: LLMCaller = async (prompt) => {
        receivedPrompt = prompt;
        return STANDARD_LLM_RESPONSE;
      };
      const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });

      // Act
      await generator.generate('technical-proposal', []);

      // Assert — INV-OL-11: prompt 中内容被截断
      expect(receivedPrompt).toContain('[... 内容已截断 ...]');
      // 截断后的 prompt 应远小于原始内容长度
      expect(receivedPrompt.length).toBeLessThan(longContent.length);
    });

    it('INV-OL-12: Prompt 包含 targetWords 和 wordBudget', async () => {
      // Arrange
      writeRequirements(projectDir, '# 需求文档\n\n## 一、概述\n\n内容');

      let receivedPrompt = '';
      const mockCaller: LLMCaller = async (prompt) => {
        receivedPrompt = prompt;
        return STANDARD_LLM_RESPONSE;
      };
      const generator = new OutlineGenerator(projectDir, { llmCaller: mockCaller });

      // Act
      await generator.generate('technical-proposal', []);

      // Assert — INV-OL-12: prompt 包含字数信息
      expect(receivedPrompt).toContain('目标总字数');
      expect(receivedPrompt).toContain('字数预算');
    });
  });
});
