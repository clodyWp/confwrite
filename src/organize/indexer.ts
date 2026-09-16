import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MaterialFile } from './scanner.js';

/**
 * 索引数据
 */
export interface IndexData {
  /** 总文件数 */
  totalFiles: number;
  /** 所有分类 */
  categories: string[];
  /** 所有关键词 */
  keywords: string[];
  /** 按分类组织的文件 */
  byCategory: Record<string, MaterialFile[]>;
  /** 所有文件列表 */
  files: MaterialFile[];
  /** 生成时间 */
  generatedAt: string;
}

/**
 * 索引生成器
 */
export class IndexGenerator {
  /**
   * 从资料文件生成索引
   */
  generate(files: MaterialFile[]): IndexData {
    const categories = Array.from(new Set(files.map(f => f.category)));
    const allKeywords = new Set<string>();
    const byCategory: Record<string, MaterialFile[]> = {};

    // 按分类组织文件
    for (const file of files) {
      if (!byCategory[file.category]) {
        byCategory[file.category] = [];
      }
      byCategory[file.category].push(file);

      // 收集关键词
      for (const keyword of file.keywords) {
        allKeywords.add(keyword);
      }
    }

    return {
      totalFiles: files.length,
      categories,
      keywords: Array.from(allKeywords),
      byCategory,
      files,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成索引并保存到文件
   */
  generateAndSave(files: MaterialFile[], outputPath: string): IndexData {
    const index = this.generate(files);
    
    // 确保目录存在
    const dir = join(outputPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf-8');
    return index;
  }

  /**
   * 按分类生成多个索引文件
   */
  generatePerCategory(files: MaterialFile[], outputDir: string): void {
    const index = this.generate(files);

    // 确保目录存在
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // 为每个分类生成索引
    for (const [category, categoryFiles] of Object.entries(index.byCategory)) {
      const categoryIndex: IndexData = {
        totalFiles: categoryFiles.length,
        categories: [category],
        keywords: Array.from(new Set(categoryFiles.flatMap(f => f.keywords))),
        byCategory: { [category]: categoryFiles },
        files: categoryFiles,
        generatedAt: new Date().toISOString(),
      };

      const filename = `index-${category}.json`;
      const outputPath = join(outputDir, filename);
      writeFileSync(outputPath, JSON.stringify(categoryIndex, null, 2), 'utf-8');
    }
  }

  /**
   * 搜索索引（按关键词或标题）
   */
  search(index: IndexData, query: string): MaterialFile[] {
    const lowerQuery = query.toLowerCase();
    
    return index.files.filter(file => {
      // 搜索关键词
      if (file.keywords.some(k => k.toLowerCase().includes(lowerQuery))) {
        return true;
      }
      
      // 搜索标题
      if (file.title.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      // 搜索摘要
      if (file.summary.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * 按分类搜索
   */
  searchByCategory(index: IndexData, category: string): MaterialFile[] {
    return index.byCategory[category] || [];
  }
}
