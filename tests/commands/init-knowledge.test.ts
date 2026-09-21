import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject, resolveKnowledgeDir } from '../../src/commands/init.js';

/**
 * 知识库复制（Bug 14）
 *
 * 实测事故：项目初始化后 `knowledge/` 目录里装的是 **编译产物**
 * （loader.js / loader.d.ts / .map），而不是知识库内容：
 *
 *   init.ts 原实现:
 *     const knowledgeSrc = join(dirname(dirname(import.meta.url)), 'knowledge');
 *     运行时 import.meta.url = .../dist/commands/init.js
 *     → dirname×2 = .../dist/   → 得到 .../dist/knowledge   ✗
 *       而 dist/knowledge 恰好是 tsc 编译 src/knowledge/loader.ts 的产物目录
 *
 *   正确来源是包根目录下的 knowledge/（含 diagrams/ 16 个 .md）
 *
 * 后果链：
 *   knowledge/diagrams/ 不存在
 *   → KnowledgeLoader.loadAll() 直接 return { files: [] }
 *   → writer / reviewer 的 prompt 里都没有图表知识
 *   → 图表描述质量差（标签带 '- ' 列表符号等）
 */

describe('resolveKnowledgeDir（Bug 14）', () => {
  it('dist 布局：dist/commands/init.js → 包根/knowledge', () => {
    const dir = resolveKnowledgeDir('file:///pkg/dist/commands/init.js');
    expect(dir).toBe('/pkg/knowledge');
  });

  it('src 布局：src/commands/init.ts → 包根/knowledge', () => {
    const dir = resolveKnowledgeDir('file:///root/src/commands/init.ts');
    expect(dir).toBe('/root/knowledge');
  });

  it('绝不解析到 dist/ 下面（回归守卫）', () => {
    const dir = resolveKnowledgeDir('file:///pkg/dist/commands/init.js');
    expect(dir).not.toContain('/dist/');
    expect(dir.endsWith('/knowledge')).toBe(true);
  });

  it('正确处理 URL 编码的路径（含空格）', () => {
    const dir = resolveKnowledgeDir('file:///my%20pkg/dist/commands/init.js');
    expect(dir).toBe('/my pkg/knowledge');
  });
});

describe('initProject 复制知识库内容（Bug 14）', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-init-kb-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('创建 knowledge/diagrams/ 并复制 .md 知识文件', () => {
    initProject({ slug: 'kb-test', workspaceDir: tempDir });
    const diagramsDir = join(tempDir, 'projects', 'kb-test', 'knowledge', 'diagrams');

    expect(existsSync(diagramsDir)).toBe(true);
    const mdFiles = readdirSync(diagramsDir).filter(f => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('包含关键的图表规范文件', () => {
    initProject({ slug: 'kb-test2', workspaceDir: tempDir });
    const diagramsDir = join(tempDir, 'projects', 'kb-test2', 'knowledge', 'diagrams');

    for (const f of ['architecture.md', 'architecture-style.md', 'layout.md', 'selection-guide.md']) {
      expect(existsSync(join(diagramsDir, f))).toBe(true);
    }
  });

  it('不再把编译产物当知识库复制', () => {
    initProject({ slug: 'kb-test3', workspaceDir: tempDir });
    const kbDir = join(tempDir, 'projects', 'kb-test3', 'knowledge');
    const entries = readdirSync(kbDir);

    // 修复前这里会出现 loader.js / loader.d.ts / *.map
    expect(entries.filter(f => f.endsWith('.js'))).toHaveLength(0);
    expect(entries.filter(f => f.endsWith('.d.ts'))).toHaveLength(0);
    expect(entries.filter(f => f.endsWith('.map'))).toHaveLength(0);
  });
});
