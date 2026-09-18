/**
 * Image Path Adjuster
 * 
 * 处理 Markdown 中图片引用的相对路径。
 * 方案 B：在组装/定稿阶段集中替换。
 */
import { posix, win32 } from 'node:path';

/**
 * 路径调整选项
 */
export interface PathAdjustOptions {
  /** 源目录（如 drafts/chapters） */
  fromDir: string;
  /** 目标目录（如 assembly） */
  toDir: string;
  /** 图表目录名称（如 figures） */
  figuresDir: string;
}

/**
 * 图片引用正则
 * 匹配 ![alt](path) 格式
 */
const IMAGE_REF_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * 调整 Markdown 中的图片路径
 * 
 * @param content Markdown 内容
 * @param options 路径调整选项
 * @returns 调整后的内容
 */
export function adjustImagePaths(content: string, options: PathAdjustOptions): string {
  const { fromDir, toDir, figuresDir } = options;

  return content.replace(IMAGE_REF_RE, (match, alt, src) => {
    // 跳过外部 URL
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      return match;
    }

    // 检查是否是图表路径
    if (!isFigurePath(src, figuresDir)) {
      return match;
    }

    // 提取文件名（去掉路径前缀）
    const filename = extractFilename(src);

    // 计算新的相对路径
    const newPath = calculateRelativePath(toDir, figuresDir, filename);

    return `![${alt}](${newPath})`;
  });
}

/**
 * 检查路径是否指向图表目录
 */
function isFigurePath(src: string, figuresDir: string): boolean {
  // 规范化路径分隔符
  const normalized = src.replace(/\\/g, '/');
  
  // 检查是否包含 figures 目录
  return normalized.includes(figuresDir) || 
         normalized.includes(`/${figuresDir}/`) ||
         normalized.startsWith(`${figuresDir}/`);
}

/**
 * 从路径中提取文件名
 */
function extractFilename(src: string): string {
  // 规范化路径分隔符
  const normalized = src.replace(/\\/g, '/');
  
  // 获取最后一部分
  const parts = normalized.split('/');
  return parts[parts.length - 1];
}

/**
 * 计算从目标目录到图表目录的相对路径
 */
function calculateRelativePath(toDir: string, figuresDir: string, filename: string): string {
  // 计算 toDir 到项目根目录的层级
  const toDirParts = toDir.replace(/\\/g, '/').split('/').filter(Boolean);
  const depth = toDirParts.length;
  
  // 生成相对路径前缀
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  
  return `${prefix}${figuresDir}/${filename}`;
}

/**
 * 批量调整多个文件的路径
 * 
 * @param files 文件列表 { path, content }
 * @param options 路径调整选项
 * @returns 调整后的文件列表
 */
export function batchAdjustImagePaths(
  files: Array<{ path: string; content: string }>,
  options: PathAdjustOptions
): Array<{ path: string; content: string }> {
  return files.map(file => ({
    path: file.path,
    content: adjustImagePaths(file.content, options),
  }));
}
