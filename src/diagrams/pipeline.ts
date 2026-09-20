/**
 * Diagram Pipeline
 * 
 * 完整的图表生成管线：提取 → 解析 → SVG → PNG → 验证。
 * 整合所有基础模块，提供统一的入口。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { extractDiagrams, type DiagramBlock } from './extractor.js';
import { generateSVG, type SVGNode, type SVGConnection } from './generator.js';
import { convertToPng } from './png-converter.js';
import { validateDiagram, type DiagramData } from './validator.js';
import { DiagramCache, type CacheEntry } from './cache.js';
import { loadDiagramStyle, type DiagramStyle } from './style.js';
import {
  hasStructuredFormat,
  parseStructuredDiagram,
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
  /**
   * 覆盖 mmdc 可用性探测（测试/CI 用）
   *
   * 不传则实际探测。mmdc 不可用时 mermaid 块原样保留为代码块 ——
   * 这是可接受的降级，但**必须如实报告**（见 mermaidKeptAsCode）。
   */
  mmdcAvailable?: boolean;
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
   * mermaid 块因缺少 mmdc 而**原样保留为代码块**的数量（Bug 35）
   *
   * 这些图**没有生成**，不能计入 generated。单独计数以便如实报告：
   * 「N 个 mermaid 图表未渲染（需要 mmdc）」。与 Bug 16（缺 pandoc）同类。
   */
  mermaidKeptAsCode: number;
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
      mermaidKeptAsCode: 0,
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

        // 处理 mermaid 格式（向后兼容）
        if (block.format === 'mermaid') {
          // 原实现把「mermaid 渲染失败」也算进 generated（注释写着
          // 「仍然算成功，因为保留了原始内容」）—— 于是阶段汇报
          // 「图表生成完成 (N 个图表)」里混着根本没生成的图（Bug 35）。
          // 真机事故：mmdc 未安装，ch001 的 3 张 mermaid 图全部没生成，
          // 流程却报成功，最终文档里这 3 处只有 mermaid 代码块。
          const mermaidResult = await this.processMermaidBlock(
            block, diagramId, figuresDir, options,
          );

          if (mermaidResult.rendered) {
            result.generated++;
          } else if (mermaidResult.success) {
            // 缺 mmdc：保留代码块是允许的降级，但如实计入并告警
            result.mermaidKeptAsCode++;
            result.warnings.push({
              diagramId,
              warnings: [
                '未渲染为图片（mmdc 不可用），已原样保留 mermaid 代码块。' +
                '如需生成图片请安装 mmdc：npm install -g @mermaid-js/mermaid-cli',
              ],
            });
          } else {
            result.failed++;
            result.errors.push({
              diagramId,
              error: `mermaid 渲染失败: ${mermaidResult.error ?? '未知错误'}`,
            });
          }
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
        const spec = hasStructuredFormat(block.rawContent)
          ? parseStructuredDiagram(block.rawContent)
          : null;

        const { nodes, connections } = spec && spec.nodes.length > 0
          ? specToGeneratorInput(spec)
          : parseDiagramDescription({
              description: block.description,
              title: block.title,
            });

        // 生成 SVG
        const svgResult = generateSVG(nodes, connections, this.style);
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
            nodes: nodes.map(n => ({ id: n.id, label: n.label, layer: n.layer })),
            connections,
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

  /**
   * 处理 mermaid 格式的图表（向后兼容）
   * 
   * 尝试用 mmdc 渲染，如果不可用则保留原始 mermaid 代码块
   */
  private async processMermaidBlock(
    block: DiagramBlock,
    diagramId: string,
    figuresDir: string,
    options: PipelineOptions
  ): Promise<{ success: boolean; rendered: boolean; error?: string }> {
    const mmdPath = join(figuresDir, `${diagramId}.mmd`);
    const svgPath = join(figuresDir, `${diagramId}.svg`);
    const pngPath = join(figuresDir, `${diagramId}.png`);

    // 写入 mermaid 文件（即使不渲染也保留，便于人工排查/后续补渲染）
    writeFileSync(mmdPath, block.description, 'utf-8');

    // options.mmdcAvailable 可覆盖探测结果（测试/CI 用）
    const mmdcAvailable = options.mmdcAvailable ?? this.checkMmdc();

    if (!mmdcAvailable) {
      // mmdc 不可用：保留原始 mermaid 代码块，**但不写 manifest 记录**。
      //
      // 原实现会写一条 svgFile=''/pngFile='' 的记录并返回 success ——
      // 两个问题（Bug 35）：
      //   1. 计入 generated，阶段汇报「图表生成完成」而图并不存在；
      //   2. 空文件名字段是 falsy，会绕过 Bug 29 加上的产物存在性检查，
      //      导致 shouldRegenerate 永远认为「已缓存」，之后再也不会重试。
      // 所以正确做法是：不记录（下次进来仍然需要生成），并让调用方
      // 通过 rendered:false 得知实情。
      // 同时清掉可能存在的旧记录（历史上写过空文件名的条目）
      this.cache.removeEntry(diagramId);
      return { success: true, rendered: false, error: 'mmdc 不可用' };
    }

    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('mmdc', ['-i', mmdPath, '-o', svgPath], { stdio: 'pipe' });

      // 生成 PNG
      if (!options.skipPng) {
        await convertToPng(svgPath, pngPath);
      }

      // 更新缓存
      this.cache.setEntry(diagramId, {
        sourceHash: this.cache.computeHash(block.rawContent),
        svgFile: `${diagramId}.svg`,
        pngFile: `${diagramId}.png`,
        generatedAt: new Date().toISOString(),
      });

      return { success: true, rendered: true };
    } catch (error) {
      return {
        success: false,
        rendered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查 mmdc 是否可用
   */
  private checkMmdc(): boolean {
    try {
      const { execFileSync } = require('node:child_process');
      execFileSync('mmdc', ['--version'], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 把结构化 spec 映射为生成器的输入
 *
 * 层号的来源是**容器顺序**（对应知识库原则 1「分组压缩」）：
 * 容器天然就是分层，写手已经用它标注了归属。
 * 横切 / 贯穿型容器（如「贯穿动作」）不属于任何一层，放到最后，
 * 由布局引擎负责画成侧边条。
 *
 * 注：层号与尺寸的最终决定权在新布局引擎（layout.ts），
 * 这里只提供"一份足够好的默认值"，避免老生成器拿到全 0 层号。
 */
function specToGeneratorInput(spec: DiagramSpec): {
  nodes: Array<{ id: string; label: string; layer: number }>;
  connections: Array<{ from: string; to: string; label?: string }>;
} {
  const layerOf = new Map<string, number>();
  let layer = 0;

  for (const container of spec.containers) {
    if (container.crosscut) continue;
    for (const nodeId of container.nodes) {
      if (!layerOf.has(nodeId)) layerOf.set(nodeId, layer);
    }
    layer++;
  }

  const crosscutLayer = layer;
  for (const container of spec.containers) {
    if (!container.crosscut) continue;
    for (const nodeId of container.nodes) {
      if (!layerOf.has(nodeId)) layerOf.set(nodeId, crosscutLayer);
    }
  }

  return {
    nodes: spec.nodes.map(n => ({
      id: n.id,
      label: n.label,
      layer: layerOf.get(n.id) ?? 0,
    })),
    connections: spec.edges.map(e => ({
      from: e.from,
      to: e.to,
      ...(e.label ? { label: e.label } : {}),
    })),
  };
}
