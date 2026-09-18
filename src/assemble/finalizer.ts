/**
 * Finalizer — Phase 7 定稿处理
 * 
 * Reads assembled output, runs consistency checks against data baseline,
 * generates finalization report, and prepares for export.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface FinalizationReport {
  /** 文档路径 */
  documentPath: string;
  /** 文档统计 */
  stats: {
    chapters: number;
    characters: number;
    words: number;
    headings: number;
    tables: number;
    codeBlocks: number;
    mermaidBlocks: number;
    images: number;
    links: number;
  };
  /** 一致性检查结果 */
  consistency: {
    /** 基线数据在文档中的出现次数 */
    baselineMatches: number;
    /** 基线数据未找到的项 */
    baselineMissing: string[];
    /** 术语一致性 */
    termConsistency: 'pass' | 'warning';
  };
  /** 时间戳 */
  finalizedAt: string;
  /** 是否就绪可导出 */
  readyForExport: boolean;
}

/**
 * 执行定稿处理
 */
export function finalize(projectDir: string): FinalizationReport {
  // Phase 6 assembler saves to assembly/merged-v1.md
  const assembledPath = join(projectDir, 'assembly', 'merged-v1.md');
  const outputPath = join(projectDir, 'output', 'final.md');

  // Try assembly output first, fall back to output/final.md for backward compat
  let content: string;
  if (existsSync(assembledPath)) {
    content = readFileSync(assembledPath, 'utf-8');
  } else if (existsSync(outputPath)) {
    content = readFileSync(outputPath, 'utf-8');
  } else {
    throw new Error(`Assembled document not found: ${assembledPath}`);
  }

  // Write finalized copy to output/final.md
  const outputDir = join(projectDir, 'output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(outputPath, content, 'utf-8');

  // 1. 文档统计
  const stats = computeStats(content);

  // 2. 一致性检查
  const consistency = checkConsistency(projectDir, content);

  // 3. 生成报告
  const report: FinalizationReport = {
    documentPath: outputPath,
    stats,
    consistency,
    finalizedAt: new Date().toISOString(),
    readyForExport: true,
  };

  // 4. 写入报告
  writeFileSync(
    join(outputDir, 'finalization.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  return report;
}

/**
 * 计算文档统计信息
 */
function computeStats(content: string): FinalizationReport['stats'] {
  const chapters = (content.match(/^## /gm) || []).length;
  const characters = content.length;
  // 中文按字符计，英文按空格分词
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = content.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length;
  const words = chineseChars + englishWords;
  const headings = (content.match(/^#+ /gm) || []).length;
  const tables = (content.match(/\|.+\|/g) || []).length;
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  const mermaidBlocks = (content.match(/```mermaid/g) || []).length;
  const images = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length - images;

  return {
    chapters,
    characters,
    words,
    headings,
    tables: Math.floor(tables / 2), // 表格有 header + separator
    codeBlocks: Math.floor(codeBlocks),
    mermaidBlocks,
    images,
    links: Math.max(0, links),
  };
}

/**
 * 检查数据一致性
 */
function checkConsistency(
  projectDir: string,
  content: string,
): FinalizationReport['consistency'] {
  const baselinePath = join(projectDir, 'assets', 'data-baseline.json');

  if (!existsSync(baselinePath)) {
    return {
      baselineMatches: 0,
      baselineMissing: [],
      termConsistency: 'pass',
    };
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  let baselineMatches = 0;
  const baselineMissing: string[] = [];

  // 检查关键指标是否出现在文档中 (metrics is Record<string, string>)
  const metrics: Record<string, string> = baseline.metrics || {};
  for (const [name, value] of Object.entries(metrics)) {
    if (content.includes(value)) {
      baselineMatches++;
    } else {
      baselineMissing.push(`${name}: ${value}`);
    }
  }

  // 检查术语一致性 (technicalTerms is string[])
  const terms: string[] = baseline.technicalTerms || [];
  let termHits = 0;
  for (const term of terms) {
    if (content.includes(term)) {
      termHits++;
    }
  }
  const termConsistency = terms.length === 0 || termHits / terms.length > 0.5
    ? 'pass'
    : 'warning';

  return { baselineMatches, baselineMissing, termConsistency };
}
