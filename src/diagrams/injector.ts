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

/**
 * diagram-start/end 标记正则
 *
 * 必须与 extractor.ts 的 DIAGRAM_BLOCK_RE 保持一致 ——
 * 本模块按出现顺序计数推导 diagramId（`${chapterId}-fig${index+1}`），
 * 与图表生成阶段（pipeline.ts）使用同一套编号规则，否则会对不上图。
 */
const DIAGRAM_BLOCK_RE = /<!--\s*diagram-start\s*\n([\s\S]*?)\n\s*diagram-end\s*-->/g;

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
  let index = 0;

  // 直接在替换回调里处理，不依赖 extractor 的返回顺序：
  // diagramId 与生成阶段（pipeline.ts）使用同一规则 `${chapterId}-fig${index+1}`
  const replaced = content.replace(
    DIAGRAM_BLOCK_RE,
    (match: string, markerContent: string) => {
      const diagramId = `${chapterId}-fig${index + 1}`;
      index++;

      const absPath = join(figuresDir, `${diagramId}.${format}`);
      if (!existsSync(absPath)) {
        missing.push(diagramId);
        return match; // 图不存在 → 原样保留，便于排查
      }

      const title = extractMarkerTitle(markerContent) || diagramId;
      const relPath = toPosix(relative(options.documentDir, absPath));
      injected++;
      return `![${sanitizeAlt(title)}](${relPath})`;
    },
  );

  return { content: replaced, injected, missing };
}
