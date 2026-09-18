import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeLoader } from '../../src/knowledge/loader.js';

describe('KnowledgeLoader', () => {
  let tempDir: string;
  let loader: KnowledgeLoader;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-knowledge-'));
    mkdirSync(join(tempDir, 'knowledge', 'diagrams'), { recursive: true });
    loader = new KnowledgeLoader(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeKnowledge(filename: string, content: string) {
    writeFileSync(join(tempDir, 'knowledge', 'diagrams', filename), content, 'utf-8');
  }

  it('loads all diagram knowledge files', () => {
    writeKnowledge('selection-guide.md', '---\ntitle: 选型指南\n---\n# 选型指南\n\n内容...');
    writeKnowledge('layout.md', '---\ntitle: 布局方法论\n---\n# 布局\n\n7条原则...');
    writeKnowledge('architecture.md', '---\ntitle: 架构图\n---\n# 架构图\n\n规范...');

    const knowledge = loader.loadAll();

    expect(knowledge.files).toHaveLength(3);
    expect(knowledge.files.map(f => f.filename)).toContain('selection-guide.md');
    expect(knowledge.files.map(f => f.filename)).toContain('layout.md');
    expect(knowledge.files.map(f => f.filename)).toContain('architecture.md');
  });

  it('extracts frontmatter metadata', () => {
    writeKnowledge('test.md', '---\ntitle: 测试文档\ntags: [test, demo]\nstatus: active\nupdated: 2026-07-15\n---\n# 内容\n\n正文...');

    const knowledge = loader.loadAll();
    const file = knowledge.files[0];

    expect(file.frontmatter.title).toBe('测试文档');
    expect(file.frontmatter.tags).toEqual(['test', 'demo']);
    expect(file.frontmatter.status).toBe('active');
    expect(file.frontmatter.updated).toBe('2026-07-15');
  });

  it('loads selection guide as entry point', () => {
    writeKnowledge('selection-guide.md', '# 选型指南\n\n图表类型速查...');

    const guide = loader.loadSelectionGuide();

    expect(guide).toBeDefined();
    expect(guide.content).toContain('选型指南');
  });

  it('loads layout principles', () => {
    writeKnowledge('layout.md', '# 布局方法论\n\n七条原则...');

    const layout = loader.loadLayout();

    expect(layout).toBeDefined();
    expect(layout.content).toContain('布局');
  });

  it('loads specific diagram type knowledge', () => {
    writeKnowledge('architecture.md', '# 架构图\n\n视觉表现...');
    writeKnowledge('flowchart.md', '# 流程图\n\n核心元素...');

    const arch = loader.loadDiagramType('architecture');
    const flow = loader.loadDiagramType('flowchart');

    expect(arch.content).toContain('架构图');
    expect(flow.content).toContain('流程图');
  });

  it('returns null for non-existent diagram type', () => {
    const result = loader.loadDiagramType('nonexistent');
    expect(result).toBeNull();
  });

  it('loads knowledge relevant to chapter categories', () => {
    writeKnowledge('selection-guide.md', '# 选型指南');
    writeKnowledge('layout.md', '# 布局');
    writeKnowledge('architecture.md', '# 架构图');
    writeKnowledge('flowchart.md', '# 流程图');
    writeKnowledge('er-diagram.md', '# ER图');

    const relevant = loader.loadRelevantKnowledge(['架构', '系统设计']);

    expect(relevant.selectionGuide).toBeDefined();
    expect(relevant.layout).toBeDefined();
    expect(relevant.diagramTypes).toHaveLength(1);
    expect(relevant.diagramTypes[0].filename).toBe('architecture.md');
  });

  it('loads multiple diagram types for mixed categories', () => {
    writeKnowledge('selection-guide.md', '# 选型指南');
    writeKnowledge('layout.md', '# 布局');
    writeKnowledge('architecture.md', '# 架构图');
    writeKnowledge('flowchart.md', '# 流程图');
    writeKnowledge('er-diagram.md', '# ER图');

    const relevant = loader.loadRelevantKnowledge(['架构', '流程', '数据模型']);

    expect(relevant.diagramTypes).toHaveLength(3);
  });

  it('generates writer injection content', () => {
    writeKnowledge('selection-guide.md', '# 选型指南\n\n图表类型速查...');
    writeKnowledge('layout.md', '# 布局方法论\n\n七条原则...');
    writeKnowledge('architecture.md', '# 架构图\n\n视觉表现...');

    const content = loader.generateWriterInjection(['架构']);

    expect(content).toContain('选型指南');
    expect(content).toContain('布局方法论');
    expect(content).toContain('架构图');
    expect(content).toContain('```mermaid');
  });

  it('returns empty string when no knowledge files exist', () => {
    const content = loader.generateWriterInjection(['架构']);
    expect(content).toBe('');
  });

  it('loads quality lessons', () => {
    writeKnowledge('quality-lessons.md', '# 质量教训\n\n## 2026-07-15 节点过多\n\n问题...');

    const lessons = loader.loadQualityLessons();

    expect(lessons).toBeDefined();
    expect(lessons.content).toContain('质量教训');
  });
});
