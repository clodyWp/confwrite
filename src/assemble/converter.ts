import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * HTML conversion options
 */
export interface HtmlConversionOptions {
  /** Wrap in full HTML document */
  wrapInDocument?: boolean;
  /** Document title */
  title?: string;
  /** Include CSS styles */
  includeStyles?: boolean;
}

/**
 * HTML conversion result
 */
export interface HtmlConversionResult {
  success: boolean;
  html: string;
  error?: string;
}

/**
 * Conversion options for external tools
 */
export interface ConversionOptions {
  /** Reference document template */
  referenceDoc?: string;
  /** Generate table of contents */
  toc?: boolean;
  /** Custom CSS file */
  css?: string;
}

/**
 * Dependency information
 */
export interface DependencyInfo {
  installed: boolean;
  version?: string;
  recommended: string;
}

/**
 * Format Converter
 * Converts Markdown to HTML, DOCX, PDF
 */
export class FormatConverter {
  /**
   * Convert Markdown to HTML
   */
  convertToHtml(
    mdPath: string,
    options: HtmlConversionOptions = {}
  ): HtmlConversionResult {
    try {
      if (!existsSync(mdPath)) {
        return {
          success: false,
          html: '',
          error: `File not found: ${mdPath}`,
        };
      }

      const content = readFileSync(mdPath, 'utf-8');
      let html = this.markdownToHtml(content);

      if (options.wrapInDocument) {
        html = this.wrapInDocument(html, options);
      }

      return {
        success: true,
        html,
      };
    } catch (error) {
      return {
        success: false,
        html: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Save HTML to file
   */
  saveHtml(result: HtmlConversionResult, outputPath: string): void {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(outputPath, result.html, 'utf-8');
  }

  /**
   * Generate pandoc conversion args (as array for execFileSync)
   */
  generateConversionCommand(
    inputPath: string,
    outputPath: string,
    format: 'docx',
    options: ConversionOptions = {}
  ): string[] {
    const args: string[] = [inputPath, '-t', format, '-o', outputPath];

    if (options.referenceDoc) {
      args.push(`--reference-doc=${options.referenceDoc}`);
    }

    if (options.toc) {
      args.push('--toc');
    }

    if (options.css) {
      args.push(`--css=${options.css}`);
    }

    return args;
  }

  /**
   * Check if required dependencies are installed
   */
  checkDependencies(): Record<string, DependencyInfo> {
    return {
      pandoc: {
        installed: this.isPandocInstalled(),
        version: this.getPandocVersion(),
        recommended: '2.19 or higher',
      },
    };
  }

  /**
   * Convert Markdown to HTML (simple implementation)
   */
  private markdownToHtml(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/gim, (_, lang, code) => {
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${this.escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`(.*?)`/gim, '<code>$1</code>');

    // Tables
    html = this.convertTables(html);

    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/gim, '<ul>$&</ul>');

    // Paragraphs
    html = html.replace(/\n\n/gim, '</p><p>');
    html = `<p>${html}</p>`;

    // Clean up
    html = html.replace(/<p>\s*<(h[1-6]|ul|ol|pre|table)/gim, '<$1');
    html = html.replace(/<\/(h[1-6]|ul|ol|pre|table)>\s*<\/p>/gim, '</$1>');

    return html;
  }

  /**
   * Convert Markdown tables to HTML
   */
  private convertTables(markdown: string): string {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('|') && line.trim().startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableLines = [];
        }
        tableLines.push(line);
      } else {
        if (inTable) {
          result.push(this.convertTableLines(tableLines));
          inTable = false;
          tableLines = [];
        }
        result.push(line);
      }
    }

    if (inTable && tableLines.length > 0) {
      result.push(this.convertTableLines(tableLines));
    }

    return result.join('\n');
  }

  /**
   * Convert table lines to HTML table
   */
  private convertTableLines(lines: string[]): string {
    if (lines.length < 2) return lines.join('\n');

    const html: string[] = ['<table>'];

    // Header row
    const headerCells = lines[0]
      .split('|')
      .filter(cell => cell.trim())
      .map(cell => `<th>${cell.trim()}</th>`);
    html.push(`<thead><tr>${headerCells.join('')}</tr></thead>`);

    // Body rows (skip separator line)
    html.push('<tbody>');
    for (let i = 2; i < lines.length; i++) {
      const cells = lines[i]
        .split('|')
        .filter(cell => cell.trim())
        .map(cell => `<td>${cell.trim()}</td>`);
      if (cells.length > 0) {
        html.push(`<tr>${cells.join('')}</tr>`);
      }
    }
    html.push('</tbody>');

    html.push('</table>');
    return html.join('\n');
  }

  /**
   * Wrap HTML content in full document
   */
  private wrapInDocument(content: string, options: HtmlConversionOptions): string {
    const title = options.title || 'Document';
    const styles = options.includeStyles ? this.getDefaultStyles() : '';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${styles}
</head>
<body>
${content}
</body>
</html>`;
  }

  /**
   * Get default CSS styles
   */
  private getDefaultStyles(): string {
    return `<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    color: #333;
  }
  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
  }
  h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
  h3 { font-size: 1.25em; }
  code {
    background-color: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', Courier, monospace;
  }
  pre {
    background-color: #f5f5f5;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code {
    background-color: transparent;
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background-color: #f5f5f5;
    font-weight: 600;
  }
  ul, ol {
    padding-left: 2em;
  }
  li {
    margin: 0.5em 0;
  }
</style>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Check if pandoc is installed
   */
  private isPandocInstalled(): boolean {
    try {
      execSync('pandoc --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get pandoc version
   */
  private getPandocVersion(): string | undefined {
    try {
      const output = execSync('pandoc --version', { encoding: 'utf-8' });
      const match = output.match(/pandoc\s+([\d.]+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }
}
