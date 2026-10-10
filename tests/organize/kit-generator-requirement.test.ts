import { describe, it, expect } from 'vitest';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';
import type { RequirementMap } from '../../src/organize/requirement-mapper.js';

describe('KitGenerator - requirement injection', () => {
  it('should inject requirement content into material kit', () => {
    const generator = new KitGenerator();

    const mapping: ChapterMapping = {
      chapterId: 'ch001',
      title: '项目背景',
      relatedFiles: [],
      relatedCategories: [],
      description: '本节涵盖项目背景相关内容。',
    };

    const baseline: DataBaseline = {
      metrics: {},
      technicalTerms: [],
      requirements: [],
    };

    const requirementMap: RequirementMap = {
      'ch001': {
        sections: ['1.1'],
        headings: ['1.1 项目背景'],
        content: '## 1.1 项目背景\n\n本项目旨在建设一个资产管理系统，实现资产全生命周期管理...',
      },
    };

    const content = generator.generateWithOutline(mapping, baseline, undefined, requirementMap);

    // 验证素材包包含需求内容
    expect(content).toContain('需求要点');
    expect(content).toContain('资产管理系统');
    expect(content).toContain('全生命周期管理');
  });

  it('should prioritize requirement content over domain knowledge', () => {
    const generator = new KitGenerator();

    const mapping: ChapterMapping = {
      chapterId: 'ch002',
      title: '计划管理',
      relatedFiles: [
        {
          filename: 'domain-knowledge.md',
          category: 'functional',
          relativePath: 'reference_material/domain-knowledge.md',
          summary: '领域知识：ERP系统最佳实践...',
          size: 50000,
        },
      ],
      relatedCategories: ['functional'],
      relatedKeywords: ['计划管理', 'ERP'],
      description: '本节涵盖计划管理相关内容。',
    };

    const baseline: DataBaseline = {
      metrics: { '库存周转率': '25%' },
      technicalTerms: ['ERP', 'S&OP'],
      requirements: [],
    };

    const requirementMap: RequirementMap = {
      'ch002': {
        sections: ['2.1'],
        headings: ['2.1 计划管理'],
        content: '## 2.1 计划管理\n\n实现计划单快速编制，提供单据查询、变更调整、版本管控...',
      },
    };

    const content = generator.generateWithOutline(mapping, baseline, undefined, requirementMap);

    // 验证需求内容在素材包中
    expect(content).toContain('计划单快速编制');
    expect(content).toContain('单据查询');
    
    // 验证需求内容出现在"需求要点"部分
    const requirementSection = content.indexOf('## 需求要点');
    const domainKnowledgeSection = content.indexOf('## 相关文件');
    expect(requirementSection).toBeGreaterThan(-1);
  });

  it('should handle chapters without requirement content', () => {
    const generator = new KitGenerator();

    const mapping: ChapterMapping = {
      chapterId: 'ch003',
      title: '无需求内容的章节',
      relatedFiles: [],
      relatedCategories: [],
      description: '本节涵盖相关内容。',
    };

    const baseline: DataBaseline = {
      metrics: {},
      technicalTerms: [],
      requirements: [],
    };

    const requirementMap: RequirementMap = {
      'ch003': {
        sections: [],
        headings: [],
        content: '',
      },
    };

    const content = generator.generateWithOutline(mapping, baseline, undefined, requirementMap);

    // 验证素材包仍然生成，但没有需求要点部分
    expect(content).toContain('ch003');
    expect(content).toContain('无需求内容的章节');
  });
});
