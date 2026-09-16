import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';

/**
 * 转换结果
 */
export interface ConversionResult {
  /** 源文件路径 */
  sourcePath: string;
  /** 源文件格式 */
  format: 'markdown' | 'pdf' | 'docx' | 'html';
  /** 是否成功 */
  success: boolean;
  /** 输出文件路径（成功时） */
  outputPath?: string;
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * 转换统计
 */
export interface ConversionStats {
  total: number;
  success: number;
  failed: number;
}

/**
 * 格式转换器
 */
export class FormatConverter {
  /**
   * 转换单个文件
   */
  async convert(sourcePath: string, outputDir: string): Promise<ConversionResult> {
    const ext = extname(sourcePath).toLowerCase();
    const format = this.getFormat(ext);
    
    // Markdown 文件直接返回
    if (format === 'markdown') {
      return {
        sourcePath,
        format,
        success: true,
        outputPath: sourcePath,
      };
    }
    
    // 确保输出目录存在
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // 生成输出文件名
    const baseName = basename(sourcePath, ext);
    const outputPath = join(outputDir, `${baseName}.md`);
    
    try {
      let content: string;
      
      if (format === 'html') {
        content = await this.convertHtml(sourcePath);
      } else if (format === 'pdf') {
        content = await this.convertPdf(sourcePath);
      } else if (format === 'docx') {
        content = await this.convertDocx(sourcePath);
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }
      
      writeFileSync(outputPath, content, 'utf-8');
      
      return {
        sourcePath,
        format,
        success: true,
        outputPath,
      };
    } catch (error) {
      return {
        sourcePath,
        format,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 批量转换文件
   */
  async convertBatch(sourcePaths: string[], outputDir: string): Promise<ConversionResult[]> {
    const results: ConversionResult[] = [];
    
    for (const sourcePath of sourcePaths) {
      const result = await this.convert(sourcePath, outputDir);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * 计算转换统计
   */
  getStats(results: ConversionResult[]): ConversionStats {
    const success = results.filter(r => r.success && !r.error).length;
    const failed = results.filter(r => !r.success || r.error).length;
    
    return {
      total: results.length,
      success,
      failed,
    };
  }
  
  /**
   * 根据扩展名获取格式
   */
  private getFormat(ext: string): 'markdown' | 'pdf' | 'docx' | 'html' {
    const formatMap: Record<string, 'markdown' | 'pdf' | 'docx' | 'html'> = {
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.pdf': 'pdf',
      '.docx': 'docx',
      '.html': 'html',
      '.htm': 'html',
    };
    
    return formatMap[ext] || 'html';
  }
  
  /**
   * 转换 HTML 到 Markdown
   */
  private async convertHtml(sourcePath: string): Promise<string> {
    const html = readFileSync(sourcePath, 'utf-8');
    
    // 简单的 HTML 到 Markdown 转换
    let markdown = html;
    
    // 转换标题
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    
    // 转换段落
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    
    // 转换列表
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    markdown = markdown.replace(/<\/?[uo]l[^>]*>/gi, '\n');
    
    // 转换链接
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    
    // 转换粗体和斜体
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    
    // 移除其他 HTML 标签
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    // 清理多余的空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    return markdown.trim();
  }
  
  /**
   * 转换 PDF 到 Markdown
   * 注意：这是一个简化实现，实际需要专门的 PDF 解析库
   */
  private async convertPdf(sourcePath: string): Promise<string> {
    // 检查文件是否存在
    if (!existsSync(sourcePath)) {
      throw new Error('PDF file not found');
    }
    
    // 检查文件是否是有效的 PDF（简化检查）
    const buffer = readFileSync(sourcePath);
    const header = buffer.slice(0, 4).toString('ascii');
    
    if (header !== '%PDF') {
      throw new Error('Invalid PDF file format');
    }
    
    // 实际 PDF 转换需要专门的库（如 pdf-parse）
    // 这里返回一个占位符消息
    throw new Error('PDF conversion requires pdf-parse library. Please install with: npm install pdf-parse');
  }
  
  /**
   * 转换 DOCX 到 Markdown
   * 注意：这是一个简化实现，实际需要专门的 DOCX 解析库
   */
  private async convertDocx(sourcePath: string): Promise<string> {
    // 检查文件是否存在
    if (!existsSync(sourcePath)) {
      throw new Error('DOCX file not found');
    }
    
    // DOCX 实际上是 ZIP 文件，检查文件头
    const buffer = readFileSync(sourcePath);
    const header = buffer.slice(0, 2).toString('hex');
    
    if (header !== '504b') {
      throw new Error('Invalid DOCX file format (not a ZIP file)');
    }
    
    // 实际 DOCX 转换需要专门的库（如 mammoth）
    // 这里返回一个占位符消息
    throw new Error('DOCX conversion requires mammoth library. Please install with: npm install mammoth');
  }
}
