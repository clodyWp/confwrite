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

        // 处理 mermaid 格式（向后兼容）
        if (block.format === 'mermaid') {
          const mermaidResult = await this.processMermaidBlock(block, diagramId, figuresDir, options);
          if (mermaidResult.success) {
            result.generated++;
          } else {
            // mermaid 处理失败，保留原始代码块，不阻塞流程
            result.warnings.push({
              diagramId,
              warnings: [`mermaid 渲染失败，保留原始代码块: ${mermaidResult.error}`],
            });
            result.generated++; // 仍然算成功，因为保留了原始内容
          }
          continue;
        }

        // 标准格式：解析描述为节点和连接
        // （解析逻辑已抽到 description-parser.ts 便于单测；
        //   修复了全角冒号、列表前缀、多跳链三个 bug）
        const { nodes, connections } = parseDiagramDescription({
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
  ): Promise<{ success: boolean; error?: string }> {
    const mmdPath = join(figuresDir, `${diagramId}.mmd`);
    const svgPath = join(figuresDir, `${diagramId}.svg`);
    const pngPath = join(figuresDir, `${diagramId}.png`);

    // 写入 mermaid 文件
    writeFileSync(mmdPath, block.description, 'utf-8');

    // 尝试用 mmdc 渲染
    const mmdcAvailable = this.checkMmdc();
    
    if (mmdcAvailable) {
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

        return { success: true };
      } catch (error) {
        // mmdc 渲染失败，保留原始 mermaid 代码块
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      // mmdc 不可用，保留原始 mermaid 代码块
      // 不生成 SVG/PNG，Markdown 渲染器可以处理 mermaid 代码块
      this.cache.setEntry(diagramId, {
        sourceHash: this.cache.computeHash(block.rawContent),
        svgFile: '', // 空表示未生成
        pngFile: '',
        generatedAt: new Date().toISOString(),
      });

      return { success: true };
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
