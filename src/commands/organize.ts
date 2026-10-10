import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MaterialScanner } from '../organize/scanner.js';
import { FormatConverter } from '../organize/converter.js';
import { IndexGenerator } from '../organize/indexer.js';
import { BaselineExtractor } from '../organize/baseline-extractor.js';
import { OutlineParser } from '../organize/outline-parser.js';
import { ChapterMapper } from '../organize/chapter-mapper.js';
import { KitGenerator } from '../organize/kit-generator.js';
import { KnowledgeLoader } from '../knowledge/loader.js';
import { RequirementMapper } from '../organize/requirement-mapper.js';
import { syncChaptersFromOutline } from '../organize/chapter-syncer.js';
import { ProjectStore } from '../state/store.js';
import type { MaterialFile } from '../organize/scanner.js';
import type { IndexData } from '../organize/indexer.js';
import type { DataBaseline } from '../organize/baseline-extractor.js';
import type { ChapterMapping } from '../organize/chapter-mapper.js';
import type { RequirementMap } from '../organize/requirement-mapper.js';

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
  const baseline = await extractor.extract(files);
  writeFileSync(
    join(assetsDir, 'data-baseline.json'),
    JSON.stringify(baseline, null, 2),
    'utf-8'
  );

  // 5. 解析大纲
  const outlinePath = join(projectDir, 'outline.md');
  let chapterMappings: ChapterMapping[] = [];
  let requirementMap: RequirementMap | undefined;
  
  if (existsSync(outlinePath)) {
    const outlineContent = readFileSync(outlinePath, 'utf-8');
    const parser = new OutlineParser();
    const outlineRoot = parser.parse(outlineContent);
    const outlineChapters = outlineRoot.getAllChapters();
    
    // 5.5 生成需求映射
    // 将 OutlineNode 转换为 OutlineChapter 格式
    const chaptersForMapping = outlineChapters.map(node => ({
      id: node.id || '',
      title: node.title,
      type: 'functional',
      description: node.description,
      requirementSource: parseRequirementSourceFromDescription(node.description),
    }));
    
    const requirementMapper = new RequirementMapper(projectDir);
    requirementMap = requirementMapper.generateAndSave(chaptersForMapping);
    
    // 6. 生成章节映射
    const mapper = new ChapterMapper();
    chapterMappings = mapper.map(outlineRoot, indexData);

    // 6.5 应用 type fallback（优先 outline.md，其次 state，最后 'functional'）
    const store = new ProjectStore(projectDir);
    const state = store.load();
    for (const mapping of chapterMappings) {
      if (!mapping.type) {
        const stateChapterType = state?.chapters?.[mapping.chapterId]?.type;
        mapping.type = stateChapterType || 'functional';
      }
    }
    
    // 7. 同步大纲→状态（自动添加/移除章节）
    if (store.exists()) {
      syncChaptersFromOutline(projectDir, store);
    }

    // 8. 生成素材包（注入图表知识库 + 需求内容）
    const knowledgeLoader = new KnowledgeLoader(projectDir);
    const kitGenerator = new KitGenerator(knowledgeLoader, projectDir);
    
    // 修改 generateBatch 以支持 requirementMap
    const kitResult = generateBatchWithRequirements(
      kitGenerator,
      chapterMappings,
      baseline,
      kitsDir,
      outlineRoot,
      requirementMap
    );
    
    // 9. 生成参考资料索引
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

/**
 * 生成素材包（带需求映射）
 */
function generateBatchWithRequirements(
  kitGenerator: KitGenerator,
  mappings: ChapterMapping[],
  baseline: DataBaseline,
  outputDir: string,
  outlineRoot: any,
  requirementMap?: RequirementMap
): { total: number; success: number; failed: number } {
  let success = 0;
  let failed = 0;

  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const mapping of mappings) {
    const outputPath = join(outputDir, `${mapping.chapterId}.md`);
    
    try {
      // 不使用 outline 参数，因为类型不匹配
      // 使用 generateWithOutline 并传入 requirementMap
      const content = kitGenerator.generateWithOutline(mapping, baseline, undefined, requirementMap);
      writeFileSync(outputPath, content, 'utf-8');
      success++;
    } catch (error) {
      console.error(`Failed to generate kit for ${mapping.chapterId}:`, error);
      failed++;
    }
  }

  return { total: mappings.length, success, failed };
}

/**
 * 从章节描述中解析需求来源
 * 
 * 格式：需求来源: §1.1, §1.2
 */
function parseRequirementSourceFromDescription(description?: string): { sections: string[]; headings: string[] } | undefined {
  if (!description) return undefined;
  
  const match = description.match(/需求来源:\s*(.+)/);
  if (!match) return undefined;
  
  const sectionsStr = match[1];
  const sections = sectionsStr
    .split(',')
    .map(s => s.trim())
    .map(s => s.replace(/^§/, ''))
    .filter(s => s.length > 0);
  
  if (sections.length === 0) return undefined;
  
  return {
    sections,
    headings: sections.map(s => `${s}`),  // 简化处理，标题用章节号代替
  };
}
