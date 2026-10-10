import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeLoader } from '../../src/knowledge/loader.js';

describe('KnowledgeLoader - Writing Styles', () => {
  let tempDir: string;
  let loader: KnowledgeLoader;

  beforeEach(() => {
    tempDir = join(tmpdir(), `confwrite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    loader = new KnowledgeLoader(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadWritingStyleGuide', () => {
    it('should return null when no writing styles directory exists', () => {
      const result = loader.loadWritingStyleGuide(['政策背景'], '项目背景与建设必要性');
      expect(result).toBeNull();
    });

    it('should match style by title keywords', () => {
      // Setup writing styles directory
      const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
      mkdirSync(stylesDir, { recursive: true });
      
      writeFileSync(join(stylesDir, 'overview.md'), `---
title: 概述型写作风格
tags: [概述, 背景, 总论, 简介, 理解]
matchCategories: [政策背景, 行业分析]
---

## 结构要求
- 使用"总-分"结构
`);

      const result = loader.loadWritingStyleGuide([], '项目背景与建设必要性');
      expect(result).not.toBeNull();
      expect(result?.frontmatter.title).toBe('概述型写作风格');
    });

    it('should match style by category', () => {
      const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
      mkdirSync(stylesDir, { recursive: true });
      
      writeFileSync(join(stylesDir, 'functional.md'), `---
title: 功能描述型写作风格
tags: [功能, 模块, 方案]
matchCategories: [业务功能, 技术组件]
---

## 结构要求
- 按功能模块逐一描述
`);

      const result = loader.loadWritingStyleGuide(['业务功能', '系统架构'], '固定资产管理模块');
      expect(result).not.toBeNull();
      expect(result?.frontmatter.title).toBe('功能描述型写作风格');
    });

    it('should prefer category match over title match', () => {
      const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
      mkdirSync(stylesDir, { recursive: true });
      
      // overview.md matches "背景" in title
      writeFileSync(join(stylesDir, 'overview.md'), `---
title: 概述型
tags: [背景]
matchCategories: []
---
概述型内容
`);

      // commitment.md matches "保障" in category
      writeFileSync(join(stylesDir, 'commitment.md'), `---
title: 承诺型
tags: []
matchCategories: [质量保障]
---
承诺型内容
`);

      // Title has "背景" but category is "质量保障"
      const result = loader.loadWritingStyleGuide(['质量保障'], '背景说明');
      expect(result).not.toBeNull();
      expect(result?.frontmatter.title).toBe('承诺型');
    });

    it('should return null when no style matches', () => {
      const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
      mkdirSync(stylesDir, { recursive: true });
      
      writeFileSync(join(stylesDir, 'overview.md'), `---
title: 概述型
tags: [概述, 背景]
matchCategories: [政策背景]
---
概述型内容
`);

      const result = loader.loadWritingStyleGuide(['交付物'], '功能清单');
      expect(result).toBeNull();
    });
  });

  describe('generateWritingStyleInjection', () => {
    it('should return empty string when no style matches', () => {
      const result = loader.generateWritingStyleInjection([], '普通章节');
      expect(result).toBe('');
    });

    it('should generate injection with style content', () => {
      const stylesDir = join(tempDir, 'knowledge', 'writing-styles');
      mkdirSync(stylesDir, { recursive: true });
      
      writeFileSync(join(stylesDir, 'process.md'), `---
title: 流程型写作风格
tags: [流程, 步骤]
matchCategories: []
---

## 结构要求
- 按时间顺序组织步骤

## 语言风格
- 使用祈使句
`);

      const result = loader.generateWritingStyleInjection([], '实施流程与方法论');
      expect(result).toContain('写作风格');
      expect(result).toContain('流程型');
      expect(result).toContain('按时间顺序');
    });
  });
});
