/**
 * HeadingChecker — 标题层级检查器 (Bug K 修复)
 *
 * 对照 outline.md 检查定稿文档的标题层级是否正确。
 * 用于 Phase 7 定稿阶段，确保文档结构与大纲一致。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OutlineParser } from '../organize/outline-parser.js';

export interface HeadingCheckResult {
  /** 检查是否通过 */
  ok: boolean;
  /** 发现的问题列表 */
  issues: string[];
  /** 是否跳过检查（如无 outline.md） */
  skipped: boolean;
  /** 大纲中的章节数 */
  outlineChapterCount: number;
  /** 文档中的章节数 */
  documentChapterCount: number;
}

/**
 * 检查文档标题层级是否与大纲一致
 */
export function checkHeadingHierarchy(
  projectDir: string,
  content: string
): HeadingCheckResult {
  const outlinePath = join(projectDir, 'outline.md');

  // 无 outline.md 时跳过检查
  if (!existsSync(outlinePath)) {
    return {
      ok: true,
      issues: [],
      skipped: true,
      outlineChapterCount: 0,
      documentChapterCount: 0,
    };
  }

  const outlineContent = readFileSync(outlinePath, 'utf-8');
  const parser = new OutlineParser();

  // 解析大纲中的章节
  const outline = parser.parse(outlineContent);
  const outlineChapters = outline.getAllChapters();
  const outlineChapterCount = outlineChapters.length;

  // 解析文档中的 h2 标题（章节级别）
  const documentChapters = extractH2Headings(content);
  const documentChapterCount = documentChapters.length;

  const issues: string[] = [];

  // 检查 1: 章节数量是否匹配
  if (outlineChapterCount > 0 && documentChapterCount !== outlineChapterCount) {
    issues.push(
      `章节数不匹配：大纲有 ${outlineChapterCount} 个章节，文档有 ${documentChapterCount} 个章节`
    );
  }

  // 检查 2: 文档是否有标题
  if (documentChapterCount === 0 && content.trim().length > 0) {
    issues.push('文档没有 h2 级别的章节标题');
  }

  return {
    ok: issues.length === 0,
    issues,
    skipped: false,
    outlineChapterCount,
    documentChapterCount,
  };
}

/**
 * 提取文档中的 h2 标题
 */
function extractH2Headings(content: string): string[] {
  const headings: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^##\s+(.+)$/);
    if (match) {
      headings.push(match[1].trim());
    }
  }

  return headings;
}
