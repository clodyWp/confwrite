import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

/**
 * Assembly options
 */
export interface AssemblyOptions {
  /** Document title */
  title?: string;
  /** Generate table of contents */
  generateTOC?: boolean;
  /** Add page breaks between chapters */
  pageBreaks?: boolean;
}

/**
 * Assembly result
 */
export interface AssemblyResult {
  success: boolean;
  content: string;
  stats: {
    totalChapters: number;
    totalCharacters: number;
    totalWords: number;
  };
  warnings: string[];
  error?: string;
}

/**
 * Chapter Assembler
 * Assembles individual chapter files into a single document
 */
export class ChapterAssembler {
  /**
   * Assemble chapters into a single document
   */
  assemble(
    projectDir: string,
    chapterOrder: string[],
    options: AssemblyOptions = {}
  ): AssemblyResult {
    const chaptersDir = join(projectDir, 'drafts/chapters');
    const warnings: string[] = [];
    const chapters: { id: string; content: string; title: string }[] = [];

    // Read each chapter
    for (const chapterId of chapterOrder) {
      const chapterPath = join(chaptersDir, `${chapterId}.md`);

      if (!existsSync(chapterPath)) {
        warnings.push(`Chapter ${chapterId} not found`);
        continue;
      }

      const content = readFileSync(chapterPath, 'utf-8');
      const title = this.extractTitle(content, chapterId);

      chapters.push({ id: chapterId, content, title });
    }

    if (chapters.length === 0) {
      return {
        success: false,
        content: '',
        stats: { totalChapters: 0, totalCharacters: 0, totalWords: 0 },
        warnings,
        error: 'No chapters found',
      };
    }

    // Build document
    const parts: string[] = [];

    // Add title if provided
    if (options.title) {
      parts.push(`# ${options.title}\n`);
    }

    // Generate TOC if requested
    if (options.generateTOC) {
      parts.push(this.generateTOC(chapters));
    }

    // Add chapters
    const pageBreak = options.pageBreaks !== false ? '\n---\n' : '\n';
    const chapterContents = chapters.map(ch => ch.content).join(pageBreak);
    parts.push(chapterContents);

    const content = parts.join('\n');

    // Calculate statistics
    const stats = {
      totalChapters: chapters.length,
      totalCharacters: content.length,
      totalWords: this.countWords(content),
    };

    return {
      success: true,
      content,
      stats,
      warnings,
    };
  }

  /**
   * Save assembled content to file
   */
  save(result: AssemblyResult, outputPath: string): void {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outputPath, result.content, 'utf-8');
  }

  /**
   * List available chapters in project
   */
  listChapters(projectDir: string): string[] {
    const chaptersDir = join(projectDir, 'drafts/chapters');

    if (!existsSync(chaptersDir)) {
      return [];
    }

    const files = readdirSync(chaptersDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => basename(f, '.md'))
      .sort();
  }

  /**
   * Extract title from chapter content
   */
  private extractTitle(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : fallback;
  }

  /**
   * Generate table of contents
   */
  private generateTOC(chapters: { id: string; content: string; title: string }[]): string {
    const lines: string[] = ['# 目录\n'];

    for (const chapter of chapters) {
      lines.push(`- [${chapter.title}](#${chapter.id})`);
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Count words in text (handles both Chinese and English)
   */
  private countWords(text: string): number {
    // Count Chinese characters
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;

    // Count English words
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, '') // Remove Chinese characters
      .split(/\s+/)
      .filter(w => w.length > 0).length;

    return chineseChars + englishWords;
  }
}
