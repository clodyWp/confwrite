import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChapterAssembler, AssemblyOptions, AssemblyResult } from '../assemble/assembler.js';
import { FormatConverter } from '../assemble/converter.js';

/**
 * Export format
 */
export type ExportFormat = 'md' | 'html' | 'docx' | 'pdf';

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
  const assemblyOptions: AssemblyOptions = {
    title: options.title,
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
    case 'pdf':
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
  const { writeFileSync, mkdirSync } = require('node:fs');
  const { dirname } = require('node:path');

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
  const { writeFileSync, mkdirSync } = require('node:fs');
  const { dirname } = require('node:path');
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
  const { unlinkSync } = require('node:fs');
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
  const { writeFileSync, mkdirSync } = require('node:fs');
  const { dirname } = require('node:path');
  const tempMdPath = options.outputPath.replace(/\.\w+$/, '.tmp.md');

  const dir = dirname(tempMdPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(tempMdPath, assemblyResult.content, 'utf-8');

  // Generate conversion command
  const cmd = converter.generateConversionCommand(
    tempMdPath,
    options.outputPath,
    options.format as 'docx' | 'pdf',
    {
      toc: options.toc,
    }
  );

  if (options.dryRun) {
    return {
      success: true,
      outputPath: options.outputPath,
      stats: assemblyResult.stats,
      warnings: assemblyResult.warnings,
      conversionCommand: cmd,
    };
  }

  // Execute conversion
  try {
    const { execSync } = require('node:child_process');
    execSync(cmd, { stdio: 'inherit' });

    // Clean up temporary file
    const { unlinkSync } = require('node:fs');
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
      conversionCommand: cmd,
    };
  }
}
