import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

/**
 * 资料文件格式
 */
export type MaterialFormat = 'markdown' | 'pdf' | 'docx' | 'html';

/**
 * 资料文件信息
 */
export interface MaterialFile {
  /** 文件名 */
  filename: string;
  /** 相对路径 */
  relativePath: string;
  /** 绝对路径 */
  absolutePath: string;
  /** 文件格式 */
  format: MaterialFormat;
  /** 文件大小（字节） */
  size: number;
  /** 标题（从 H1 或文件名提取） */
  title: string;
  /** 关键词（从内容提取） */
  keywords: string[];
  /** 摘要（从首段提取） */
  summary: string;
  /** 分类（从目录名或文件名前缀推断） */
  category: string;
}

/**
 * 扫描统计信息
 */
export interface ScanStats {
  /** 总文件数 */
  total: number;
  /** 按格式统计 */
  byFormat: Record<MaterialFormat, number>;
  /** 按分类统计 */
  byCategory: Record<string, number>;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  /** 扫描到的文件列表 */
  files: MaterialFile[];
  /** 统计信息 */
  stats: ScanStats;
}

/**
 * 资料扫描器
 */
export class MaterialScanner {
  /**
   * 支持的文档扩展名
   */
  private readonly SUPPORTED_EXTENSIONS: Record<string, MaterialFormat> = {
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.html': 'html',
    '.htm': 'html',
  };

  /**
   * 扫描目录下的所有文档文件
   */
  scan(dirPath: string): ScanResult {
    const files: MaterialFile[] = [];
    
    // Check if directory exists
    if (!existsSync(dirPath)) {
      return { files, stats: this.calculateStats(files) };
    }
    
    this.scanDirectory(dirPath, dirPath, files);
    
    const stats = this.calculateStats(files);
    
    return { files, stats };
  }

  /**
   * 递归扫描目录
   */
  private scanDirectory(basePath: string, currentPath: string, files: MaterialFile[]): void {
    const entries = readdirSync(currentPath);
    
    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        this.scanDirectory(basePath, fullPath, files);
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        const format = this.SUPPORTED_EXTENSIONS[ext];
        
        if (format) {
          const file = this.processFile(basePath, fullPath, format);
          files.push(file);
        }
      }
    }
  }

  /**
   * 处理单个文件
   */
  private processFile(basePath: string, filePath: string, format: MaterialFormat): MaterialFile {
    const filename = basename(filePath);
    const relativePath = relative(basePath, filePath);
    const stat = statSync(filePath);
    
    let title = '';
    let keywords: string[] = [];
    let summary = '';
    
    // 读取文件内容（仅 Markdown）
    if (format === 'markdown') {
      const content = readFileSync(filePath, 'utf-8');
      title = this.extractTitle(content, filename);
      keywords = this.extractKeywords(content);
      summary = this.extractSummary(content);
    } else {
      // 非 Markdown 文件使用文件名作为标题
      title = basename(filename, extname(filename));
    }
    
    const category = this.categorize(relativePath, filename);
    
    return {
      filename,
      relativePath,
      absolutePath: filePath,
      format,
      size: stat.size,
      title,
      keywords,
      summary,
      category,
    };
  }

  /**
   * 从 Markdown 内容提取标题（H1）
   */
  private extractTitle(content: string, filename: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      return match[1].trim();
    }
    // 没有 H1，使用文件名
    return basename(filename, extname(filename));
  }

  /**
   * 从内容提取关键词（简单实现）
   */
  private extractKeywords(content: string): string[] {
    // 移除 Markdown 标记
    const text = content
      .replace(/^#+\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '');
    
    // 简单的关键词提取（中文分词 + 英文单词）
    const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
    
    // 去重并限制数量
    const unique = Array.from(new Set(words));
    return unique.slice(0, 10);
  }

  /**
   * 从内容提取摘要（首段）
   */
  private extractSummary(content: string): string {
    // 跳过标题，找到第一个段落
    const lines = content.split('\n');
    let inParagraph = false;
    let summary = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过空行和标题
      if (!trimmed || trimmed.startsWith('#')) {
        if (inParagraph) break;
        continue;
      }
      
      // 开始收集段落
      inParagraph = true;
      summary += trimmed + ' ';
      
      // 限制摘要长度
      if (summary.length > 200) break;
    }
    
    return summary.trim().slice(0, 200);
  }

  /**
   * 根据路径或文件名推断分类
   */
  private categorize(relativePath: string, filename: string): string {
    // 尝试从目录名提取分类（如 "01_政策与背景/doc.md" -> "政策与背景"）
    const parts = relativePath.split(/[/\\]/);
    if (parts.length > 1) {
      // 有目录结构，从第一层目录提取
      const dirName = parts[0];
      const dirMatch = dirName.match(/^(\d+[_-])?(.+)$/);
      if (dirMatch) {
        return dirMatch[2].replace(/[_-]/g, ' ').trim();
      }
    }
    
    // 尝试从文件名前缀提取（如 "01A_政策.md" -> "政策"）
    const fileMatch = filename.match(/^\d+[A-Z]?[_-](.+?)\./);
    if (fileMatch) {
      return fileMatch[1].replace(/[_-]/g, ' ').trim();
    }
    
    return '未分类';
  }

  /**
   * 计算统计信息
   */
  private calculateStats(files: MaterialFile[]): ScanStats {
    const byFormat: Record<MaterialFormat, number> = {
      markdown: 0,
      pdf: 0,
      docx: 0,
      html: 0,
    };
    
    const byCategory: Record<string, number> = {};
    
    for (const file of files) {
      byFormat[file.format]++;
      byCategory[file.category] = (byCategory[file.category] || 0) + 1;
    }
    
    return {
      total: files.length,
      byFormat,
      byCategory,
    };
  }
}
