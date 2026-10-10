import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KitGenerator } from '../../src/organize/kit-generator.js';
import { KnowledgeLoader } from '../../src/knowledge/loader.js';
import type { ChapterMapping } from '../../src/organize/chapter-mapper.js';
import type { DataBaseline } from '../../src/organize/baseline-extractor.js';

describe('KitGenerator - Writing Style Integration', () => {
  let tempDir: string;
  let generator: KitGenerator;
  let knowledgeLoader: KnowledgeLoader;

  const mockBaseline: DataBaseline = {
    metrics: {},
    technicalTerms: [],
    requirements: [],
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `confwrite-kit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Setup writing styles
    const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
    mkdirSync(stylesDir, { recursive: true });
    
    writeFileSync(join(stylesDir, 'overview.md'), `---
title: 概述型写作风格
tags: [概述, 背景, 总论, 简介]
matchCategories: [政策背景, 行业分析]
---

## 结构要求
- 使用"总-分"结构
- 首段给出核心结论
`);

    writeFileSync(join(stylesDir, 'functional.md'), `---
title: 功能描述型写作风格
tags: [功能, 模块, 方案]
matchCategories: [业务功能, 技术组件]
---

## 结构要求
- 按功能模块逐一描述
`);

    knowledgeLoader = new KnowledgeLoader(tempDir);
    generator = new KitGenerator(knowledgeLoader);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should inject overview style for background chapter', () => {
    const mapping: ChapterMapping = {
      chapterId: 'ch001',
      title: '项目背景与建设必要性',
      relatedFiles: [],
      relatedCategories: ['政策背景', '行业分析'],
      relatedKeywords: [],
    };

    const content = generator.generate(mapping, mockBaseline);
    
    expect(content).toContain('写作风格');
    expect(content).toContain('概述型');
    expect(content).toContain('总-分');
  });

  it('should inject functional style for module chapter', () => {
    const mapping: ChapterMapping = {
      chapterId: 'ch019',
      title: '固定资产管理模块',
      relatedFiles: [],
      relatedCategories: ['业务功能', '系统架构'],
      relatedKeywords: [],
    };

    const content = generator.generate(mapping, mockBaseline);
    
    expect(content).toContain('写作风格');
    expect(content).toContain('功能描述型');
    expect(content).toContain('按功能模块');
  });

  it('should not inject style when no match', () => {
    const mapping: ChapterMapping = {
      chapterId: 'ch100',
      title: '普通章节',
      relatedFiles: [],
      relatedCategories: ['其他分类'],
      relatedKeywords: [],
    };

    const content = generator.generate(mapping, mockBaseline);
    
    expect(content).not.toContain('写作风格');
  });

  it('should inject style based on title keywords when no category match', () => {
    const mapping: ChapterMapping = {
      chapterId: 'ch002',
      title: '项目概述与总论',
      relatedFiles: [],
      relatedCategories: ['其他分类'],
      relatedKeywords: [],
    };

    const content = generator.generate(mapping, mockBaseline);
    
    expect(content).toContain('写作风格');
    expect(content).toContain('概述型');
  });
});
