import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportDocument } from '../../src/commands/export.js';

/**
 * docx 导出的图片嵌入（Bug 26）
 *
 * 实测事故：导出报 success: true，但日志里 29 张图全是
 *   [WARNING] Could not fetch resource ../figures/ch012-fig2.png:
 *   replacing image with description
 * 产出的 docx 只有 552 KB（手动测试嵌入全部图片时为 1.47 MB）。
 *
 * 根因：pandoc 解析相对图片路径时基于**进程 cwd**，
 * 而 exportWithPandoc 调用 execFileSync 时未设置 cwd，
 * 于是 `../figures/x.png` 相对调用方 cwd 解析 → 找不到。
 *
 * （文档写在 output/final.tmp.md，图片在 <project>/figures/，
 *   正确的基准应是临时文件所在目录 output/。）
 */

function has(cmd: string, args: string[] = ['--version']): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const PANDOC = has('pandoc');
const UNZIP = has('unzip', ['-v']);

describe.skipIf(!PANDOC || !UNZIP)('docx 导出嵌入图片（Bug 26）', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-docx-'));
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }

    // 一张真实的小 PNG（1x1 像素）
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(projectDir, 'figures', 'ch001-fig1.png'), png);

    // 章节里引用相对路径的图片（组装后文档位于 output/，故为 ../figures/）
    writeFileSync(
      join(projectDir, 'drafts', 'chapters', 'ch001-v1.md'),
      ['# 1.1 测试章节', '', '正文。', '', '![示意图](../figures/ch001-fig1.png)', '', '结尾。'].join('\n'),
    );
    writeFileSync(join(projectDir, 'outline.md'), '# 测试文档\n\n## 1.\nch001 1.1 测试章节\n');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('图片被真正嵌入 docx（word/media 非空）', async () => {
    const docxPath = join(projectDir, 'output', 'final.docx');
    const r = await exportDocument(projectDir, { format: 'docx', outputPath: docxPath, toc: true });

    expect(r.success).toBe(true);
    expect(existsSync(docxPath)).toBe(true);

    const listing = execFileSync('unzip', ['-l', docxPath], { encoding: 'utf-8' });
    const media = listing.split('\n').filter(l => l.includes('word/media/'));
    expect(media.length).toBeGreaterThanOrEqual(1);
  });

  it('不产生「Could not fetch resource」警告', async () => {
    const docxPath = join(projectDir, 'output', 'final.docx');
    // 捕获 pandoc 的 stderr（exportWithPandoc 用 stdio: 'inherit'，
    // 这里通过 spy 无法拦截，改为直接检查产物是否含图片）
    const r = await exportDocument(projectDir, { format: 'docx', outputPath: docxPath, toc: true });
    expect(r.success).toBe(true);

    const listing = execFileSync('unzip', ['-l', docxPath], { encoding: 'utf-8' });
    expect(listing).toContain('word/media/');
  });

  it('未显式传 title 时自动从 outline.md 解析（Bug 27）', async () => {
    // 实测事故：phase8 调用 exportDocument 未传 title，
    // 导致导出结果缺文档标题、章节标题未降级（Heading1 × 16）
    const docxPath = join(projectDir, 'output', 'final.docx');
    const r = await exportDocument(projectDir, { format: 'docx', outputPath: docxPath, toc: true });
    expect(r.success).toBe(true);

    const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf-8' });
    // 文档标题应出现（outline.md 的一级标题）
    expect(xml).toContain('测试文档');
  });

  it('导出产物中一级标题唯一（章节已降为二级）', async () => {
    const docxPath = join(projectDir, 'output', 'final.docx');
    await exportDocument(projectDir, { format: 'docx', outputPath: docxPath, toc: true });

    const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf-8' });
    const h1 = (xml.match(/w:val="Heading1"/g) || []).length;
    // 仅文档标题为 Heading1（目录与章节均降为 Heading2）
    expect(h1).toBe(1);
  });
});
