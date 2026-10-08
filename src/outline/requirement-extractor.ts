import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Requirement, RequirementStatistics } from './types.js';

/**
 * 需求提取器
 * 从输入文档中提取需求
 */
export class RequirementExtractor {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * 从文档中提取需求
   * 注意：实际实现中应该调用LLM，这里使用简单的规则提取作为示例
   */
  async extractFromDocument(docPath: string): Promise<Requirement[]> {
    const content = readFileSync(docPath, 'utf-8');
    const docName = basename(docPath);
    
    const requirements: Requirement[] = [];
    const lines = content.split('\n');
    
    let reqCounter = 1;
    let currentSection = '';
    
    for (const line of lines) {
      // 检测章节标题
      if (line.startsWith('# ')) {
        currentSection = line.replace('# ', '').trim();
      } else if (line.startsWith('## ')) {
        currentSection = line.replace('## ', '').trim();
      }
      
      // 提取需求（简单的规则：以数字开头的行）
      const reqMatch = line.match(/^\d+\.\s+(.+)$/);
      if (reqMatch) {
        const title = reqMatch[1].trim();
        requirements.push({
          id: `REQ-${String(reqCounter).padStart(3, '0')}`,
          title,
          priority: this.inferPriority(title, currentSection),
          source: `${docName}`,
          category: this.inferCategory(currentSection),
        });
        reqCounter++;
      }
    }
    
    return requirements;
  }

  /**
   * 生成需求统计信息
   */
  generateStatistics(requirements: Requirement[]): RequirementStatistics {
    const stats: RequirementStatistics = {
      total: requirements.length,
      byPriority: {
        high: 0,
        medium: 0,
        low: 0,
      },
      completeness: {
        isComplete: true,
        warnings: [],
      },
    };

    // 按优先级统计
    for (const req of requirements) {
      stats.byPriority[req.priority]++;
    }

    // 按分类统计
    const categoryCount: Record<string, number> = {};
    for (const req of requirements) {
      if (req.category) {
        categoryCount[req.category] = (categoryCount[req.category] || 0) + 1;
      }
    }
    if (Object.keys(categoryCount).length > 0) {
      stats.byCategory = categoryCount;
    }

    // 完整性检查
    const warnings: string[] = [];
    
    // 检查是否缺少重要类别
    const categories = new Set(requirements.map(r => r.category).filter(Boolean));
    if (!categories.has('functional')) {
      warnings.push('缺少功能需求');
    }
    if (!categories.has('performance')) {
      warnings.push('缺少性能需求');
    }
    if (!categories.has('security')) {
      warnings.push('缺少安全需求');
    }

    // 检查高优先级需求数量
    if (stats.byPriority.high === 0) {
      warnings.push('没有高优先级需求');
    }

    // 检查总需求数量
    if (requirements.length < 5) {
      warnings.push('需求数量过少（<5），可能遗漏了重要需求');
    }

    stats.completeness.warnings = warnings;
    stats.completeness.isComplete = warnings.length === 0;

    return stats;
  }

  /**
   * 生成需求提取报告
   */
  generateReport(
    requirements: Requirement[],
    stats: RequirementStatistics
  ): string {
    const lines: string[] = [];
    
    lines.push('# 需求提取报告\n');
    
    // 统计信息
    lines.push('## 统计信息\n');
    lines.push(`- **总计**: ${stats.total} 个需求`);
    lines.push(`- **高优先级**: ${stats.byPriority.high} 个`);
    lines.push(`- **中优先级**: ${stats.byPriority.medium} 个`);
    lines.push(`- **低优先级**: ${stats.byPriority.low} 个`);
    lines.push('');
    
    // 按分类统计
    if (stats.byCategory) {
      lines.push('## 按分类统计\n');
      for (const [category, count] of Object.entries(stats.byCategory)) {
        lines.push(`- **${category}**: ${count} 个`);
      }
      lines.push('');
    }
    
    // 需求列表
    lines.push('## 需求列表\n');
    for (const req of requirements) {
      lines.push(`### ${req.id}: ${req.title}`);
      lines.push(`- **优先级**: ${req.priority}`);
      lines.push(`- **来源**: ${req.source}`);
      if (req.category) {
        lines.push(`- **分类**: ${req.category}`);
      }
      if (req.description) {
        lines.push(`- **描述**: ${req.description}`);
      }
      lines.push('');
    }
    
    // 完整性检查
    if (stats.completeness.warnings.length > 0) {
      lines.push('## 警告\n');
      for (const warning of stats.completeness.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    } else {
      lines.push('## 完整性检查\n');
      lines.push('✅ 需求提取完整，无明显遗漏\n');
    }
    
    return lines.join('\n');
  }

  /**
   * 推断需求优先级
   */
  private inferPriority(title: string, section: string): 'high' | 'medium' | 'low' {
    const lowerTitle = title.toLowerCase();
    const lowerSection = section.toLowerCase();
    
    // 高优先级关键词
    if (lowerTitle.includes('必须') || lowerTitle.includes('核心') || 
        lowerSection.includes('核心') || lowerSection.includes('关键')) {
      return 'high';
    }
    
    // 低优先级关键词
    if (lowerTitle.includes('可选') || lowerTitle.includes('建议') ||
        lowerSection.includes('可选') || lowerSection.includes('扩展')) {
      return 'low';
    }
    
    // 默认为中优先级
    return 'medium';
  }

  /**
   * 推断需求分类
   */
  private inferCategory(section: string): string {
    const lowerSection = section.toLowerCase();
    
    if (lowerSection.includes('功能') || lowerSection.includes('functional')) {
      return 'functional';
    }
    if (lowerSection.includes('性能') || lowerSection.includes('performance')) {
      return 'performance';
    }
    if (lowerSection.includes('安全') || lowerSection.includes('security')) {
      return 'security';
    }
    if (lowerSection.includes('可用性') || lowerSection.includes('usability')) {
      return 'usability';
    }
    if (lowerSection.includes('兼容') || lowerSection.includes('compatibility')) {
      return 'compatibility';
    }
    
    return 'other';
  }
}
