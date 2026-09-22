#!/usr/bin/env node
/**
 * 显示 confwrite 版本信息
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取 package.json
const packagePath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

// 获取 git 信息
let gitCommit = 'unknown';
let gitDate = 'unknown';
try {
  const { execSync } = await import('child_process');
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: __dirname }).trim();
  gitDate = execSync('git log -1 --format=%cd --date=short', { encoding: 'utf-8', cwd: __dirname }).trim();
} catch {
  // 忽略 git 错误
}

console.log(`ConfWrite v${packageJson.version}`);
console.log(`Commit: ${gitCommit} (${gitDate})`);
console.log(`Node: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
