import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { injectDiagrams } from '../diagrams/injector.js';
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
 * 
 * 支持版本化文件（参考 bailian-agent/doc-chapters-v6）：
 * - 版本化: ch001-v1.md, ch001-v2.md, ch001-v3.md
 * - 非版本化: ch001.md (向后兼容)
 * - 自动选择每个章节的最新版本
 */
/**
 * 章节正文开头的示意图分页符
 *
 * 不能用 `---`：pandoc 会把「前面空行 + `---` + 紧跟非空行」识别为
 * YAML 元数据块开头，导致整个导出失败（Bug 25，实测退出码 64）。
 * `***` 是普通主题分隔线，无歧义。
 */
const CHAPTER_SEPARATOR = '\n\n***\n\n';

/** 代码块围栏 */
const FENCE_RE = /^\s*(```|~~~)/;

/** ATX 标题 */
const HEADING_RE = /^(#{1,6})(\s+)(.*)$/;

/**
 * 调整章节正文的标题层级，并给首个标题加上锚点 id
 *
 * - `demote` 为 true 时将所有标题降一级（文档标题占用了 h1）
 * - 给第一个标题追加 `{#chXXX}`，使 TOC 链接可跳转（Bug 23）
 * - **跳过代码块**：Python/Shell 注释 `# xxx` 不是标题
 *
 * @param content 章节正文
 * @param chapterId 章节 id（用作锚点）
 * @param demote 是否降级标题
 */
function prepareChapterContent(content: string, chapterId: string, demote: boolean): string {
  const lines = content.split('\n');
  let inFence = false;
  let anchored = false;

  const out = lines.map(line => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    const m = line.match(HEADING_RE);
    if (!m) return line;

    const hashes = demote && m[1].length < 6 ? `#${m[1]}` : m[1];
    let text = m[3];
    if (!anchored) {
      // 去掉可能已存在的 id 标记后重新追加，避免重复
      text = `${text.replace(/\s*\{#[^}]+\}\s*$/, '')} {#${chapterId}}`;
      anchored = true;
    }
    return `${hashes}${m[2]}${text}`;
  });

  const result = out.join('\n');

  // 章节没有标题时补一个锚点，保证 TOC 链接仍可用
  if (!anchored) {
    return `<a id="${chapterId}"></a>\n\n${result}`;
  }
  return result;
}

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
    const chapters: { id: string; content: string; title: string; version: string }[] = [];

    // Read each chapter (find latest version)
    for (const chapterId of chapterOrder) {
      const chapterInfo = this.findLatestVersion(chaptersDir, chapterId);

      if (!chapterInfo) {
        warnings.push(`Chapter ${chapterId} not found`);
        continue;
      }

      const rawContent = readFileSync(chapterInfo.path, 'utf-8');
      const title = this.extractTitle(rawContent, chapterId);

      // 把 diagram-start 标记替换为图片引用（Bug 12）
      // 组装后文档位于 <projectDir>/assembly/，故图片路径形如 ../figures/ch001-fig1.png
      const injection = injectDiagrams(rawContent, chapterId, {
        projectDir,
        documentDir: join(projectDir, 'assembly'),
      });
      if (injection.missing.length > 0) {
        warnings.push(
          `Chapter ${chapterId}: ${injection.missing.length} 个图表缺少图片文件，标记未替换 (${injection.missing.join(', ')})`,
        );
      }

      // 标题层级 + 锚点（Bug 23、24）
      // 有文档标题时，文档标题占 h1，章节内容整体降一级；
      // 首个标题追加 {#chXXX} 使 TOC 链接可跳转
      const content = prepareChapterContent(
        injection.content,
        chapterId,
        Boolean(options.title),
      );

      chapters.push({ 
        id: chapterId, 
        content, 
        title,
        version: chapterInfo.version,
      });
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

    // Generate TOC if requested（标题层级随是否有文档标题而变，Bug 24）
    if (options.generateTOC) {
      parts.push(this.generateTOC(chapters, options.title ? 2 : 1));
    }

    // Add chapters
    const pageBreak = options.pageBreaks !== false ? CHAPTER_SEPARATOR : '\n\n';
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
   * List available chapters in project (returns latest version of each)
   */
  /**
   * 解析文档标题
   *
   * 取自 outline.md 的第一个一级标题（`# xxx`）。
   *
   * 历史事故（Bug 22）：phase6 组装时未传 title，而 finalizer 会把
   * assembly/merged-v1.md 原样写入 output/final.md，导致最终文档
   * 以 `# 目录` 开头、没有文档标题。
   *
   * @returns 标题文本；无 outline.md 或无一级标题时返回 undefined
   */
  resolveDocumentTitle(projectDir: string): string | undefined {
    const outlinePath = join(projectDir, 'outline.md');
    if (!existsSync(outlinePath)) return undefined;

    try {
      const content = readFileSync(outlinePath, 'utf-8');
      const m = content.match(/^#\s+(.+)$/m);
      const title = m?.[1]?.trim();
      return title || undefined;
    } catch {
      return undefined;
    }
  }

  listChapters(projectDir: string): string[] {
    const chaptersDir = join(projectDir, 'drafts/chapters');

    if (!existsSync(chaptersDir)) {
      return [];
    }

    const files = readdirSync(chaptersDir);
    
    // Group by chapter ID, find latest version
    const chapterVersions = new Map<string, { version: number; file: string }[]>();
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      // 版本化文件: ch001-v1.md
      const versionedMatch = file.match(/^(ch\d+)-v(\d+)\.md$/);
      if (versionedMatch) {
        const chapterId = versionedMatch[1];
        const version = parseInt(versionedMatch[2]);
        if (!chapterVersions.has(chapterId)) {
          chapterVersions.set(chapterId, []);
        }
        chapterVersions.get(chapterId)!.push({ version, file });
        continue;
      }
      
      // 非版本化文件: ch001.md (向后兼容)
      const legacyMatch = file.match(/^(ch\d+)\.md$/);
      if (legacyMatch) {
        const chapterId = legacyMatch[1];
        if (!chapterVersions.has(chapterId)) {
          chapterVersions.set(chapterId, [{ version: 0, file }]);
        }
      }
    }
    
    // Return chapter IDs sorted
    return Array.from(chapterVersions.keys()).sort();
  }

  /**
   * Find the latest version of a chapter file
   * Returns null if no version found
   */
  private findLatestVersion(chaptersDir: string, chapterId: string): { path: string; version: string } | null {
    if (!existsSync(chaptersDir)) {
      return null;
    }

    const files = readdirSync(chaptersDir);
    let latestVersion = -1;
    let latestFile = '';

    for (const file of files) {
      // 版本化文件: ch001-v1.md
      const versionedMatch = file.match(new RegExp(`^${chapterId}-v(\\d+)\\.md$`));
      if (versionedMatch) {
        const version = parseInt(versionedMatch[1]);
        if (version > latestVersion) {
          latestVersion = version;
          latestFile = file;
        }
        continue;
      }

      // 非版本化文件: ch001.md (向后兼容，视为 v0)
      if (file === `${chapterId}.md`) {
        if (latestVersion < 0) {
          latestVersion = 0;
          latestFile = file;
        }
      }
    }

    if (latestFile) {
      return {
        path: join(chaptersDir, latestFile),
        version: latestVersion === 0 ? 'legacy' : `v${latestVersion}`,
      };
    }

    return null;
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
   *
   * @param headingLevel 目录标题层级（有文档标题时为 2，否则为 1）
   */
  private generateTOC(
    chapters: { id: string; content: string; title: string; version: string }[],
    headingLevel: number = 1,
  ): string {
    const lines: string[] = [`${'#'.repeat(headingLevel)} 目录\n`];

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
