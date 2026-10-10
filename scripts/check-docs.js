#!/usr/bin/env node
/**
 * 文档一致性检查脚本
 * 
 * 检查项目：
 * 1. src/index.ts 命令 vs SKILL.md 命令列表
 * 2. src/ 目录结构 vs README.md 目录树
 * 3. package.json version vs CHANGELOG.md 最新版本
 * 4. src/ 模块列表 vs AGENTS.md 架构描述
 * 
 * 用法：npm run docs:check
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`❌ ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

// 检查 1: src/index.ts 命令 vs SKILL.md
function checkCommands() {
  console.log('\n📋 检查命令列表...');
  
  const indexPath = join(ROOT, 'src/index.ts');
  const skillPath = join(ROOT, 'SKILL.md');
  
  if (!existsSync(indexPath)) {
    error('src/index.ts 不存在');
    return;
  }
  
  if (!existsSync(skillPath)) {
    error('SKILL.md 不存在');
    return;
  }
  
  const indexContent = readFileSync(indexPath, 'utf-8');
  const skillContent = readFileSync(skillPath, 'utf-8');
  
  // 提取 src/index.ts 中的命令
  const commandRegex = /confwrite:(\w+)/g;
  const commands = new Set();
  let match;
  while ((match = commandRegex.exec(indexContent)) !== null) {
    commands.add(match[1]);
  }
  
  // 检查 SKILL.md 中是否包含所有命令
  for (const cmd of commands) {
    if (!skillContent.includes(`confwrite:${cmd}`)) {
      error(`SKILL.md 缺少命令: confwrite:${cmd}`);
    }
  }
  
  if (errors === 0) {
    ok(`所有 ${commands.size} 个命令都在 SKILL.md 中`);
  }
}

// 检查 2: src/ 目录 vs README.md 目录树
function checkDirectoryStructure() {
  console.log('\n📁 检查目录结构...');
  
  const srcDir = join(ROOT, 'src');
  const readmePath = join(ROOT, 'README.md');
  
  if (!existsSync(srcDir)) {
    error('src/ 目录不存在');
    return;
  }
  
  if (!existsSync(readmePath)) {
    error('README.md 不存在');
    return;
  }
  
  const readmeContent = readFileSync(readmePath, 'utf-8');
  
  // 获取 src/ 下的所有目录
  const srcDirs = readdirSync(srcDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  // 检查 README.md 中是否包含所有目录（匹配 ├── dirname/ 或 src/dirname/）
  for (const dir of srcDirs) {
    const patterns = [`src/${dir}/`, `├── ${dir}/`, `└── ${dir}/`];
    const found = patterns.some(p => readmeContent.includes(p));
    if (!found) {
      error(`README.md 缺少目录: ${dir}/`);
    }
  }
  
  if (errors === 0) {
    ok(`所有 ${srcDirs.length} 个目录都在 README.md 中`);
  }
}

// 检查 3: package.json version vs CHANGELOG.md
function checkVersion() {
  console.log('\n🔖 检查版本号...');
  
  const pkgPath = join(ROOT, 'package.json');
  const changelogPath = join(ROOT, 'CHANGELOG.md');
  
  if (!existsSync(pkgPath)) {
    error('package.json 不存在');
    return;
  }
  
  if (!existsSync(changelogPath)) {
    error('CHANGELOG.md 不存在');
    return;
  }
  
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const changelog = readFileSync(changelogPath, 'utf-8');
  
  if (!changelog.includes(`[${pkg.version}]`)) {
    error(`CHANGELOG.md 缺少版本: ${pkg.version}`);
  } else {
    ok(`CHANGELOG.md 包含当前版本: ${pkg.version}`);
  }
}

// 检查 4: src/ 模块列表 vs AGENTS.md
function checkModules() {
  console.log('\n🏗️  检查模块列表...');
  
  const srcDir = join(ROOT, 'src');
  const agentsPath = join(ROOT, 'AGENTS.md');
  
  if (!existsSync(srcDir)) {
    error('src/ 目录不存在');
    return;
  }
  
  if (!existsSync(agentsPath)) {
    error('AGENTS.md 不存在');
    return;
  }
  
  const agentsContent = readFileSync(agentsPath, 'utf-8');
  
  // 获取 src/ 下的所有目录
  const srcDirs = readdirSync(srcDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  
  // 检查 AGENTS.md 中是否包含所有目录
  for (const dir of srcDirs) {
    if (!agentsContent.includes(`${dir}/`)) {
      warn(`AGENTS.md 可能缺少目录: ${dir}/`);
    }
  }
  
  if (warnings === 0) {
    ok(`所有 ${srcDirs.length} 个目录都在 AGENTS.md 中`);
  }
}

// 主流程
console.log('🔍 开始文档一致性检查...\n');

checkCommands();
checkDirectoryStructure();
checkVersion();
checkModules();

console.log('\n' + '='.repeat(50));
console.log(`检查结果: ${errors} 个错误, ${warnings} 个警告`);

if (errors > 0) {
  console.error('\n❌ 文档一致性检查失败');
  process.exit(1);
}

if (warnings > 0) {
  console.warn('\n⚠️  检查通过，但有警告');
  process.exit(0);
}

console.log('\n✅ 文档一致性检查通过');
process.exit(0);
