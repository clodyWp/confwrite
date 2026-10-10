import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequirementMapper } from '../../src/organize/requirement-mapper.js';
import type { OutlineChapter } from '../../src/outline/types.js';

describe('RequirementMapper', () => {
  const testDir = join(process.cwd(), '.test-requirement-mapper');
  const inputsDir = join(testDir, 'inputs');
  const assetsDir = join(testDir, 'assets');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(inputsDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate requirement map from requirements.md', () => {
    // 创建一个简单的需求文档
    const requirementsContent = `# 项目需求文档

## 1. 项目概述

### 1.1 项目背景

本项目旨在建设一个资产管理系统...

### 1.2 项目目标

实现资产全生命周期管理...

## 2. 功能需求

### 2.1 计划管理

#### 2.1.1 新机计划编制

实现新机计划单快速编制...

#### 2.1.2 大修计划编制

实现大修计划单编制...
`;

    writeFileSync(join(inputsDir, 'requirements.md'), requirementsContent, 'utf-8');

    const mapper = new RequirementMapper(testDir);
    const chapters: OutlineChapter[] = [
      {
        id: 'ch001',
        title: '项目背景',
        type: 'functional',
        requirementSource: {
          sections: ['1.1'],
          headings: ['1.1 项目背景'],
        },
      },
      {
        id: 'ch002',
        title: '计划管理',
        type: 'functional',
        requirementSource: {
          sections: ['2.1.1', '2.1.2'],
          headings: ['2.1.1 新机计划编制', '2.1.2 大修计划编制'],
        },
      },
    ];

    const result = mapper.generate(chapters);

    expect(result).toBeDefined();
    expect(result['ch001']).toBeDefined();
    expect(result['ch001'].sections).toContain('1.1');
    expect(result['ch001'].content).toContain('项目背景');
    
    expect(result['ch002']).toBeDefined();
    expect(result['ch002'].sections).toContain('2.1.1');
    expect(result['ch002'].sections).toContain('2.1.2');
    expect(result['ch002'].content).toContain('新机计划编制');
    expect(result['ch002'].content).toContain('大修计划编制');
  });

  it('should save requirement map to assets/requirement-map.json', () => {
    const requirementsContent = `# 需求文档

## 1. 概述

### 1.1 背景

测试内容...
`;

    writeFileSync(join(inputsDir, 'requirements.md'), requirementsContent, 'utf-8');

    const mapper = new RequirementMapper(testDir);
    const chapters: OutlineChapter[] = [
      {
        id: 'ch001',
        title: '背景',
        type: 'functional',
        requirementSource: {
          sections: ['1.1'],
          headings: ['1.1 背景'],
        },
      },
    ];

    mapper.generateAndSave(chapters);

    const mapPath = join(assetsDir, 'requirement-map.json');
    expect(existsSync(mapPath)).toBe(true);

    const saved = JSON.parse(readFileSync(mapPath, 'utf-8'));
    expect(saved['ch001']).toBeDefined();
    expect(saved['ch001'].sections).toContain('1.1');
  });

  it('should handle chapters without requirementSource', () => {
    const requirementsContent = `# 需求文档\n\n## 1. 概述\n\n测试内容...`;
    writeFileSync(join(inputsDir, 'requirements.md'), requirementsContent, 'utf-8');

    const mapper = new RequirementMapper(testDir);
    const chapters: OutlineChapter[] = [
      {
        id: 'ch001',
        title: '无需求来源的章节',
        type: 'functional',
        // 没有 requirementSource
      },
    ];

    const result = mapper.generate(chapters);

    expect(result['ch001']).toBeDefined();
    expect(result['ch001'].sections).toHaveLength(0);
    expect(result['ch001'].content).toBe('');
  });
});
