/**
 * PNG Converter
 * 
 * 将 SVG 转换为 PNG，用于 Word 文档嵌入。
 * 使用 sharp 库进行转换。
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * PNG 验证结果
 */
export interface PngValidationResult {
  valid: boolean;
  size?: number;
  error?: string;
}

/**
 * 将 SVG 文件转换为 PNG
 * 
 * @param svgPath SVG 文件路径
 * @param pngPath PNG 输出路径
 * @throws 转换失败时抛出错误
 */
export async function convertToPng(svgPath: string, pngPath: string): Promise<void> {
  if (!existsSync(svgPath)) {
    throw new Error(`SVG file not found: ${svgPath}`);
  }

  const svgBuffer = readFileSync(svgPath);

  // 确保输出目录存在
  const outputDir = dirname(pngPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 动态导入 sharp（可选依赖）
    const sharp = await import('sharp');
    
    await sharp.default(svgBuffer)
      .png()
      .toFile(pngPath);
  } catch (error) {
    throw new Error(`Failed to convert SVG to PNG: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 验证 PNG 文件
 * 
 * @param pngPath PNG 文件路径
 * @returns 验证结果
 */
export function validatePng(pngPath: string): PngValidationResult {
  if (!existsSync(pngPath)) {
    return {
      valid: false,
      error: `文件不存在: ${pngPath}`,
    };
  }

  const stat = statSync(pngPath);
  
  if (stat.size === 0) {
    return {
      valid: false,
      error: `文件为空: ${pngPath}`,
    };
  }

  return {
    valid: true,
    size: stat.size,
  };
}

/**
 * 批量转换 SVG 到 PNG
 * 
 * @param items 转换项列表
 * @returns 转换结果
 */
export async function batchConvertToPng(
  items: Array<{ svgPath: string; pngPath: string }>
): Promise<{
  success: number;
  failed: number;
  errors: Array<{ path: string; error: string }>;
}> {
  let success = 0;
  let failed = 0;
  const errors: Array<{ path: string; error: string }> = [];

  for (const item of items) {
    try {
      await convertToPng(item.svgPath, item.pngPath);
      success++;
    } catch (error) {
      failed++;
      errors.push({
        path: item.svgPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { success, failed, errors };
}
