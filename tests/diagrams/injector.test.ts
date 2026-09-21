import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { injectDiagrams } from '../../src/diagrams/injector.js';

/**
 * 图表注入（Bug 12）
 *
 * 实测事故：LmERP2 生成了 29 张图，但最终文档里 **0 张图**：
 *
 *   merged-v1.md 引用 figures/ :  0
 *   final.md     引用 figures/ :  0
 *   文档里仍保留 29 组 <!-- diagram-start ... --> 原始注释
 *
 * 整条链缺了「标记 → 图片引用」这一步：
 *   writer 写标记 ✓ → extractor 提取 ✓ → pipeline 生成 png ✓
 *   → 替换标记为 ![](figures/xxx.png) ✗ 从来没有实现
 *
 * （src/diagrams/path-adjuster.ts 的文件头写着「方案 B：在组装/定稿阶段
 *   集中替换」，但该模块从未被任何生产代码调用，且它只调整已存在引用的路径，
 *   不会创建引用。）
 */

const CHAPTER_ID = 'ch001';

const CONTENT = [
  '# 1.1 项目理解',
  '',
  '正文段落。',
  '',
  '<!-- diagram-start',
  'type: architecture',
  'title: 总体架构图',
  'description: |',
  '  三层架构：',
  '  - 接入层：Web',
  '  - 服务层：API',
  'diagram-end -->',
  '',
  '中间段落。',
  '',
  '<!-- diagram-start',
  'type: flow',
  'title: 审批流程',
  'description: |',
  '  - 提交 → 审批 → 归档',
  'diagram-end -->',
  '',
  '结尾段落。',
].join('\n');

describe('injectDiagrams（Bug 12）', () => {
  let projectDir: string;
  let documentDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-inject-'));
    documentDir = join(projectDir, 'assembly');
    mkdirSync(join(projectDir, 'figures'), { recursive: true });
    mkdirSync(documentDir, { recursive: true });
    // 两张图都存在
    writeFileSync(join(projectDir, 'figures', `${CHAPTER_ID}-fig1.png`), 'png');
    writeFileSync(join(projectDir, 'figures', `${CHAPTER_ID}-fig2.png`), 'png');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  const opts = () => ({ projectDir, documentDir, format: 'png' as const });

  it('把 diagram 标记替换为 markdown 图片引用', () => {
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    expect(r.content).toContain('![总体架构图]');
    expect(r.content).toContain('![审批流程]');
    expect(r.injected).toBe(2);
  });

  it('替换后不再残留 diagram-start / diagram-end 标记', () => {
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    expect(r.content).not.toContain('diagram-start');
    expect(r.content).not.toContain('diagram-end');
  });

  it('图片路径是相对组装目录的正确路径', () => {
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    expect(r.content).toContain('../figures/ch001-fig1.png');
    expect(r.content).toContain('../figures/ch001-fig2.png');
  });

  it('保留正文内容，只替换标记', () => {
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    expect(r.content).toContain('# 1.1 项目理解');
    expect(r.content).toContain('中间段落。');
    expect(r.content).toContain('结尾段落。');
  });

  it('图片文件缺失时保留原标记并报告', () => {
    rmSync(join(projectDir, 'figures', `${CHAPTER_ID}-fig2.png`));
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    expect(r.injected).toBe(1);
    expect(r.missing).toContain(`${CHAPTER_ID}-fig2`);
    // 缺图的那块保持原样，另一块已替换
    expect(r.content).toContain('![总体架构图]');
    expect(r.content).toContain('diagram-start');
  });

  it('没有图表标记时内容不变', () => {
    const plain = '# 标题\n\n正文。';
    const r = injectDiagrams(plain, CHAPTER_ID, opts());
    expect(r.content).toBe(plain);
    expect(r.injected).toBe(0);
  });

  it('支持 svg 格式', () => {
    writeFileSync(join(projectDir, 'figures', `${CHAPTER_ID}-fig1.svg`), '<svg/>');
    writeFileSync(join(projectDir, 'figures', `${CHAPTER_ID}-fig2.svg`), '<svg/>');
    const r = injectDiagrams(CONTENT, CHAPTER_ID, { ...opts(), format: 'svg' });
    expect(r.content).toContain('.svg');
    expect(r.injected).toBe(2);
  });

  it('多个图表按顺序对应 fig1、fig2', () => {
    const r = injectDiagrams(CONTENT, CHAPTER_ID, opts());
    const i1 = r.content.indexOf('fig1');
    const i2 = r.content.indexOf('fig2');
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
  });

  it('标题含特殊字符时仍生成合法图片语法', () => {
    const special = [
      '<!-- diagram-start',
      'type: architecture',
      'title: A & B <测试>',
      'description: |',
      '  - x',
      'diagram-end -->',
    ].join('\n');
    const r = injectDiagrams(special, CHAPTER_ID, opts());
    expect(r.content).toMatch(/^!\[.*\]\(.*\)$/m);
    expect(r.content).not.toContain('<测试>');
  });
});
