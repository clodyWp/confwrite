import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MaterialScanner } from '../organize/scanner.js';
import { FormatConverter } from '../organize/converter.js';
import { IndexGenerator } from '../organize/indexer.js';
import { BaselineExtractor } from '../organize/baseline-extractor.js';
import { OutlineParser } from '../organize/outline-parser.js';
import { ChapterMapper } from '../organize/chapter-mapper.js';
import { KitGenerator } from '../organize/kit-generator.js';
import type { MaterialFile } from '../organize/scanner.js';
import type { IndexData } from '../organize/indexer.js';
import type { DataBaseline } from '../organize/baseline-extractor.js';
import type { ChapterMapping } from '../organize/chapter-mapper.js';

/**
 * 整理结果
 */
export interface OrganizeResult {
  scanStats: {
    total: number;
    byFormat: Record<string, number>;
    byCategory: Record<string, number>;
  };
  conversionStats: {
    total: number;
    success: number;
    failed: number;
  };
  indexData: IndexData;
  baseline: DataBaseline;
  chapterMappings: ChapterMapping[];
  kitStats: {
    total: number;
    success: number;
    failed: number;
  };
}

/**
 * 整理项目素材
 */
export async function organizeMaterials(projectDir: string): Promise<OrganizeResult> {
  const referenceDir = join(projectDir, 'reference_material');
  const assetsDir = join(projectDir, 'assets');
  const indexesDir = join(assetsDir, 'indexes');
  const kitsDir = join(assetsDir, 'chapter-kits');

  // 1. 扫描资料
  const scanner = new MaterialScanner();
  const scanResult = scanner.scan(referenceDir);
  let files = scanResult.files;

  // 2. 转换格式（PDF/Word/HTML -> Markdown）
  const converter = new FormatConverter();
  const convertedFiles: MaterialFile[] = [];
  
  for (const file of files) {
    if (file.format === 'markdown') {
      convertedFiles.push(file);
    } else {
      const result = await converter.convert(file.absolutePath, referenceDir);
      if (result.success && result.outputPath) {
        // 重新扫描转换后的文件
        const reScan = scanner.scan(referenceDir);
        const converted = reScan.files.find(f => f.absolutePath === result.outputPath);
        if (converted) {
          convertedFiles.push(converted);
        }
      }
    }
  }

  const conversionStats = {
    total: files.length,
    success: convertedFiles.length,
    failed: files.length - convertedFiles.length,
  };

  files = convertedFiles;

  // 3. 生成索引
  const indexer = new IndexGenerator();
  const indexData = indexer.generate(files);
  indexer.generateAndSave(files, join(indexesDir, 'index.json'));

  // 4. 提取数据基线
  const extractor = new BaselineExtractor();
  const baseline = extractor.extract(files);
  writeFileSync(
    join(assetsDir, 'data-baseline.json'),
    JSON.stringify(baseline, null, 2),
    'utf-8'
  );

  // 5. 解析大纲
  const outlinePath = join(projectDir, 'outline.md');
  let chapterMappings: ChapterMapping[] = [];
  
  if (existsSync(outlinePath)) {
    const outlineContent = readFileSync(outlinePath, 'utf-8');
    const parser = new OutlineParser();
    const outline = parser.parse(outlineContent);
    
    // 6. 生成章节映射
    const mapper = new ChapterMapper();
    chapterMappings = mapper.map(outline, indexData);
    
    // 7. 生成素材包
    const kitGenerator = new KitGenerator();
    const kitResult = kitGenerator.generateBatch(chapterMappings, baseline, kitsDir);
    
    // 8. 生成参考资料索引
    generateReferencesIndex(files, join(assetsDir, 'references-index.md'));
    
    return {
      scanStats: scanResult.stats,
      conversionStats,
      indexData,
      baseline,
      chapterMappings,
      kitStats: {
        total: kitResult.total,
        success: kitResult.success,
        failed: kitResult.failed,
      },
    };
  }

  // 没有大纲，跳过章节映射和素材包生成
  generateReferencesIndex(files, join(assetsDir, 'references-index.md'));
  
  return {
    scanStats: scanResult.stats,
    conversionStats,
    indexData,
    baseline,
    chapterMappings: [],
    kitStats: {
      total: 0,
      success: 0,
      failed: 0,
    },
  };
}

/**
 * 生成参考资料索引（人类可读）
 */
function generateReferencesIndex(files: MaterialFile[], outputPath: string): void {
  const lines: string[] = [];
  
  lines.push('# 参考资料索引\n');
  lines.push(`共 ${files.length} 个参考资料文件。\n`);
  
  // 按分类组织
  const byCategory = new Map<string, MaterialFile[]>();
  for (const file of files) {
    if (!byCategory.has(file.category)) {
      byCategory.set(file.category, []);
    }
    byCategory.get(file.category)!.push(file);
  }
  
  for (const [category, categoryFiles] of byCategory.entries()) {
    lines.push(`## ${category} (${categoryFiles.length} 个文件)\n`);
    
    for (const file of categoryFiles) {
      lines.push(`### ${file.title}`);
      lines.push(`- **文件**: ${file.filename}`);
      lines.push(`- **大小**: ${(file.size / 1024).toFixed(1)} KB`);
      if (file.summary) {
        lines.push(`- **摘要**: ${file.summary.slice(0, 200)}...`);
      }
      if (file.keywords.length > 0) {
        lines.push(`- **关键词**: ${file.keywords.join(', ')}`);
      }
      lines.push('');
    }
  }
  
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}
