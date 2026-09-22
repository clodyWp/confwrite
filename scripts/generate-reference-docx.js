#!/usr/bin/env node
/**
 * 生成 Word 参考文档模板
 * 
 * 该脚本创建一个自定义的 reference.docx，包含：
 * 1. 正确的多级列表样式（无序/有序）
 * 2. 完整的文档样式（字体、字号、行距、标题等）
 * 3. 适合中文技术文档的排版规范
 * 
 * 使用方法：
 *   node scripts/generate-reference-docx.js [output-path]
 * 
 * 默认输出到 templates/reference.docx
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outputPath = process.argv[2] || 'templates/reference.docx';
const outputDir = dirname(outputPath);

// 确保输出目录存在
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// 创建临时目录
const tempDir = '/tmp/confwrite-reference-docx';
if (existsSync(tempDir)) {
  rmSync(tempDir, { recursive: true });
}
mkdirSync(tempDir, { recursive: true });

// 创建包含多级列表示例的 markdown
const sampleMarkdown = `# 参考文档

## 无序列表

- 第一级
  - 第二级
    - 第三级

## 有序列表

1. 第一项
   1. 子项
      1. 子子项
   2. 另一个子项
2. 第二项

## 混合列表

1. 有序第一项
   - 无序子项
   - 另一个无序子项
2. 有序第二项
`;

writeFileSync(`${tempDir}/sample.md`, sampleMarkdown);

// 使用 pandoc 生成默认 reference doc
try {
  execSync(`pandoc -o "${tempDir}/default-reference.docx" --print-default-data-file reference.docx`, {
    stdio: 'pipe'
  });
} catch (error) {
  console.error('无法生成默认 reference doc，请确保已安装 pandoc');
  process.exit(1);
}

// 解压 reference doc
execSync(`unzip -q "${tempDir}/default-reference.docx" -d "${tempDir}/docx-content"`);

// 创建自定义 numbering.xml - 定义正确的多级列表样式
const customNumberingXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  
  <!-- 无序列表定义：使用标准项目符号 -->
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="00000001"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    
    <!-- 第一级：实心圆点 -->
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x2022;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <!-- 第二级：空心圆圈 -->
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="o"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="1440" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <!-- 第三级：实心方块 -->
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x25A0;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="2160" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <!-- 第四级到第九级：重复使用第一级样式 -->
    <w:lvl w:ilvl="3">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x2022;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="2880" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <w:lvl w:ilvl="4">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="o"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="3600" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <w:lvl w:ilvl="5">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x25A0;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="4320" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <w:lvl w:ilvl="6">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x2022;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="5040" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <w:lvl w:ilvl="7">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="o"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="5760" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:hint="default"/>
      </w:rPr>
    </w:lvl>
    
    <w:lvl w:ilvl="8">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="&#x25A0;"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="6480" w:hanging="360"/>
      </w:pPr>
      <w:rPr>
        <w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings" w:hint="default"/>
      </w:rPr>
    </w:lvl>
  </w:abstractNum>
  
  <!-- 有序列表定义：使用多级编号格式 -->
  <w:abstractNum w:abstractNumId="1">
    <w:nsid w:val="00000002"/>
    <w:multiLevelType w:val="hybridMultilevel"/>
    
    <!-- 第一级：1. 2. 3. -->
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <!-- 第二级：1.1 1.2 1.3 -->
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="1440" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <!-- 第三级：1.1.1 1.1.2 -->
    <w:lvl w:ilvl="2">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="2160" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <!-- 第四级到第九级 -->
    <w:lvl w:ilvl="3">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="2880" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <w:lvl w:ilvl="4">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4.%5."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="3600" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <w:lvl w:ilvl="5">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4.%5.%6."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="4320" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <w:lvl w:ilvl="6">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4.%5.%6.%7."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="5040" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <w:lvl w:ilvl="7">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4.%5.%6.%7.%8."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="5760" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    
    <w:lvl w:ilvl="8">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1.%2.%3.%4.%5.%6.%7.%8.%9."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="6480" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
  </w:abstractNum>
  
  <!-- 列表实例引用 -->
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
  
  <w:num w:numId="2">
    <w:abstractNumId w:val="1"/>
  </w:num>
  
</w:numbering>
`;

writeFileSync(`${tempDir}/docx-content/word/numbering.xml`, customNumberingXml);

// 读取并修改 styles.xml
const stylesPath = `${tempDir}/docx-content/word/styles.xml`;
let stylesContent = readFileSync(stylesPath, 'utf-8');

// 修改 Normal 样式（正文）
// 使用字体回退机制：优先 Windows 字体，回退到 Noto CJK
stylesContent = stylesContent.replace(
  /<w:style w:type="paragraph" w:default="1" w:styleId="Normal">[\s\S]*?<\/w:style>/,
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:widowControl w:val="0"/>
      <w:spacing w:line="360" w:line-rule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman" w:cs="Times New Roman">
        <w:altName w:val="Noto Serif CJK SC"/>
      </w:rFonts>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>`
);

// 添加或修改标题样式
// 使用字体回退机制，确保跨平台兼容
const headingStyles = `
  <!-- 标题1：三号黑体，回退到思源黑体 -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading1Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="340" w:after="330" w:line="578" w:line-rule="auto"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体">
        <w:altName w:val="Noto Sans CJK SC"/>
      </w:rFonts>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
  
  <!-- 标题2：四号黑体，回退到思源黑体 -->
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading2Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="260" w:after="260" w:line="416" w:line-rule="auto"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体">
        <w:altName w:val="Noto Sans CJK SC"/>
      </w:rFonts>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="28"/>
      <w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
  
  <!-- 标题3：小四号黑体，回退到思源黑体 -->
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading3Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="220" w:after="220" w:line="360" w:line-rule="auto"/>
      <w:outlineLvl w:val="2"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="黑体" w:eastAsia="黑体" w:hAnsi="黑体">
        <w:altName w:val="Noto Sans CJK SC"/>
      </w:rFonts>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  
  <!-- 标题4：小四号楷体，回退到思源黑体（Linux 通常没有楷体） -->
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading4Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="200" w:after="200" w:line="360" w:line-rule="auto"/>
      <w:outlineLvl w:val="3"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="楷体" w:eastAsia="楷体" w:hAnsi="楷体">
        <w:altName w:val="Noto Sans CJK SC"/>
      </w:rFonts>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  
  <!-- 列表段落样式 -->
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:link w:val="ListParagraphChar"/>
    <w:uiPriority w:val="34"/>
    <w:qFormat/>
    <w:pPr>
      <w:ind w:left="720"/>
      <w:contextualSpacing/>
    </w:pPr>
  </w:style>
  
  <w:style w:type="character" w:styleId="ListParagraphChar">
    <w:name w:val="List Paragraph Char"/>
    <w:basedOn w:val="DefaultParagraphFont"/>
    <w:link w:val="ListParagraph"/>
    <w:uiPriority w:val="34"/>
  </w:style>
`;

// 在 </w:styles> 之前插入标题样式
stylesContent = stylesContent.replace('</w:styles>', `${headingStyles}\n</w:styles>`);

writeFileSync(stylesPath, stylesContent);

// 重新打包为 docx
execSync(`cd "${tempDir}/docx-content" && zip -q -r "${tempDir}/custom-reference.docx" .`);

// 复制到目标位置
const resolvedOutputPath = resolve(outputPath);
execSync(`cp "${tempDir}/custom-reference.docx" "${resolvedOutputPath}"`);

// 清理临时文件
rmSync(tempDir, { recursive: true });

console.log(`✓ 已生成参考文档：${resolvedOutputPath}`);
console.log('');
console.log('跨平台字体配置（使用字体回退机制）：');
console.log('  - 正文：宋体 → Noto Serif CJK SC（思源宋体）');
console.log('  - 标题1-3：黑体 → Noto Sans CJK SC（思源黑体）');
console.log('  - 标题4：楷体 → Noto Sans CJK SC（思源黑体）');
console.log('  - 西文：Times New Roman');
console.log('');
console.log('字体回退机制说明：');
console.log('  - Windows 系统：使用宋体、黑体、楷体');
console.log('  - Linux 系统：自动回退到 Noto CJK 字体');
console.log('  - macOS 系统：使用系统默认中文字体');
console.log('');
console.log('使用方法：');
console.log(`  pandoc input.md -o output.docx --reference-doc=${resolvedOutputPath}`);
