import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-init-chapter-types-test-'));
}

describe('init command - chapter types', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('应该在初始化时创建knowledge/chapter-types目录', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const chapterTypesDir = join(result.projectDir, 'knowledge', 'chapter-types');
    expect(existsSync(chapterTypesDir)).toBe(true);
  });

  it('应该复制7种默认章节类型文件', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const chapterTypesDir = join(result.projectDir, 'knowledge', 'chapter-types');
    const files = readdirSync(chapterTypesDir);
    
    // 检查默认类型文件
    expect(files).toContain('overview.md');
    expect(files).toContain('requirements.md');
    expect(files).toContain('architecture.md');
    expect(files).toContain('functional.md');
    expect(files).toContain('implementation.md');
    expect(files).toContain('support.md');
    expect(files).toContain('appendix.md');
  });

  it('应该创建custom目录并预置3个扩展类型', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const customDir = join(result.projectDir, 'knowledge', 'chapter-types', 'custom');
    expect(existsSync(customDir)).toBe(true);

    const customFiles = readdirSync(customDir);
    expect(customFiles).toContain('security.md');
    expect(customFiles).toContain('testing.md');
    expect(customFiles).toContain('deployment.md');
  });

  it('默认章节类型文件应该包含正确的frontmatter', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const overviewPath = join(result.projectDir, 'knowledge', 'chapter-types', 'overview.md');
    const content = readFileSync(overviewPath, 'utf-8');
    
    // 检查frontmatter格式
    expect(content).toContain('---');
    expect(content).toContain('name: 概述章');
    expect(content).toContain('wordBudget:');
    expect(content).toContain('min: 5000');
    expect(content).toContain('max: 8000');
    expect(content).toContain('importance: 3');
    expect(content).toContain('writingStyle: overview');
  });

  it('章节类型文件应该包含写作指南内容', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const overviewPath = join(result.projectDir, 'knowledge', 'chapter-types', 'overview.md');
    const content = readFileSync(overviewPath, 'utf-8');
    
    // 检查是否包含写作指南
    expect(content).toContain('# 概述章写作指南');
    expect(content).toContain('内容要求');
  });

  it('应该为每个章节类型生成合适的字数预算', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const chapterTypesDir = join(result.projectDir, 'knowledge', 'chapter-types');
    
    // Bug 41 修复：所有章节类型统一使用 5200-7800 字数预算
    const overviewContent = readFileSync(join(chapterTypesDir, 'overview.md'), 'utf-8');
    expect(overviewContent).toContain('min: 5000');
    expect(overviewContent).toContain('max: 8000');

    const requirementsContent = readFileSync(join(chapterTypesDir, 'requirements.md'), 'utf-8');
    expect(requirementsContent).toContain('min: 5200');
    expect(requirementsContent).toContain('max: 7800');

    const architectureContent = readFileSync(join(chapterTypesDir, 'architecture.md'), 'utf-8');
    expect(architectureContent).toContain('min: 5200');
    expect(architectureContent).toContain('max: 7800');
  });
});
