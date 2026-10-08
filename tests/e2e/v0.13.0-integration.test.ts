import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-integration-test-'));
}

describe('v0.13.0 集成测试', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'test-project');
    mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('完整流程', () => {
    it('应该支持手动调用 /confwrite:outline 命令', async () => {
      // 1. 初始化项目状态
      const store = new ProjectStore(projectDir);
      store.save({
        project: 'test-project',
        currentPhase: '2',
        status: 'in_progress',
        round: 1,
        chapters: {},
        tasks: {},
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });

      // 2. 创建需求文件
      const assetsDir = join(projectDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      writeFileSync(
        join(assetsDir, 'requirements.json'),
        JSON.stringify([
          { id: 'REQ-001', title: '用户登录', priority: 'high', source: 'doc1.md' },
          { id: 'REQ-002', title: '数据导出', priority: 'medium', source: 'doc1.md' },
        ], null, 2),
        'utf-8'
      );

      // 3. 创建知识库
      const knowledgeDir = join(projectDir, 'knowledge');
      mkdirSync(knowledgeDir, { recursive: true });
      
      const chapterTypesDir = join(knowledgeDir, 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      writeFileSync(
        join(chapterTypesDir, 'overview.md'),
        `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---
`,
        'utf-8'
      );

      const templatesDir = join(knowledgeDir, 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(
        join(templatesDir, 'technical-proposal.md'),
        `---
name: 技术方案
description: 技术项目方案
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---
`,
        'utf-8'
      );

      // 4. 调用大纲生成
      const { outlineCommand } = await import('../../src/commands/outline.js');
      const result = await outlineCommand({
        projectDir,
        template: 'technical-proposal',
      });

      // 5. 验证结果
      expect(result.success).toBe(true);
      expect(existsSync(join(projectDir, 'outline.md'))).toBe(true);
      expect(existsSync(join(assetsDir, 'outline-evaluation.md'))).toBe(true);

      // 6. 验证状态已更新
      const state = store.load();
      expect(state?.currentPhase).toBe('3');
    });

    it('应该验证知识库格式', async () => {
      // 1. 创建知识库
      const knowledgeDir = join(projectDir, 'knowledge');
      mkdirSync(knowledgeDir, { recursive: true });
      
      const chapterTypesDir = join(knowledgeDir, 'chapter-types');
      mkdirSync(chapterTypesDir, { recursive: true });
      writeFileSync(
        join(chapterTypesDir, 'overview.md'),
        `---
name: 概述章
wordBudget:
  min: 5000
  max: 8000
importance: 3
writingStyle: overview
---

# 概述章写作指南
`,
        'utf-8'
      );

      const templatesDir = join(knowledgeDir, 'outline-templates');
      mkdirSync(templatesDir, { recursive: true });
      writeFileSync(
        join(templatesDir, 'technical-proposal.md'),
        `---
name: 技术方案
description: 技术项目方案
targetWords: 50000
chapters:
  - type: overview
    required: true
    order: 1
---

# 技术方案模板
`,
        'utf-8'
      );

      const categoriesDir = join(knowledgeDir, 'requirement-categories');
      mkdirSync(categoriesDir, { recursive: true });
      writeFileSync(
        join(categoriesDir, 'functional.md'),
        `---
name: 功能需求
description: 功能相关需求
chapterTypes:
  - requirements
---

# 功能需求
`,
        'utf-8'
      );

      // 2. 验证知识库
      const { KnowledgeBaseValidator } = await import('../../src/knowledge/validator.js');
      const validator = new KnowledgeBaseValidator(projectDir);
      const result = validator.validateAll();

      // 3. 验证结果
      expect(result.valid).toBe(true);
      expect(result.stats.chapterTypes).toBe(1);
      expect(result.stats.outlineTemplates).toBe(1);
      expect(result.stats.requirementCategories).toBe(1);
    });
  });
});
