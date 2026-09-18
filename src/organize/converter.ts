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
    return this.htmlToMarkdown(html);
  }

  /**
   * HTML → Markdown 转换（共享逻辑，供 convertHtml 和 convertDocx 使用）
   */
  private htmlToMarkdown(html: string): string {
    let md = html;

    // 标题
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

    // 段落
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // 列表
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

    // 链接
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // 粗体/斜体
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // 移除剩余标签
    md = md.replace(/<[^>]+>/g, '');

    // 清理空行
    md = md.replace(/\n{3,}/g, '\n\n');

    return md.trim();
  }
  
  /**
   * 转换 PDF 到 Markdown (使用 pdf-parse)
   */
  private async convertPdf(sourcePath: string): Promise<string> {
    if (!existsSync(sourcePath)) {
      throw new Error('PDF file not found');
    }

    const buffer = readFileSync(sourcePath);
    const header = buffer.slice(0, 4).toString('ascii');
    if (header !== '%PDF') {
      throw new Error('Invalid PDF file format');
    }

    // pdf-parse v2 API: class-based
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    // Combine pages into markdown
    return result.pages
      .map((p: { text: string }) => p.text.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * 转换 DOCX 到 Markdown (使用 mammoth → HTML → MD)
   */
  private async convertDocx(sourcePath: string): Promise<string> {
    if (!existsSync(sourcePath)) {
      throw new Error('DOCX file not found');
    }

    const buffer = readFileSync(sourcePath);
    const header = buffer.slice(0, 2).toString('hex');
    if (header !== '504b') {
      throw new Error('Invalid DOCX file format (not a ZIP file)');
    }

    // mammoth converts DOCX → HTML
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    // Reuse existing HTML → MD converter
    return this.htmlToMarkdown(html);
  }
}
