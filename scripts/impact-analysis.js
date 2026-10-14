#!/usr/bin/env node
/**
 * 变更影响分析脚本
 * 
 * Issue #94: 变更影响分析工具
 * Spec: specs/impact-analysis.md
 * 
 * 用法：
 *   node scripts/impact-analysis.js [file1] [file2] ...
 *   node scripts/impact-analysis.js --verbose [file1] [file2] ...
 * 
 * 输入：变更文件列表（相对于项目根目录）
 * 输出：受影响的测试文件列表（空格分隔）
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

/**
 * 加载配置文件
 */
function loadConfig() {
  const configPath = join(ROOT, 'scripts', 'impact-analysis-config.json');
  if (!existsSync(configPath)) {
    console.warn('⚠️  配置文件不存在，使用默认配置');
    return getDefaultConfig();
  }
  
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error(`❌ 配置文件格式错误: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 默认配置
 */
function getDefaultConfig() {
  return {
    version: '1.0',
    mirrorMapping: { enabled: true, excludeModules: [] },
    crossModuleDependencies: {},
    globalTests: [],
    excludePatterns: [],
  };
}

/**
 * 提取模块名
 * src/assemble/assembler.ts → 'assemble'
 */
function extractModule(filePath) {
  const parts = filePath.split('/');
  return parts[1]; // src 后的第一级目录
}

/**
 * 提取基础文件名
 * src/assemble/assembler.ts → 'assembler'
 */
function extractBaseName(filePath) {
  return basename(filePath, '.ts');
}

/**
 * 查找镜像测试
 * tests/<module>/<baseName>*.test.ts
 */
function findMirrorTests(module, baseName) {
  const results = [];
  const testDir = join(ROOT, 'tests', module);
  if (!existsSync(testDir)) return results;
  
  try {
    const files = readdirSync(testDir);
    for (const file of files) {
      if (file.startsWith(baseName) && file.endsWith('.test.ts')) {
        results.push(`tests/${module}/${file}`);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

/**
 * 展开目录为具体测试文件
 */
function expandTestDir(dep) {
  const results = [];
  const dirPath = join(ROOT, dep);
  if (!existsSync(dirPath)) return results;
  
  try {
    const files = readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.test.ts')) {
        results.push(`${dep}${file}`);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

/**
 * 查找跨模块依赖
 */
function findCrossModuleTests(filePath, config) {
  const deps = config.crossModuleDependencies[filePath] || [];
  const expanded = [];
  
  for (const dep of deps) {
    if (dep.endsWith('/')) {
      expanded.push(...expandTestDir(dep));
    } else {
      expanded.push(dep);
    }
  }
  
  return expanded;
}

/**
 * 查找目录级别的跨模块依赖
 */
function findDirCrossModuleTests(module, config) {
  const dirKey = `src/${module}/`;
  const deps = config.crossModuleDependencies[dirKey] || [];
  const expanded = [];
  
  for (const dep of deps) {
    if (dep.endsWith('/')) {
      expanded.push(...expandTestDir(dep));
    } else {
      expanded.push(dep);
    }
  }
  
  return expanded;
}

/**
 * 主函数：分析影响
 * 
 * 不变量：
 * - IA-9: 确定性 — 相同输入产生相同输出
 * - IA-10: 幂等性 — 多次运行结果一致
 * - IA-11: 过滤不存在的测试文件
 * - IA-12: 输出去重并排序
 */
function analyzeImpact(changedFiles, config, verbose = false) {
  const affectedTests = new Set();
  
  for (const file of changedFiles) {
    if (verbose) console.log(`\n分析: ${file}`);
    
    // 源码文件
    if (file.startsWith('src/') && file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const module = extractModule(file);
      const baseName = extractBaseName(file);
      
      // 镜像映射 (IA-1, IA-2, IA-3, IA-4)
      if (config.mirrorMapping.enabled && !config.mirrorMapping.excludeModules.includes(module)) {
        const mirrorTests = findMirrorTests(module, baseName);
        if (verbose) console.log(`  镜像测试: ${mirrorTests.length} 个`);
        mirrorTests.forEach(t => affectedTests.add(t));
      }
      
      // 跨模块依赖 (IA-5, IA-6)
      const crossTests = findCrossModuleTests(file, config);
      if (verbose) console.log(`  跨模块测试（文件级）: ${crossTests.length} 个`);
      crossTests.forEach(t => affectedTests.add(t));
      
      // 目录级跨模块依赖
      const dirCrossTests = findDirCrossModuleTests(module, config);
      if (verbose) console.log(`  跨模块测试（目录级）: ${dirCrossTests.length} 个`);
      dirCrossTests.forEach(t => affectedTests.add(t));
    }
    
    // Spec 文件
    else if (file.startsWith('specs/')) {
      affectedTests.add('tests/orchestrator/spec-invariants.test.ts');
      if (verbose) console.log(`  Spec 测试: 1 个`);
    }
  }
  
  // 添加全局测试 (IA-7, IA-8)
  if (changedFiles.some(f => f.startsWith('src/'))) {
    config.globalTests.forEach(t => affectedTests.add(t));
    if (verbose) console.log(`\n全局测试: ${config.globalTests.length} 个`);
  }
  
  // 过滤不存在的文件 (IA-11)，去重并排序 (IA-12)
  const existingTests = Array.from(affectedTests)
    .filter(t => existsSync(join(ROOT, t)))
    .sort();
  
  if (verbose) {
    console.log(`\n总计: ${existingTests.length} 个测试文件`);
    for (const t of existingTests) {
      console.log(`  ${t}`);
    }
  }
  
  return existingTests;
}

// 导出供测试使用
export { analyzeImpact, loadConfig, extractModule, extractBaseName, findMirrorTests, getDefaultConfig };

// CLI 入口（仅在直接运行时执行）
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('impact-analysis.js') ||
  process.argv[1].includes('impact-analysis')
);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length === 0) {
    console.error('用法: node scripts/impact-analysis.js [file1] [file2] ...');
    process.exit(1);
  }

  const config = loadConfig();
  const affectedTests = analyzeImpact(files, config, verbose);

  // 输出结果（空格分隔，便于 CI 使用）
  console.log(affectedTests.join(' '));
}
