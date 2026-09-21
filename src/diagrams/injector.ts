/**
 * 图表注入
 *
 * 把章节正文里的 `<!-- diagram-start ... -->` 标记替换为 markdown 图片引用，
 * 使生成的图真正出现在最终文档里。
 *
 * 历史事故（Bug 12）：整个管线缺了这一步 ——
 *   writer 写标记 ✓ → extractor 提取 ✓ → pipeline 生成 png ✓
 *   → 替换标记为 ![](figures/xxx.png) ✗ 从未实现
 * 结果：LmERP2 生成了 29 张图，但 merged-v1.md / final.md 里引用为 0，
 * 残留 29 组 HTML 注释；若导出 Word 将是一份「282 页、0 张图」的文档。
 *
 * 注意：src/diagrams/path-adjuster.ts 的 adjustImagePaths() 只调整
 * **已存在** 图片引用的相对路径，不会创建引用，因此不能替代本模块。
 * 本模块直接产出组装目录下的正确相对路径（如 ../figures/ch001-fig1.png）。
 */
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractDiagrams } from './extractor.js';

/** 注入选项 */
export interface InjectDiagramsOptions {
  /** 项目根目录（figures/ 位于其下） */
  projectDir: string;
  /** 组装后文档所在目录，用于计算相对路径 */
  documentDir: string;
  /** 图片格式，默认 png（Word 友好） */
  format?: 'png' | 'svg';
}

/** 注入结果 */
export interface InjectDiagramsResult {
  /** 替换后的内容 */
  content: string;
  /** 成功注入的图片数 */
  injected: number;
  /** 找不到图文件的 diagramId 列表（这些标记被原样保留） */
  missing: string[];
}

/** 把路径统一成 posix 分隔符（markdown 链接要求） */
function toPosix(p: string): string {
  return p.split('\\').join('/');
}

/** 从标记内容里取 title 字段（用于图片 alt 文本） */
function extractMarkerTitle(markerContent: string): string {
  const m = markerContent.match(/^\s*title:\s*(.+)$/m);
  if (!m) return '';
  return m[1].trim().replace(/^["']|["']$/g, '');
}

/**
 * 清洗 markdown 图片的 alt 文本
 *
 * 去掉可能破坏 `![alt](src)` 语法的字符。
 */
function sanitizeAlt(title: string): string {
  return title
    .replace(/[[\]]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

/**
 * 把章节正文中的图表标记替换为图片引用
 *
 * @param content 章节正文（markdown）
 * @param chapterId 章节 id，如 ch001（用于推导 diagramId）
 * @param options 注入选项
 */
export function injectDiagrams(
  content: string,
  chapterId: string,
  options: InjectDiagramsOptions,
): InjectDiagramsResult {
  const format = options.format ?? 'png';
  const figuresDir = join(options.projectDir, 'figures');

  const missing: string[] = [];
  let injected = 0;

  // 用提取器定位块（Bug 33）
  //
  // 原实现自己在本地维护一份 DIAGRAM_BLOCK_RE，只认 diagram-start ——
  // 而提取器两种格式都认（diagram-start + ```mermaid 向后兼容）。
  // 结果是：mermaid 格式的图能被提取、能被生成，却**永远注入不进来**。
  // 真机事故：fixer 按审阅意见把 ch001 的图表改写成 mermaid 后，
  // 该章 3 张图全部丢失，文档里只剩 3 个 mermaid 代码块。
  //
  // 现在两端共用同一套块定位与编号（文档顺序），不可能再错位。
  const blocks = extractDiagrams(content, chapterId);

  let out = content;
  for (const block of blocks) {
    const diagramId = `${chapterId}-fig${block.index + 1}`;
    const absPath = join(figuresDir, `${diagramId}.${format}`);

    if (!existsSync(absPath)) {
      missing.push(diagramId);
      continue; // 图不存在 → 原样保留，便于排查
    }

    const relPath = toPosix(relative(options.documentDir, absPath));
    const alt = sanitizeAlt(block.title) || diagramId;
    const markdown = `![${alt}](${relPath})`;

    // 用函数式替换，避免 alt/路径里的 $ 被当作替换模式
    out = out.replace(block.rawBlock, () => markdown);
    injected++;
  }

  return { content: out, injected, missing };
}
