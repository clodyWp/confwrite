import { describe, it, expect } from 'vitest';
import { LLMPlanner } from '../../src/outline/llm-planner.js';
import type { LLMPlannerOptions, LLMChapterJSON } from '../../src/outline/llm-planner.js';

/**
 * 创建标准测试选项
 */
function createOptions(overrides?: Partial<LLMPlannerOptions>): LLMPlannerOptions {
  return {
    requirementsContent: '# 需求文档\n\n## 1 项目概述\n\n本项目是一个ERP系统。\n\n## 2 功能需求\n\n### 2.1 用户管理\n\n系统应支持用户注册、登录和权限管理。\n\n### 2.2 订单管理\n\n系统应支持订单创建、查询和导出。',
    targetWords: 50000,
    wordBudget: { min: 5000, max: 8000 },
    templateName: 'technical-proposal',
    ...overrides,
  };
}

describe('LLMPlanner', () => {
  describe('buildPrompt', () => {
    it('should include requirements content in prompt', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const prompt = planner.buildPrompt(options);

      expect(prompt).toContain('需求文档');
      expect(prompt).toContain('项目概述');
      expect(prompt).toContain('功能需求');
    });

    it('should include target words and word budget', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions({ targetWords: 80000 });

      const prompt = planner.buildPrompt(options);

      expect(prompt).toContain('80000');
      expect(prompt).toContain('5000-8000');
    });

    it('should truncate very long requirements content', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const longContent = 'x'.repeat(50000);
      const options = createOptions({ requirementsContent: longContent });

      const prompt = planner.buildPrompt(options);

      // Should be truncated to ~30000 chars + truncation notice
      expect(prompt.length).toBeLessThan(longContent.length);
      expect(prompt).toContain('内容已截断');
    });
  });

  describe('parseResponse', () => {
    it('should parse valid JSON array', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const response = JSON.stringify([
        { id: 'ch001', title: '项目概述', type: 'overview', description: '介绍项目背景', requirementSource: ['1'] },
        { id: 'ch002', title: '功能需求', type: 'functional', description: '详细描述功能', requirementSource: ['2'] },
      ] as LLMChapterJSON[]);

      const chapters = planner.parseResponse(response, options);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].id).toBe('ch001');
      expect(chapters[0].title).toBe('项目概述');
      expect(chapters[0].type).toBe('overview');
      expect(chapters[0].wordBudget).toEqual({ min: 5000, max: 8000 });
      expect(chapters[0].requirementSource).toEqual({ sections: ['1'], headings: [] });
    });

    it('should parse JSON wrapped in markdown code block', () => {
      const caller = async () => '```json\n[{"id":"ch001","title":"测试","type":"overview","description":"描述"}]\n```';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const response = '```json\n[{"id":"ch001","title":"测试","type":"overview","description":"描述"}]\n```';
      const chapters = planner.parseResponse(response, options);

      expect(chapters).toHaveLength(1);
      expect(chapters[0].title).toBe('测试');
    });

    it('should auto-generate id if not provided', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const response = JSON.stringify([
        { title: '第一章', type: 'overview', description: '描述' },
        { title: '第二章', type: 'functional', description: '描述' },
      ]);

      const chapters = planner.parseResponse(response, options);

      expect(chapters[0].id).toBe('ch001');
      expect(chapters[1].id).toBe('ch002');
    });

    it('should throw on non-JSON response', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      expect(() => planner.parseResponse('This is not JSON', options)).toThrow('does not contain valid JSON');
    });

    it('should throw on empty array', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      expect(() => planner.parseResponse('[]', options)).toThrow('array is empty');
    });

    it('should throw on missing required fields', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const response = JSON.stringify([{ id: 'ch001', description: 'no title or type' }]);

      expect(() => planner.parseResponse(response, options)).toThrow('missing required fields');
    });

    it('should throw on non-array JSON', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      expect(() => planner.parseResponse('{"key": "value"}', options)).toThrow('not an array');
    });
  });

  describe('eastE validation — Chinese number format', () => {
    it('should handle requirements with Chinese numbers (一、二、三)', async () => {
      // eastE 需求文档格式：Word 转换后没有 # 标题，全是中文数字
      const eastEContent = `
一、项目概述

本项目是一个智能制造执行系统（MES），用于车间生产过程的优化和管理。

二、系统需求

（一）功能需求

1. 生产计划管理
系统应支持生产计划的创建、审核和下发。

2. 质量管理
系统应支持质量检测、不合格品处理和SPC分析。

（二）非功能需求

1. 性能要求
系统应支持 500 个并发用户。

2. 安全要求
系统应支持角色权限管理和操作日志。

三、技术方案

（一）系统架构
采用微服务架构，分为数据层、服务层和展示层。

（二）数据架构
使用关系型数据库存储业务数据，时序数据库存储采集数据。

四、实施计划

（一）里程碑
项目分为需求分析、设计开发、测试部署三个阶段。

（二）资源配置
需要项目经理 1 名、开发人员 5 名、测试人员 2 名。
`;

      const mockChapters = [
        { id: 'ch001', title: '项目概述', type: 'overview', description: '介绍智能制造执行系统的背景和目标', requirementSource: ['一'] },
        { id: 'ch002', title: '系统功能需求', type: 'functional', description: '生产计划管理和质量管理功能', requirementSource: ['二', '（一）'] },
        { id: 'ch003', title: '非功能需求', type: 'requirements', description: '性能和安全要求', requirementSource: ['二', '（二）'] },
        { id: 'ch004', title: '系统架构设计', type: 'architecture', description: '微服务架构和数据架构方案', requirementSource: ['三', '（一）', '（二）'] },
        { id: 'ch005', title: '实施计划', type: 'implementation', description: '里程碑和资源配置', requirementSource: ['四', '（一）', '（二）'] },
      ];

      const caller = async (_prompt: string) => JSON.stringify(mockChapters);
      const planner = new LLMPlanner(caller);
      const options = {
        requirementsContent: eastEContent,
        targetWords: 100000,
        wordBudget: { min: 5000, max: 8000 },
        templateName: 'technical-proposal',
      };

      const chapters = await planner.plan(options);

      expect(chapters).toHaveLength(5);
      expect(chapters[0].title).toBe('项目概述');
      expect(chapters[0].requirementSource?.sections).toEqual(['一']);
      expect(chapters[1].requirementSource?.sections).toEqual(['二', '（一）']);
      expect(chapters[3].type).toBe('architecture');
      expect(chapters[4].type).toBe('implementation');
    });

    it('should generate correct prompt for eastE format document', () => {
      const caller = async () => '[]';
      const planner = new LLMPlanner(caller);
      const eastEContent = '一、项目概述\n\n本项目是一个智能制造执行系统。\n\n二、功能需求';
      const options = {
        requirementsContent: eastEContent,
        targetWords: 100000,
        wordBudget: { min: 5000, max: 8000 },
        templateName: 'technical-proposal',
      };

      const prompt = planner.buildPrompt(options);

      // Prompt should contain the Chinese number format content
      expect(prompt).toContain('一、项目概述');
      expect(prompt).toContain('智能制造执行系统');
      expect(prompt).toContain('二、功能需求');
      // Prompt should instruct LLM to output JSON
      expect(prompt).toContain('JSON');
    });
  });

  describe('plan', () => {
    it('should call LLM and return parsed chapters', async () => {
      const mockChapters: LLMChapterJSON[] = [
        { id: 'ch001', title: '项目概述', type: 'overview', description: '项目背景介绍', requirementSource: ['1'] },
        { id: 'ch002', title: '系统需求', type: 'requirements', description: '功能与非功能需求', requirementSource: ['2'] },
        { id: 'ch003', title: '系统架构', type: 'architecture', description: '架构设计方案', requirementSource: ['3'] },
      ];

      const caller = async (_prompt: string) => JSON.stringify(mockChapters);
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      const chapters = await planner.plan(options);

      expect(chapters).toHaveLength(3);
      expect(chapters[0].title).toBe('项目概述');
      expect(chapters[1].title).toBe('系统需求');
      expect(chapters[2].title).toBe('系统架构');
    });

    it('should throw when LLM returns invalid response', async () => {
      const caller = async () => 'I cannot help with that.';
      const planner = new LLMPlanner(caller);
      const options = createOptions();

      await expect(planner.plan(options)).rejects.toThrow();
    });
  });
});
