import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChapterAssembler } from '../../src/assemble/assembler.js';

/**
 * 组装产物的结构与 pandoc 兼容性（Bug 23、24、25）
 *
 * 实测事故：用真实产物直接跑 pandoc 导出 docx 直接失败：
 *   Error parsing YAML metadata at ".../merged-v1.md" (line 1127):
 *   YAML parse exception: did not find expected <document start>
 *
 * Bug 25 — 章节分隔符 `---` 紧跟章节标题（无空行），被 pandoc 当成
 *          YAML 元数据块起始 → 整个导出失败（退出码 64）
 * Bug 23 — TOC 链接指向 #ch001，但文档里没有任何该 id 的锚点 → 链接失效
 * Bug 24 — 标题层级扁平：文档标题、目录、15 个章节标题同为 h1
 *          （实测 docx 里 Heading1 有 17 个）
 */

const CHAPTER = [
  '# 1.1 项目理解与需求分析',
  '',
  '## 概述',
  '',
  '正文段落。',
  '',
  '```python',
  '# 这是代码注释，不是标题',
  'print("hi")',
  '```',
  '',
  '## 小结',
  '',
  '结尾。',
].join('\n');

describe('组装产物结构（Bug 23、24、25）', () => {
  /** 提取围栏之外的指定层级标题（代码块里的 `# 注释` 不是标题） */
  function headingsOutsideFences(content: string, level: number): string[] {
    const out: string[] = [];
    let inFence = false;
    const prefix = '#'.repeat(level) + ' ';
    for (const line of content.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (line.startsWith(prefix) && !line.startsWith(prefix + '#')) {
        out.push(line.slice(prefix.length).trim());
      }
    }
    return out;
  }

  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'confwrite-struct-'));
    mkdirSync(join(dir, 'drafts', 'chapters'), { recursive: true });
    writeFileSync(join(dir, 'drafts', 'chapters', 'ch001-v1.md'), CHAPTER);
    writeFileSync(join(dir, 'drafts', 'chapters', 'ch002-v1.md'), CHAPTER.replace('1.1', '1.2'));
    writeFileSync(join(dir, 'outline.md'), '# 投标技术方案\n\n## 1.\nch001 1.1\nch002 1.2\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const assemble = (opts: Record<string, unknown> = {}) =>
    new ChapterAssembler().assemble(dir, ['ch001', 'ch002'], {
      title: '投标技术方案',
      generateTOC: true,
      ...opts,
    });

  describe('Bug 25：pandoc 兼容的分隔符', () => {
    it('不得出现「--- 紧跟非空行」的模式（会被当成 YAML 元数据块）', () => {
      const r = assemble();
      expect(r.content).not.toMatch(/^---\s*\n\S/m);
    });

    it('章节之间仍有可见分隔', () => {
      const r = assemble();
      // 使用 *** 主题分隔线（pandoc 不会误判）
      expect(r.content).toContain('***');
    });

    it('文档开头的 --- 不会被误用（没有裸 --- 行后接标题）', () => {
      const r = assemble();
      const lines = r.content.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].trim() === '---' && lines[i + 1].trim() !== '') {
          throw new Error(`第 ${i + 1} 行是裸 --- 且下一行非空：${lines[i + 1]}`);
        }
      }
      expect(true).toBe(true);
    });
  });

  describe('Bug 23：TOC 锚点', () => {
    it('每个章节标题带上与 TOC 链接一致的 id', () => {
      const r = assemble();
      expect(r.content).toContain('{#ch001}');
      expect(r.content).toContain('{#ch002}');
    });

    it('TOC 链接的锚点在文档中确实存在', () => {
      const r = assemble();
      const links = [...r.content.matchAll(/^- \[[^\]]*\]\(#([^)]+)\)/gm)].map(m => m[1]);
      expect(links.length).toBe(2);
      for (const id of links) {
        expect(r.content).toContain(`{#${id}}`);
      }
    });
  });

  describe('Bug 24：标题层级', () => {
    it('有文档标题时，TOC 标题降为 h2', () => {
      const r = assemble();
      expect(r.content).toMatch(/^## 目录$/m);
    });

    it('有文档标题时，章节标题降为 h2（原为 h1）', () => {
      const r = assemble();
      expect(r.content).toMatch(/^## 1\.1 项目理解与需求分析/m);
      expect(r.content).toMatch(/^## 1\.2 项目理解与需求分析/m);
    });

    it('章节内部小节相应降为 h3', () => {
      const r = assemble();
      expect(r.content).toMatch(/^### 概述$/m);
      expect(r.content).toMatch(/^### 小结$/m);
    });

    it('文档标题保持 h1（唯一的一级标题）', () => {
      const r = assemble();
      const h1 = headingsOutsideFences(r.content, 1);
      expect(h1).toHaveLength(1);
      expect(h1[0]).toBe('投标技术方案');
    });

    it('代码块内的 # 注释不得被当作标题改动', () => {
      const r = assemble();
      expect(r.content).toContain('# 这是代码注释，不是标题');
      expect(r.content).not.toContain('## 这是代码注释');
    });

    it('未提供文档标题时保持原层级（不降级）', () => {
      const r = assemble({ title: undefined });
      expect(r.content).toMatch(/^# 1\.1 项目理解与需求分析/m);
      expect(r.content).toMatch(/^## 概述$/m);
    });
  });
});
