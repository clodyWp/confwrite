/**
 * Diagram Pipeline
 * 
 * 完整的图表生成管线：提取 → 解析 → SVG → PNG → 验证。
 * 整合所有基础模块，提供统一的入口。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { extractDiagrams, type DiagramBlock } from './extractor.js';
import { convertToPng } from './png-converter.js';
import { layoutDiagram } from './layout/index.js';
import { validateDiagram, type DiagramData } from './validator.js';
import { DiagramCache, type CacheEntry } from './cache.js';
import { loadDiagramStyle, type DiagramStyle } from './style.js';
import {
  hasStructuredFormat,
  parseStructuredDiagram,
  proseToSpec,
  type DiagramSpec,
} from './structured-parser.js';
import {
  parseDiagramDescription,
  type ParsedNode,
  type ParsedConnection,
} from './description-parser.js';

/**
 * 管线选项
 */
export interface PipelineOptions {
  /** 是否跳过验证 */
  skipValidation?: boolean;
  /** 是否跳过 PNG 转换 */
  skipPng?: boolean;
}

/**
 * 管线结果
 */
export interface PipelineResult {
  /** 总图表数 */
  total: number;
  /** 新生成的数量 */
  generated: number;
  /** 跳过（缓存命中）的数量 */
  skipped: number;
  /** 失败的数量 */
  failed: number;
  /**
   * 格式不受支持、无法渲染的图表数量（当前 = mermaid 块）
   *
   * 这些图**没有生成**，不能计入 generated。项目已废弃 mermaid，
   * 只支持结构化格式（containers / nodes / edges）。如实计数是为了
   * 让写手/fixer 知道该改哪里，而不是静默少一张图（Bug 35 的教训）。
   */
  unsupportedFormat: number;
  /** 错误列表 */
  errors: Array<{ diagramId: string; error: string }>;
  /** 验证警告 */
  warnings: Array<{ diagramId: string; warnings: string[] }>;
}

/**
 * 图表管线
 */
export class DiagramPipeline {
  private projectDir: string;
  private cache: DiagramCache;
  private style: DiagramStyle;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.cache = new DiagramCache(projectDir);
    this.style = loadDiagramStyle(projectDir);
  }

  /**
   * 从章节文件中提取所有图表
   */
  extractDiagrams(): DiagramBlock[] {
    const chaptersDir = join(this.projectDir, 'drafts', 'chapters');
    if (!existsSync(chaptersDir)) {
      return [];
    }

    // 每章只取**最新版本**（Bug 34）
    //
    // 原实现 readdirSync 扫描所有 chXXX-v*.md。而注入只针对最新版本
    // （dispatcher.readChapterDraft / assembler 都取最高版本号）——
    // 于是从旧版本提取出来的图永远注入不了，成为孤儿。真机事故里
    // ch001-fig1/fig2 由 v1 的 diagram-start 提取，但 v2 已改成 mermaid，
    // 文档里 0 处引用，22 张图只注入了 20 张。
    //
    // 旧版本还可能与新版本争夺同一个 diagramId（同章同序号），
    // 结果是「内容来自 v1、位置在 v2」，更难排查。
    const latestByChapter = new Map<string, { file: string; version: number }>();
    for (const file of readdirSync(chaptersDir)) {
      if (!file.endsWith('.md')) continue;
      const chapterId = this.extractChapterId(file);
      const m = file.match(/-v(\d+)\.md$/);
      const version = m ? parseInt(m[1], 10) : 0; // 无版本号视为 v0（向后兼容）

      const current = latestByChapter.get(chapterId);
      if (!current || version > current.version) {
        latestByChapter.set(chapterId, { file, version });
      }
    }

    const allBlocks: DiagramBlock[] = [];
    for (const [chapterId, { file }] of latestByChapter) {
      const content = readFileSync(join(chaptersDir, file), 'utf-8');
      allBlocks.push(...extractDiagrams(content, chapterId));
    }

    return allBlocks;
  }

  /**
   * 运行完整管线
   */
  async run(options: PipelineOptions = {}): Promise<PipelineResult> {
    const result: PipelineResult = {
      total: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      unsupportedFormat: 0,
      errors: [],
      warnings: [],
    };

    // 1. 提取图表
    const blocks = this.extractDiagrams();
    result.total = blocks.length;

    if (blocks.length === 0) {
      return result;
    }

    // 确保输出目录存在
    const figuresDir = join(this.projectDir, 'figures');
    if (!existsSync(figuresDir)) {
      mkdirSync(figuresDir, { recursive: true });
    }

    // 2. 处理每个图表
    for (const block of blocks) {
      const diagramId = `${block.chapterId}-fig${block.index + 1}`;

      try {
        // 检查缓存
        if (!this.cache.shouldRegenerate(diagramId, block.rawContent)) {
          result.skipped++;
          continue;
        }

        // mermaid 已废弃：不渲染，但**明确报错**而不是静默跳过。
        //
        // 项目已统一到结构化格式（containers / nodes / edges）。写手提示词和
        // 知识注入都写着「严禁 mermaid」，如果这里静默少一张图，就会出现
        // 「文档里没有图，也没人知道为什么」——Bug 33/35 都是这么来的。
        if (block.format === 'mermaid') {
          result.unsupportedFormat++;
          result.errors.push({
            diagramId,
            error:
              '图表使用了 mermaid 代码块，已废弃不再渲染。' +
              '请改写为 diagram-start 结构化格式（containers / nodes / edges）',
          });
          continue;
        }


        // 解析为节点与连接
        //
        // **结构化格式优先**：写手实际产出的就是 containers / nodes / edges，
        // 里面带着 owner / timing / high_weight / direction / style。
        // 只读散文 description 会把这些全丢掉，图退化成「散文里的几个方框」
        // —— 而知识库 layout.md 的 7 条布局原则，每条都有对应的结构化字段。
        //
        // 散文格式（提示词里教的写法）仍然支持，作为回退。
        const structured = hasStructuredFormat(block.rawContent)
          ? parseStructuredDiagram(block.rawContent)
          : null;

        // 结构化格式优先；散文作为回退，适配成同一个 DiagramSpec
        let spec: DiagramSpec;
        if (structured && structured.nodes.length > 0) {
          spec = structured;
        } else {
          const prose = parseDiagramDescription({
            description: block.description,
            title: block.title,
          });
          spec = proseToSpec(prose.nodes, prose.connections);
        }

        // 生成 SVG —— 走布局引擎（正交路由 + 压缩到单页可读）
        //
        // 原实现调 generateSVG（旧渲染器）：真实数据上画布最高 4290px、
        // 高宽比 8.0、字号小到 3.3pt，18/23 张超过一页。新引擎实测
        // 最高 727px、高宽比全部 ≤1.5、字号全部可读。
        const layout = layoutDiagram(spec, this.style, block.title);
        const svgResult = { svg: layout.svg, width: layout.width, height: layout.height };
        
        // 传播布局引擎的告警 ✓
        if (layout.warnings.length > 0) {
          result.warnings.push({
            diagramId,
            warnings: layout.warnings,
          });
        }
        const svgPath = join(figuresDir, `${diagramId}.svg`);
        writeFileSync(svgPath, svgResult.svg, 'utf-8');

        // 生成 PNG
        let pngPath: string | undefined;
        if (!options.skipPng) {
          pngPath = join(figuresDir, `${diagramId}.png`);
          await convertToPng(svgPath, pngPath);
        }

        // 验证
        if (!options.skipValidation) {
          const diagramData: DiagramData = {
            id: diagramId,
            nodes: layout.nodes.map(n => ({
              id: n.id,
              label: n.label.join(''),
              layer: n.layer,
              x: n.x,
              y: n.y,
              width: n.w,
              height: n.h,
            })),
            connections: layout.edges.map(e => ({ from: e.from, to: e.to, label: e.label })),
            svgContent: svgResult.svg,
            svgWidth: svgResult.width,
            svgHeight: svgResult.height,
            pngPath,
            type: block.type,
          };

          const validation = validateDiagram(diagramData);
          if (!validation.overallPassed) {
            result.warnings.push({
              diagramId,
              warnings: validation.warnings,
            });
          }
        }

        // 更新缓存
        this.cache.setEntry(diagramId, {
          sourceHash: this.cache.computeHash(block.rawContent),
          svgFile: `${diagramId}.svg`,
          pngFile: `${diagramId}.png`,
          generatedAt: new Date().toISOString(),
        });

        result.generated++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          diagramId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 3. 保存缓存清单
    this.cache.save();

    return result;
  }

  /**
   * 从文件名提取章节 ID
   */
  private extractChapterId(filename: string): string {
    const match = filename.match(/^(ch\d+)/);
    return match ? match[1] : 'unknown';
  }


}
