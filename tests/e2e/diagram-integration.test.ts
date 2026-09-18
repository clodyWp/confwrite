/**
 * Integration tests for diagram workflow
 * 
 * 测试 P4→P5 的完整集成：
 * - Writer prompt 使用 diagram-start 格式
 * - Reviewer prompt 注入知识库
 * - Phase 2 waitPoint 显示风格确认
 * - Init 生成默认风格文件
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskExecutor } from '../../src/writing/task-executor.js';
import { initProject } from '../../src/commands/init.js';
import { loadDiagramStyle } from '../../src/diagrams/style.js';
import { phases } from '../../src/orchestrator/phases.js';
import { ProjectStore } from '../../src/state/store.js';
import type { Task } from '../../src/scheduler/types.js';

const TEST_ROOT = join(tmpdir(), 'confwrite-diagram-integration');

function setup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
}

describe('Diagram Workflow Integration', () => {
  beforeEach(setup);
  afterEach(cleanup);

  describe('Writer prompt', () => {
    it('instructs to use diagram-start format instead of mermaid', () => {
      const executor = new TaskExecutor();
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const prompt = executor.generateWriterPrompt(task, '# 素材包\n测试内容', 1);

      // 应该包含 diagram-start 格式说明
      expect(prompt).toContain('diagram-start');
      expect(prompt).toContain('diagram-end');

      // 应该禁止 mermaid 代码块
      expect(prompt).toContain('严禁使用 mermaid');
    });

    it('includes diagram type options', () => {
      const executor = new TaskExecutor();
      const task: Task = {
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const prompt = executor.generateWriterPrompt(task, '# 素材包', 1);

      // 应该包含图表类型选项
      expect(prompt).toContain('architecture');
      expect(prompt).toContain('flow');
    });
  });

  describe('Init generates default style', () => {
    it('creates diagram-style.json with defaults', () => {
      const result = initProject({
        slug: 'test-style',
        workspaceDir: TEST_ROOT,
      });

      expect(result.success).toBe(true);

      // 检查风格文件存在
      const stylePath = join(result.projectDir, 'assets', 'diagram-style.json');
      expect(existsSync(stylePath)).toBe(true);

      // 检查默认值
      const style = loadDiagramStyle(result.projectDir);
      expect(style.colorScheme).toBe('warm');
      expect(style.nodeShape).toBe('rounded');
      expect(style.layoutDirection).toBe('top-to-bottom');
      expect(style.fontSize).toBe('normal');
    });
  });

  describe('Phase 2 waitPoint', () => {
    it('includes style confirmation in instructions', () => {
      const phase2 = phases.get('2')!;

      expect(phase2.waitPoint).toBeDefined();
      expect(phase2.waitPoint!.instructions).toContain('diagram-style.json');
      expect(phase2.waitPoint!.instructions).toContain('配色方案');
    });
  });

  describe('Reviewer knowledge injection', () => {
    it('includes diagram quality checks when knowledge is provided', () => {
      const executor = new TaskExecutor();
      const task: Task = {
        id: 'review-ch001-r1',
        type: 'reviewer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      };

      const knowledgeContent = `## 图表布局检查标准
- 信息块 > 5 时，是否分组了？
- 连线数 / 模块数 ≤ 1.5？`;

      const prompt = executor.generateReviewerPrompt(
        task,
        '# 章节内容\n测试',
        { metrics: {}, technicalTerms: [], requirements: [] },
        1,
        knowledgeContent
      );

      // 应该包含知识库内容
      expect(prompt).toContain('图表布局检查标准');
      expect(prompt).toContain('信息块 > 5');
    });
  });
});
