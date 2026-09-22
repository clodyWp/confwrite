import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * 清理 docx 文件中的重复样式定义
 * 
 * pandoc 使用 --reference-doc 时会保留自己的默认样式，
 * 导致 styles.xml 中出现重复的样式定义。Word 会使用第一个定义，
 * 所以我们的自定义字体可能被覆盖。
 * 
 * 这个脚本会删除 pandoc 默认的样式定义，保留 reference.docx 中的样式。
 */
export function cleanupDuplicateStyles(docxPath: string): void {
  const tempDir = `/tmp/cleanup-styles-${Date.now()}`;
  
  try {
    // 解压 docx
    mkdirSync(tempDir, { recursive: true });
    execSync(`unzip -q "${docxPath}" -d "${tempDir}"`);
    
    const stylesPath = `${tempDir}/word/styles.xml`;
    let stylesContent = readFileSync(stylesPath, 'utf-8');
    
    // 需要清理的样式 ID
    const styleIds = ['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Normal'];
    
    for (const styleId of styleIds) {
      // 查找所有该样式的定义
      const regex = new RegExp(`<w:style[^>]*w:styleId="${styleId}"[^>]*>[\\s\\S]*?<\\/w:style>`, 'g');
      const matches = [...stylesContent.matchAll(regex)];
      
      if (matches.length > 1) {
        // 保留最后一个匹配（来自 reference.docx）
        const lastMatch = matches[matches.length - 1][0];
        
        // 删除所有匹配
        stylesContent = stylesContent.replace(regex, '___PLACEHOLDER___');
        
        // 替换第一个占位符为最后一个匹配
        stylesContent = stylesContent.replace('___PLACEHOLDER___', lastMatch);
        
        // 删除剩余的占位符
        stylesContent = stylesContent.replace(/___PLACEHOLDER___/g, '');
      }
    }
    
    // 写回 styles.xml
    writeFileSync(stylesPath, stylesContent);
    
    // 重新打包 docx
    const outputPath = `${tempDir}/output.docx`;
    execSync(`cd "${tempDir}" && zip -q -r "${outputPath}" .`);
    
    // 替换原文件
    execSync(`cp "${outputPath}" "${docxPath}"`);
  } finally {
    // 清理临时目录
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  }
}
