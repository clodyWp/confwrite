import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutlineTemplateLoader } from '../../src/outline/template-loader.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-template-loader-test-'));
}

describe('OutlineTemplateLoader', () => {
  let tempDir: string;
  let loader: OutlineTemplateLoader;

  beforeEach(() => {
    tempDir = createTempDir();
    loader = new OutlineTemplateLoader(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadTemplate', () => {
    it('应该从知识库加载大纲模板', () => {
      const templatesDir = join(tempDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      const templateContent = `---
name: 技术方案
description: 适用于技术项目方案文档
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
  - type: support
    required: false
    order: 6
  - type: appendix
    required: false
    order: 7
---

# 技术方案模板

## 使用说明
本模板适用于技术项目方案文档...
`;
      writeFileSync(join(templatesDir, 'technical-proposal.md'), templateContent);

      const template = loader.loadTemplate('technical-proposal');
      
      expect(template).toBeDefined();
      expect(template.name).toBe('技术方案');
      expect(template.description).toBe('适用于技术项目方案文档');
      expect(template.targetWords).toBe(50000);
      expect(template.chapters.length).toBe(7);
    });

    it('应该解析章节配置', () => {
      const templatesDir = join(tempDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      const templateContent = `---
name: 测试模板
description: 测试
targetWords: 30000
chapters:
  - type: overview
    required: true
    order: 1
  - type: functional
    required: false
    order: 2
---
`;
      writeFileSync(join(templatesDir, 'test.md'), templateContent);

      const template = loader.loadTemplate('test');
      
      expect(template.chapters[0].type).toBe('overview');
      expect(template.chapters[0].required).toBe(true);
      expect(template.chapters[0].order).toBe(1);
      expect(template.chapters[1].type).toBe('functional');
      expect(template.chapters[1].required).toBe(false);
    });

    it('应该在模板不存在时抛出错误', () => {
      expect(() => {
        loader.loadTemplate('nonexistent');
      }).toThrow('大纲模板不存在: nonexistent');
    });
  });

  describe('loadAllTemplates', () => {
    it('应该加载所有可用的大纲模板', () => {
      const templatesDir = join(tempDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      writeFileSync(join(templatesDir, 'template1.md'), `---
name: 模板1
description: 描述1
targetWords: 30000
chapters:
  - type: overview
    required: true
    order: 1
---
`);
      
      writeFileSync(join(templatesDir, 'template2.md'), `---
name: 模板2
description: 描述2
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---
`);

      const allTemplates = loader.loadAllTemplates();
      
      expect(allTemplates.size).toBe(2);
      expect(allTemplates.has('template1')).toBe(true);
      expect(allTemplates.has('template2')).toBe(true);
    });

    it('应该在目录为空时返回空Map', () => {
      const allTemplates = loader.loadAllTemplates();
      expect(allTemplates.size).toBe(0);
    });
  });

  describe('getTemplateNames', () => {
    it('应该返回所有模板名称', () => {
      const templatesDir = join(tempDir, 'knowledge', 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      
      writeFileSync(join(templatesDir, 'technical-proposal.md'), `---
name: 技术方案
description: 技术方案模板
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---
`);
      
      writeFileSync(join(templatesDir, 'bid-document.md'), `---
name: 投标文档
description: 投标文档模板
targetWords: 80000
chapters:
  - type: overview
    required: true
    order: 1
---
`);

      const names = loader.getTemplateNames();
      
      expect(names).toContain('technical-proposal');
      expect(names).toContain('bid-document');
    });
  });
});
