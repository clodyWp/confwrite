import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChapterMapping } from './chapter-mapper.js';
import type { DataBaseline } from './baseline-extractor.js';

/**
 * 生成结果
 */
export interface GenerationResult {
  chapterId: string;
  outputPath: string;
  success: boolean;
  error?: string;
}

/**
 * 批量生成统计
 */
export interface BatchStats {
  total: number;
  success: number;
  failed: number;
}

/**
 * 素材包生成器
 */
export class KitGenerator {
  /**
   * 生成单个章节的素材包内容
   */
  generate(mapping: ChapterMapping, baseline: DataBaseline): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${mapping.chapterId} 素材包：${mapping.title}\n`);

    // 章节信息
    lines.push('## 章节信息');
    lines.push(`- **章节 ID**: ${mapping.chapterId}`);
    lines.push(`- **标题**: ${mapping.title}`);
    if (mapping.relatedCategories.length > 0) {
      lines.push(`- **相关分类**: ${mapping.relatedCategories.join(', ')}`);
    }
    lines.push('');

    // 相关文件
    if (mapping.relatedFiles.length > 0) {
      lines.push('## 相关文件');
      lines.push(`共 ${mapping.relatedFiles.length} 个相关文件：\n`);
      for (const file of mapping.relatedFiles) {
        lines.push(`- **${file.filename}** (${file.category})`);
        if (file.summary) {
          lines.push(`  - 摘要: ${file.summary.slice(0, 100)}...`);
        }
      }
      lines.push('');
    }

    // 关键数据
    if (Object.keys(baseline.metrics).length > 0) {
      lines.push('## 关键数据');
      lines.push('以下是从资料中提取的关键指标：\n');
      for (const [key, value] of Object.entries(baseline.metrics)) {
        lines.push(`- **${key}**: ${value}`);
      }
      lines.push('');
    }

    // 技术术语
    if (baseline.technicalTerms.length > 0) {
      lines.push('## 技术术语');
      lines.push('确保在写作中正确使用以下术语：\n');
      lines.push(baseline.technicalTerms.join(', '));
      lines.push('');
    }

    // 需求
    if (baseline.requirements.length > 0) {
      lines.push('## 需求要点');
      lines.push('写作时需要覆盖以下需求：\n');
      for (const req of baseline.requirements) {
        lines.push(`- ${req}`);
      }
      lines.push('');
    }

    // 写作提示
    lines.push('## 写作提示');
    lines.push('1. 仔细阅读相关文件，理解上下文');
    lines.push('2. 确保使用正确的技术术语');
    lines.push('3. 引用关键数据时保持一致性');
    lines.push('4. 覆盖所有需求要点');
    lines.push('5. 保持与整体文档风格一致');

    return lines.join('\n');
  }

  /**
   * 生成并保存到文件
   */
  generateAndSave(
    mapping: ChapterMapping,
    baseline: DataBaseline,
    outputPath: string
  ): void {
    // 确保目录存在
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = this.generate(mapping, baseline);
    writeFileSync(outputPath, content, 'utf-8');
  }

  /**
   * 批量生成素材包
   */
  generateBatch(
    mappings: ChapterMapping[],
    baseline: DataBaseline,
    outputDir: string
  ): BatchStats & { results: GenerationResult[] } {
    const results: GenerationResult[] = [];

    for (const mapping of mappings) {
      const outputPath = `${outputDir}/${mapping.chapterId}.md`;
      
      try {
        this.generateAndSave(mapping, baseline, outputPath);
        results.push({
          chapterId: mapping.chapterId,
          outputPath,
          success: true,
        });
      } catch (error) {
        results.push({
          chapterId: mapping.chapterId,
          outputPath,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      total: mappings.length,
      success,
      failed,
      results,
    };
  }
}
