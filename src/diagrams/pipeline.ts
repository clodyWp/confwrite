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
  /** 错误列表 */
  errors: Array<{ diagramId: string; error: string }>;
  /** 验证警告 */
  warnings: Array<{ diagramId: string; warnings: string[] }>;
}

/**
 * 解析后的节点
 */
interface ParsedNode {
  id: string;
  label: string;
  layer: number;
}

/**
 * 解析后的连接
 */
interface ParsedConnection {
  from: string;
  to: string;
  label?: string;
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

    const files = readdirSync(chaptersDir).filter(f => f.endsWith('.md'));
    const allBlocks: DiagramBlock[] = [];

    for (const file of files) {
      const content = readFileSync(join(chaptersDir, file), 'utf-8');
      const chapterId = this.extractChapterId(file);
      const blocks = extractDiagrams(content, chapterId);
      allBlocks.push(...blocks);
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

        // 解析描述为节点和连接
        const { nodes, connections } = this.parseDescription(block);

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
   * 解析描述为节点和连接
   * 
   * 简单的解析器，从描述文本中提取节点和连接关系。
   */
  private parseDescription(block: DiagramBlock): {
    nodes: ParsedNode[];
    connections: ParsedConnection[];
  } {
    const nodes: ParsedNode[] = [];
    const connections: ParsedConnection[] = [];
    const nodeMap = new Map<string, number>();

    const description = block.description;
    const lines = description.split('\n');

    let layer = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '|') continue;

      // 检测连接关系 (A → B 或 A -> B)
      const connMatch = trimmed.match(/(.+?)\s*(?:→|->)\s*(.+)/);
      if (connMatch) {
        const fromLabel = connMatch[1].trim();
        const toLabel = connMatch[2].trim();

        const fromId = this.getOrCreateNode(fromLabel, layer, nodes, nodeMap);
        const toId = this.getOrCreateNode(toLabel, layer + 1, nodes, nodeMap);

        connections.push({ from: fromId, to: toId });
        continue;
      }

      // 检测列表项 (- 模块名)
      const listMatch = trimmed.match(/^[-*]\s*(.+)/);
      if (listMatch) {
        const label = listMatch[1].trim();
        this.getOrCreateNode(label, layer, nodes, nodeMap);
        continue;
      }

      // 检测分层标记 (层名:)
      const layerMatch = trimmed.match(/^(.+?):\s*$/);
      if (layerMatch) {
        layer++;
        continue;
      }
    }

    // 如果没有解析出节点，创建一个默认节点
    if (nodes.length === 0) {
      nodes.push({
        id: 'node-1',
        label: block.title || '图表',
        layer: 0,
      });
    }

    return { nodes, connections };
  }

  /**
   * 获取或创建节点
   */
  private getOrCreateNode(
    label: string,
    layer: number,
    nodes: ParsedNode[],
    nodeMap: Map<string, number>
  ): string {
    // 检查是否已存在
    const existingId = nodeMap.get(label);
    if (existingId !== undefined) {
      return existingId;
    }

    // 创建新节点
    const id = `node-${nodes.length + 1}`;
    nodes.push({ id, label, layer });
    nodeMap.set(label, id);

    return id;
  }
}
