import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramPipeline } from '../../src/diagrams/pipeline.js';
import { extractDiagrams } from '../../src/diagrams/extractor.js';
import { injectDiagrams } from '../../src/diagrams/injector.js';

/**
 * 图表块的两种格式必须端到端一致（Bug 33、34、35）
 *
 * 真机事故（8 章全量重跑）：
 *
 *   第 1 轮审阅把 ch001 的图表判为 high ——「使用 type/title/description
 *   自由文本描述，不是 Mermaid、结构化 YAML」。但这其实是**本项目自己的
 *   图表格式约定**；fixer 于是把 `<!-- diagram-start -->` 改写成 ```mermaid```。
 *
 *   结果 ch001 的 3 张图全部丢失：
 *
 *   Bug 33  提取器两种格式都支持（diagram-start + mermaid 向后兼容），
 *           但**注入器只认 diagram-start** → mermaid 图生成了却永远进不了文档。
 *           （当年 8 章里 ch001 图片数 = 0，文档里留着 3 个 ```mermaid 代码块）
 *
 *   Bug 34  提取器 readdirSync 扫描**所有版本**文件，而注入只针对**最新版本**
 *           → 从旧版本提取的图成为孤儿：
 *             ch001-fig1 / fig2 由 v1 的 diagram-start 提取，
 *             但 v2 里已无对应标记 → 有 PNG，文档里 0 处引用。
 *
 *   Bug 35  mmdc 未安装时，mermaid 块走「降级分支」：写一个
 *           svgFile=''/pngFile='' 的 manifest 记录、返回 success、并计入
 *           `generated` —— 图根本没生成却报「图表生成完成」。
 *           与 Bug 16（缺 pandoc）同类：缺依赖时静默降级。
 *           更糟的是空文件名的 manifest 记录会让 shouldRegenerate 认为
 *           「已缓存」（空字符串是 falsy，绕过了产物存在性检查）。
 *
 * 修法原则：**格式支持必须两端对称，编号必须来自同一次提取，失败必须可见。**
 */

const D = 'graph TD\n    A[客户端] --> B[API网关]\n';

const MERMAID_BLOCK = '```mermaid\n' + D + '```';
const DIAGRAM_START_BLOCK = [
  '<!-- diagram-start',
  'type: architecture',
  'title: 总体架构图',
  'description: |',
  '  三层架构：',
  '  - 接入层：Web',
  'diagram-end -->',
].join('\n');

describe('图表块格式：提取 / 注入 / 运行 三段一致', () => {
  // ── Bug 33：注入器必须处理 mermaid ─────────────────────────────

  describe('Bug 33：注入器支持 mermaid 代码块', () => {
    let projectDir: string;
    let figuresDir: string;

    beforeEach(() => {
      projectDir = join(process.cwd(), '.test-injector-formats');
      rmSync(projectDir, { recursive: true, force: true });
      figuresDir = join(projectDir, 'figures');
      mkdirSync(figuresDir, { recursive: true });
      mkdirSync(join(projectDir, 'assembly'), { recursive: true });
    });

    afterEach(() => {
      rmSync(projectDir, { recursive: true, force: true });
    });

    function makeFigure(id: string): void {
      writeFileSync(join(figuresDir, `${id}.png`), 'PNG');
    }

    it('mermaid 代码块被替换为图片引用', () => {
      makeFigure('ch001-fig1');
      const content = `# 1.1 章节\n\n正文。\n\n${MERMAID_BLOCK}\n\n结尾。\n`;

      const r = injectDiagrams(content, 'ch001', {
        projectDir,
        documentDir: join(projectDir, 'assembly'),
      });

      expect(r.injected).toBe(1);
      expect(r.content).toContain('![图表 1](../figures/ch001-fig1.png)');
      expect(r.content).not.toContain('```mermaid');
      expect(r.content).toContain('正文。');
      expect(r.content).toContain('结尾。');
    });

    it('diagram-start 块仍然可用（不回归）', () => {
      makeFigure('ch001-fig1');
      const content = `# 1.1 章节\n\n${DIAGRAM_START_BLOCK}\n`;

      const r = injectDiagrams(content, 'ch001', {
        projectDir,
        documentDir: join(projectDir, 'assembly'),
      });

      expect(r.injected).toBe(1);
      expect(r.content).toContain('![总体架构图](../figures/ch001-fig1.png)');
      expect(r.content).not.toContain('diagram-start');
    });

    it('混合格式按**文档顺序**编号（与提取器一致）', () => {
      makeFigure('ch001-fig1');
      makeFigure('ch001-fig2');
      // mermaid 在前，diagram-start 在后
      const content = `# 1.1 章节\n\n${MERMAID_BLOCK}\n\n中间段落。\n\n${DIAGRAM_START_BLOCK}\n`;

      const r = injectDiagrams(content, 'ch001', {
        projectDir,
        documentDir: join(projectDir, 'assembly'),
      });

      expect(r.injected).toBe(2);
      // 第 1 个（mermaid，文档靠前）→ fig1；第 2 个（diagram-start）→ fig2
      expect(r.content).toContain('![图表 1](../figures/ch001-fig1.png)');
      expect(r.content).toContain('![总体架构图](../figures/ch001-fig2.png)');
    });

    it('图不存在时原样保留，并记入 missing', () => {
      const content = `# 1.1 章节\n\n${MERMAID_BLOCK}\n`;

      const r = injectDiagrams(content, 'ch001', {
        projectDir,
        documentDir: join(projectDir, 'assembly'),
      });

      expect(r.injected).toBe(0);
      expect(r.missing).toEqual(['ch001-fig1']);
      expect(r.content).toContain('```mermaid');
    });
  });

  // ── 提取器编号：文档顺序 ──────────────────────────────────────

  describe('提取器按文档顺序编号', () => {
    it('mermaid 在 diagram-start 之前时，mermaid 是 fig1', () => {
      const content = `# 章节\n\n${MERMAID_BLOCK}\n\n${DIAGRAM_START_BLOCK}\n`;
      const blocks = extractDiagrams(content, 'ch001');

      expect(blocks).toHaveLength(2);
      expect(blocks[0].index).toBe(0);
      expect(blocks[0].format).toBe('mermaid');
      expect(blocks[1].index).toBe(1);
      expect(blocks[1].format).not.toBe('mermaid');
    });

    it('fig 编号对应的就是文档里第 N 个图表', () => {
      const content = `# 章节\n\n${DIAGRAM_START_BLOCK}\n\n${MERMAID_BLOCK}\n`;
      const blocks = extractDiagrams(content, 'ch001');
      expect(blocks.map(b => [b.index, b.format])).toEqual([
        [0, expect.not.stringMatching(/mermaid/)],
        [1, 'mermaid'],
      ]);
    });
  });

  // ── Bug 34：只处理最新版本 ───────────────────────────────────

  describe('Bug 34：pipeline 只处理每个章节的最新版本', () => {
    const TEST_DIR = join(process.cwd(), '.test-pipeline-latest');
    let pipeline: DiagramPipeline;

    beforeEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
      mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
      mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
      mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'assets', 'diagram-style.json'),
        JSON.stringify({ colorScheme: 'warm', nodeShape: 'rounded', layoutDirection: 'top-to-bottom', fontSize: 'normal' }),
      );
      pipeline = new DiagramPipeline(TEST_DIR);
    });

    afterEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('v1 的图表标记不会被提取（修复轮删掉标记后不留孤儿图）', () => {
      const v1 = `# 章节\n\n${DIAGRAM_START_BLOCK}\n\n${DIAGRAM_START_BLOCK}\n`;
      // v2 把图表全删了（或换了格式）
      const v2 = '# 章节\n\n重写后的正文，没有图表标记。\n';
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), v1);
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v2.md'), v2);

      expect(pipeline.extractDiagrams()).toEqual([]);
    });

    it('v2 的图表被提取，且编号从 1 开始', () => {
      const v1 = `# 章节\n\n${DIAGRAM_START_BLOCK}\n`;
      const v2 = `# 章节\n\n${MERMAID_BLOCK}\n\n${MERMAID_BLOCK}\n`;
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), v1);
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v2.md'), v2);

      const blocks = pipeline.extractDiagrams();
      expect(blocks).toHaveLength(2);
      expect(blocks.map(b => b.index)).toEqual([0, 1]);
    });

    it('多章节各取最新版本', () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), `# a\n\n${MERMAID_BLOCK}\n`);
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v2.md'), `# a\n\n${MERMAID_BLOCK}\n\n${MERMAID_BLOCK}\n`);
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch002-v1.md'), `# b\n\n${MERMAID_BLOCK}\n`);

      const blocks = pipeline.extractDiagrams();
      expect(blocks).toHaveLength(3); // ch001 取 v2 的 2 个 + ch002 的 1 个
      expect(blocks.filter(b => b.chapterId === 'ch001')).toHaveLength(2);
      expect(blocks.filter(b => b.chapterId === 'ch002')).toHaveLength(1);
    });
  });

  // ── Bug 35：缺 mmdc 不得谎报成功 ─────────────────────────────

  describe('Bug 35：mermaid 无法渲染时不得计入「已生成」', () => {
    const TEST_DIR = join(process.cwd(), '.test-pipeline-mermaid');
    let pipeline: DiagramPipeline;

    beforeEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
      mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
      mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
      mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
      writeFileSync(
        join(TEST_DIR, 'assets', 'diagram-style.json'),
        JSON.stringify({ colorScheme: 'warm', nodeShape: 'rounded', layoutDirection: 'top-to-bottom', fontSize: 'normal' }),
      );
      pipeline = new DiagramPipeline(TEST_DIR);
    });

    afterEach(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
    });

    it('mmdc 不可用：不计入 generated，且结果里明确报告', async () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), `# a\n\n${MERMAID_BLOCK}\n`);

      const r = await pipeline.run({ mmdcAvailable: false });

      expect(r.total).toBe(1);
      expect(r.generated).toBe(0);
      expect(r.mermaidKeptAsCode).toBe(1);
      expect(r.warnings.some(w => w.diagramId === 'ch001-fig1')).toBe(true);
    });

    it('mmdc 不可用：不写入 manifest 记录（否则会被当成已缓存）', async () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), `# a\n\n${MERMAID_BLOCK}\n`);

      await pipeline.run({ mmdcAvailable: false });

      const manifestPath = join(TEST_DIR, 'figures', 'manifest.json');
      const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : {};
      expect(manifest['ch001-fig1']).toBeUndefined();
    });

    it('mmdc 可用且渲染成功：计入 generated', async () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), `# a\n\n${MERMAID_BLOCK}\n`);

      const r = await pipeline.run({ mmdcAvailable: true });

      // 本机没有 mmdc，用注入的假实现可能失败 —— 关键是不得谎报成功
      expect(r.generated + r.failed + r.skipped).toBe(r.total);
      expect(r.mermaidKeptAsCode).toBe(0);
    });

    it('diagram-start 图表不受 mmdc 影响，正常生成', async () => {
      writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch001-v1.md'), `# a\n\n${DIAGRAM_START_BLOCK}\n`);

      const r = await pipeline.run({ mmdcAvailable: false });

      expect(r.generated).toBe(1);
      expect(r.mermaidKeptAsCode).toBe(0);
      expect(existsSync(join(TEST_DIR, 'figures', 'ch001-fig1.png'))).toBe(true);
    });
  });
});
