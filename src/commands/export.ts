import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateShellSafe } from '../utils/paths.js';
import { ChapterAssembler, AssemblyOptions, AssemblyResult } from '../assemble/assembler.js';
import { FormatConverter } from '../assemble/converter.js';

/**
 * Export format
 */
export type ExportFormat = 'md' | 'html' | 'docx';

/**
 * Export options
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat;
  /** Output file path */
  outputPath: string;
  /** Document title */
  title?: string;
  /** Generate table of contents */
  toc?: boolean;
  /** Dry run (only generate command for external tools) */
  dryRun?: boolean;
}

/**
 * Export result
 */
export interface ExportResult {
  success: boolean;
  outputPath?: string;
  stats?: {
    totalChapters: number;
    totalCharacters: number;
    totalWords: number;
  };
  warnings: string[];
  error?: string;
  conversionCommand?: string;
}

/**
 * Export document command
 */
export async function exportDocument(
  projectDir: string,
  options: ExportOptions
): Promise<ExportResult> {
  const assembler = new ChapterAssembler();
  const converter = new FormatConverter();

  // Get chapter order from outline
  const chapterOrder = getChapterOrder(projectDir);

  if (chapterOrder.length === 0) {
    return {
      success: false,
      warnings: [],
      error: 'No chapters found in outline',
    };
  }

  // Assemble chapters
  // title 未显式指定时，从 outline.md 的一级标题解析（Bug 27）
  //
  // phase8 与手动 /confwrite:export 都不传 title，若不自动解析：
  //   - 导出结果没有文档标题
  //   - 章节标题不会降级（与文档标题同为 Heading1）
  const assemblyOptions: AssemblyOptions = {
    title: options.title ?? assembler.resolveDocumentTitle(projectDir),
    generateTOC: options.toc,
    pageBreaks: true,
  };

  const assemblyResult = assembler.assemble(projectDir, chapterOrder, assemblyOptions);

  if (!assemblyResult.success) {
    return {
      success: false,
      warnings: assemblyResult.warnings,
      error: assemblyResult.error,
    };
  }

  // Handle different formats
  switch (options.format) {
    case 'md':
      return exportMarkdown(assemblyResult, options);

    case 'html':
      return exportHtml(assemblyResult, converter, options);

    case 'docx':
      return exportWithPandoc(assemblyResult, converter, options);

    default:
      return {
        success: false,
        warnings: assemblyResult.warnings,
        error: `Unsupported format: ${options.format}`,
      };
  }
}

/**
 * Get reference doc path for pandoc conversion
 * Returns the path to the custom reference.docx that defines proper list styles
 */
function getReferenceDocPath(): string | undefined {
  // The compiled file is at dist/commands/export.js, templates is at ../../templates/
  const altPath = new URL('../../templates/reference.docx', import.meta.url).pathname;
  if (existsSync(altPath)) {
    return altPath;
  }
  
  // No reference doc found, pandoc will use its default
  return undefined;
}

/**
 * Get chapter order from outline
 */
function getChapterOrder(projectDir: string): string[] {
  const outlinePath = join(projectDir, 'outline.md');

  if (!existsSync(outlinePath)) {
    return [];
  }

  const content = readFileSync(outlinePath, 'utf-8');
  const chapterIds: string[] = [];

  // Match lines like: ch001 1.1 系统概述
  const regex = /^(ch\d{3})\s+/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    chapterIds.push(match[1]);
  }

  return chapterIds;
}

/**
 * Export as Markdown
 */
function exportMarkdown(
  assemblyResult: AssemblyResult,
  options: ExportOptions
): ExportResult {
  // Create output directory if needed
  const dir = dirname(options.outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(options.outputPath, assemblyResult.content, 'utf-8');

  return {
    success: true,
    outputPath: options.outputPath,
    stats: assemblyResult.stats,
    warnings: assemblyResult.warnings,
  };
}

/**
 * Export as HTML
 */
function exportHtml(
  assemblyResult: AssemblyResult,
  converter: FormatConverter,
  options: ExportOptions
): ExportResult {
  // First save as temporary markdown
  const tempMdPath = options.outputPath.replace(/\.\w+$/, '.tmp.md');

  const dir = dirname(tempMdPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(tempMdPath, assemblyResult.content, 'utf-8');

  // Convert to HTML
  const htmlResult = converter.convertToHtml(tempMdPath, {
    wrapInDocument: true,
    title: options.title || 'Document',
    includeStyles: true,
  });

  if (!htmlResult.success) {
    return {
      success: false,
      warnings: assemblyResult.warnings,
      error: htmlResult.error,
    };
  }

  // Save HTML
  converter.saveHtml(htmlResult, options.outputPath);

  // Clean up temporary file
  unlinkSync(tempMdPath);

  return {
    success: true,
    outputPath: options.outputPath,
    stats: assemblyResult.stats,
    warnings: assemblyResult.warnings,
  };
}

/**
 * Export with pandoc (DOCX/PDF)
 */
function exportWithPandoc(
  assemblyResult: AssemblyResult,
  converter: FormatConverter,
  options: ExportOptions
): ExportResult {
  // First save as temporary markdown
  const tempMdPath = options.outputPath.replace(/\.\w+$/, '.tmp.md');

  const dir = dirname(tempMdPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(tempMdPath, assemblyResult.content, 'utf-8');

  // Validate paths for shell safety
  validateShellSafe(tempMdPath);
  validateShellSafe(options.outputPath);

  // Generate conversion args
  const args = converter.generateConversionCommand(
    tempMdPath,
    options.outputPath,
    options.format as 'docx',
    {
      toc: options.toc,
      referenceDoc: getReferenceDocPath(),
    }
  );

  const displayCmd = `pandoc ${args.join(' ')}`;

  if (options.dryRun) {
    return {
      success: true,
      outputPath: options.outputPath,
      stats: assemblyResult.stats,
      warnings: assemblyResult.warnings,
      conversionCommand: displayCmd,
    };
  }

  // Execute conversion
  try {
    // cwd 必须设为临时文件所在目录（Bug 26）
    //
    // pandoc 解析**相对图片路径**时基于进程 cwd，而文档里写的是
    // `../figures/xxx.png`（相对文档所在目录）。若继承调用方 cwd，
    // 这个相对路径会指向错误位置，pandoc 只能降级为
    // “replacing image with description” —— 导出的 Word 里没有图。
    // 实测：29 张图全部未嵌入，docx 只有 552 KB（应为 1.47 MB）。
    const cwd = dirname(tempMdPath);
    execFileSync('pandoc', args, { stdio: 'inherit', cwd });

    // Clean up temporary file
    unlinkSync(tempMdPath);

    return {
      success: true,
      outputPath: options.outputPath,
      stats: assemblyResult.stats,
      warnings: assemblyResult.warnings,
    };
  } catch (error) {
    return {
      success: false,
      warnings: assemblyResult.warnings,
      error: `Pandoc conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      conversionCommand: displayCmd,
    };
  }
}
