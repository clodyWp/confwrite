import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

/**
 * 清理 docx 文件中的重复样式定义
 * 
 * pandoc 使用 --reference-doc 时会保留自己的默认样式，
 * 导致 styles.xml 中出现重复的样式定义。Word 会使用第一个定义，
 * 所以我们的自定义字体可能被覆盖。
 * 
 * 这个函数会删除 pandoc 默认的样式定义，保留 reference.docx 中的样式。
 * 使用 JSZip 原生库，不依赖系统命令行工具。
 */
export async function cleanupDuplicateStyles(docxPath: string): Promise<void> {
  // 读取 docx 文件
  const docxBuffer = readFileSync(docxPath);
  const zip = await JSZip.loadAsync(docxBuffer);
  
  // 读取 styles.xml
  const stylesFile = zip.file('word/styles.xml');
  if (!stylesFile) {
    return; // 没有 styles.xml，跳过
  }
  
  let stylesContent = await stylesFile.async('string');
  
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
  
  // 更新 styles.xml
  zip.file('word/styles.xml', stylesContent);
  
  // 生成新的 docx 文件
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  
  // 写回文件
  writeFileSync(docxPath, outputBuffer);
}
