/**
 * ContentValidator - 内容深度验证器
 * 
 * 验证 Writer 输出是否符合深度要求：
 * 1. 每个子节（## 或 ### 下）整体 ≥ 5000 字
 * 2. 图表前后有描述/总结段落
 * （段落级 300 字检查已移除，见 Bug 4/5/6 修复）
 */

export interface ValidationResult {
  sectionLengthValid: boolean;
  paragraphLengthValid: boolean;
  diagramFormatValid: boolean;
  isValid: boolean;
  shortSections: Array<{ section: string; charCount: number }>;
  shortParagraphs: Array<{ paragraph: string; charCount: number }>;
  diagramIssues: Array<{ diagramIndex: number; issue: string }>;
}

export class ContentValidator {
  private readonly MIN_SECTION_CHARS = 5000;

  /**
   * 验证内容是否符合深度要求
   */
  validate(content: string): ValidationResult {
    const shortSections = this.validateSectionLength(content);
    const diagramIssues = this.validateDiagramFormat(content);

    return {
      sectionLengthValid: shortSections.length === 0,
      paragraphLengthValid: true,
      diagramFormatValid: diagramIssues.length === 0,
      isValid: shortSections.length === 0 && diagramIssues.length === 0,
      shortSections,
      shortParagraphs: [],
      diagramIssues,
    };
  }

  /**
   * 验证每个子节是否 ≥ 5000 字
   */
  private validateSectionLength(content: string): Array<{ section: string; charCount: number }> {
    const shortSections: Array<{ section: string; charCount: number }> = [];
    
    // 按 ## 或 ### 分割（跳过一级标题 #）
    const sections = content.split(/\n(?=##\s|###\s)/);
    
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;
      
      // 跳过一级标题（# 开头但不是 ## 或 ###）
      if (trimmed.match(/^#\s/) && !trimmed.match(/^##/)) continue;
      
      // 提取标题
      const titleMatch = trimmed.match(/^#{2,3}\s+(.+)/);
      const title = titleMatch ? titleMatch[1] : '(无标题)';
      
      // 计算字符数（排除标题和空行）
      const contentLines = trimmed.split('\n').filter(line => !line.match(/^#{2,3}\s/) && line.trim());
      const charCount = contentLines.join('').length;
      
      if (charCount < this.MIN_SECTION_CHARS) {
        shortSections.push({ section: title, charCount });
      }
    }
    
    return shortSections;
  }

  /**
   * 验证图表前后是否有描述/总结段落
   */
  private validateDiagramFormat(content: string): Array<{ diagramIndex: number; issue: string }> {
    const issues: Array<{ diagramIndex: number; issue: string }> = [];
    
    // ① mermaid 代码块已废弃 —— 直接报硬错误
    //
    // 此前这里只检查 mermaid 块前后的说明段落，对**真实使用的**
    // diagram-start 结构化格式什么都不查，等于这条规则形同虚设。
    const mermaidRegex = /```mermaid[\s\S]*?```/g;
    let mermaidIndex = 0;
    while (mermaidRegex.exec(content) !== null) {
      mermaidIndex++;
      issues.push({
        diagramIndex: mermaidIndex,
        issue: '使用了已废弃的 mermaid 代码块，必须改写为 diagram-start 结构化格式（containers / nodes / edges）',
      });
    }

    // ② 结构化图表块前后必须有描述 / 总结段落
    const diagramRegex = /<!--\s*diagram-start[\s\S]*?diagram-end\s*-->/g;
    let match;
    let diagramIndex = 0;
    
    while ((match = diagramRegex.exec(content)) !== null) {
      diagramIndex++;
      const diagramStart = match.index;
      const diagramEnd = diagramStart + match[0].length;
      
      // 检查图表前的内容（往前找 200 字符）
      const beforeContent = content.substring(Math.max(0, diagramStart - 300), diagramStart);
      const beforeParagraphs = beforeContent.split(/\n\n+/).filter(p => p.trim());
      const lastBeforePara = beforeParagraphs[beforeParagraphs.length - 1]?.trim() || '';
      
      // 图表前需要有描述段落（至少 50 字）
      if (lastBeforePara.replace(/\s/g, '').length < 50) {
        issues.push({ diagramIndex, issue: '图表前缺少描述段落' });
      }
      
      // 检查图表后的内容（往后找 200 字符）
      const afterContent = content.substring(diagramEnd, Math.min(content.length, diagramEnd + 300));
      const afterParagraphs = afterContent.split(/\n\n+/).filter(p => p.trim());
      const firstAfterPara = afterParagraphs[0]?.trim() || '';
      
      // 图表后需要有总结段落（至少 50 字）
      if (firstAfterPara.replace(/\s/g, '').length < 50) {
        issues.push({ diagramIndex, issue: '图表后缺少总结段落' });
      }
    }
    
    return issues;
  }
}
