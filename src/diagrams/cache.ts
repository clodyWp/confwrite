/**
 * Diagram Cache
 * 
 * 基于源文件 hash 的缓存机制，跳过未变更的图表。
 * 缓存清单存储在 figures/manifest.json。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 缓存条目
 */
export interface CacheEntry {
  /** 源内容 hash */
  sourceHash: string;
  /** SVG 文件名 */
  svgFile: string;
  /** PNG 文件名 */
  pngFile: string;
  /** 生成时间 */
  generatedAt: string;
}

/**
 * 缓存清单
 */
export interface CacheManifest {
  [diagramId: string]: CacheEntry;
}

/**
 * 图表缓存管理器
 */
export class DiagramCache {
  private projectDir: string;
  private manifest: CacheManifest = {};
  private manifestPath: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.manifestPath = join(projectDir, 'figures', 'manifest.json');
    this.load();
  }

  /**
   * 计算内容的 hash
   */
  computeHash(content: string): string {
    return createHash('md5').update(content, 'utf-8').digest('hex');
  }

  /**
   * 判断是否需要重新生成
   * 
   * @param diagramId 图表 ID
   * @param sourceContent 源内容
   * @returns true 表示需要重新生成
   */
  shouldRegenerate(diagramId: string, sourceContent: string): boolean {
    const entry = this.manifest[diagramId];
    if (!entry) {
      return true; // 不存在缓存，需要生成
    }

    // 产物缺失时必须重新生成（Bug 29）
    //
    // 原先只比对源哈希，不检查 svg/png 是否还在。实测事故：
    // 清空 figures/*.svg 与 *.png 但保留 manifest.json 后，pipeline 认为
    // 29 张图「未变更」而全部 skip —— 一张图都没生成；而 phase 5 的出口
    // 条件正是 hasFile('figures/manifest.json')，于是流程认为图表阶段
    // 已完成，后续组装拿不到任何图片。
    const figuresDir = join(this.projectDir, 'figures');
    for (const f of [entry.svgFile, entry.pngFile]) {
      if (f && !existsSync(join(figuresDir, f))) {
        return true;
      }
    }

    const currentHash = this.computeHash(sourceContent);
    return currentHash !== entry.sourceHash;
  }

  /**
   * 获取缓存条目
   */
  getEntry(diagramId: string): CacheEntry | undefined {
    return this.manifest[diagramId];
  }

  /**
   * 设置缓存条目
   */
  setEntry(diagramId: string, entry: CacheEntry): void {
    this.manifest[diagramId] = entry;
  }

  /**
   * 更新缓存条目（部分更新）
   */
  updateEntry(diagramId: string, updates: Partial<CacheEntry>): void {
    const existing = this.manifest[diagramId];
    if (existing) {
      this.manifest[diagramId] = { ...existing, ...updates };
    }
  }

  /**
   * 移除缓存条目
   */
  removeEntry(diagramId: string): void {
    delete this.manifest[diagramId];
  }

  /**
   * 获取完整清单
   */
  getManifest(): CacheManifest {
    return { ...this.manifest };
  }

  /**
   * 从文件加载清单
   */
  load(): void {
    if (!existsSync(this.manifestPath)) {
      this.manifest = {};
      return;
    }

    try {
      const content = readFileSync(this.manifestPath, 'utf-8');
      this.manifest = JSON.parse(content);
    } catch {
      this.manifest = {};
    }
  }

  /**
   * 保存清单到文件
   */
  save(): void {
    const dir = dirname(this.manifestPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  /**
   * 生成图表 ID
   * 
   * @param chapterId 章节 ID
   * @param index 图表在章节内的索引
   */
  static generateDiagramId(chapterId: string, index: number): string {
    return `${chapterId}-fig${index + 1}`;
  }
}
