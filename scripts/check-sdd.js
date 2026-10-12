#!/usr/bin/env node
/**
 * SDD 合规性检查脚本
 * 
 * 检查 agent 是否遵循了 Spec-Driven Development 流程：
 * 1. 改了状态机代码 → spec 是否更新
 * 2. 改了源码 → 测试是否更新
 * 3. commit message 是否引用 spec ID
 * 
 * 用法：
 *   node scripts/check-sdd.js                    # 检查最近一次 commit
 *   node scripts/check-sdd.js HEAD~3..HEAD       # 检查最近 3 个 commit
 *   node scripts/check-sdd.js main..feature/xxx  # 检查分支差异
 * 
 * 集成到 CI：
 *   npm run sdd:check   (等同于 node scripts/check-sdd.js HEAD~1..HEAD)
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
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

function getDiff(range) {
  try {
    return execSync(`git diff --name-only ${range}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function getCommitMessages(range) {
  try {
    return execSync(`git log --format="%s" ${range}`, { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function getChangedFiles(range) {
  const diff = getDiff(range);
  if (!diff) return [];
  return diff.split('\n').filter(Boolean);
}

// 检查 1: 状态机代码改动 → spec 是否更新
function checkStateMachineSpec(files) {
  console.log('\n📋 检查状态机 spec 覆盖...');

  const smFiles = files.filter(f =>
    f.startsWith('src/orchestrator/') ||
    f.startsWith('src/state/')
  );

  if (smFiles.length === 0) {
    ok('无状态机代码改动，跳过');
    return;
  }

  const specUpdated = files.some(f =>
    f === 'specs/state-machine.md'
  );

  if (specUpdated) {
    ok(`状态机代码改动 (${smFiles.length} 个文件) + spec 已更新`);
  } else {
    error(
      `状态机代码改动 (${smFiles.join(', ')}) 但 specs/state-machine.md 未更新\n` +
      `   → 如果改动影响行为，必须更新 spec`
    );
  }
}

// 检查 2: 源码改动 → 测试是否更新
function checkTestCoverage(files) {
  console.log('\n🧪 检查测试覆盖...');

  const srcFiles = files.filter(f =>
    f.startsWith('src/') && f.endsWith('.ts') && !f.endsWith('.d.ts')
  );

  if (srcFiles.length === 0) {
    ok('无源码改动，跳过');
    return;
  }

  const testFiles = files.filter(f =>
    f.startsWith('tests/') && f.endsWith('.test.ts')
  );

  if (testFiles.length === 0) {
    warn(`源码改动 (${srcFiles.length} 个文件) 但无测试更新`);
  } else {
    ok(`源码改动 (${srcFiles.length} 个文件) + 测试已更新 (${testFiles.length} 个)`);
  }
}

// 检查 3: commit message 是否引用 spec ID
function checkCommitMessage(range) {
  console.log('\n📝 检查 commit message spec 引用...');

  const messages = getCommitMessages(range);
  if (!messages) {
    warn('无法获取 commit message');
    return;
  }

  // 检查是否包含 spec ID (如 SM-1, MC-4, WB-2)
  const specIdPattern = /\b(SM|MC|WB|CS|P[1-8])-\d+\b/;
  const hasSpecRef = specIdPattern.test(messages);

  if (hasSpecRef) {
    ok('commit message 引用了 spec ID');
  } else {
    // 只有改了 src/ 才需要 spec 引用
    const files = getChangedFiles(range);
    const hasSrcChange = files.some(f => f.startsWith('src/'));

    if (hasSrcChange) {
      warn(
        'commit message 未引用 spec ID (如 SM-1, MC-4)\n' +
        '   → 建议在 commit message 中注明受影响的 spec 不变量'
      );
    } else {
      ok('无源码改动，无需 spec 引用');
    }
  }
}

// 检查 4: spec 不变量测试是否通过
function checkSpecTests() {
  console.log('\n🔬 检查 spec 不变量测试...');

  const specTestPath = join(ROOT, 'tests/orchestrator/spec-invariants.test.ts');
  if (!existsSync(specTestPath)) {
    error('spec 不变量测试文件不存在: tests/orchestrator/spec-invariants.test.ts');
    return;
  }

  try {
    const result = execSync(
      'npx vitest run tests/orchestrator/spec-invariants.test.ts --reporter=basic',
      { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }
    );
    
    // 检查是否有 "passed"
    if (result.includes('passed')) {
      const match = result.match(/(\d+)\s+passed/);
      if (match) {
        ok(`spec 不变量测试通过 (${match[1]} 个)`);
      } else {
        ok('spec 不变量测试通过');
      }
    } else {
      error('spec 不变量测试未通过');
    }
  } catch (err) {
    error(`spec 不变量测试失败: ${err.message.split('\n')[0]}`);
  }
}

// 主流程
// CI 环境中检查 PR 范围内的所有 commits
// 本地环境检查最近一次 commit
let range = process.argv[2];

if (!range) {
  // 检查是否在 CI 环境
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  if (isCI) {
    // GitHub Actions 中，检查 PR 的所有 commits
    // 使用 GITHUB_BASE_REF 和 GITHUB_HEAD_REF
    const baseRef = process.env.GITHUB_BASE_REF;
    const headRef = process.env.GITHUB_HEAD_REF;
    
    if (baseRef && headRef) {
      range = `origin/${baseRef}...HEAD`;
    } else {
      // 非 PR 的 push（如直接 push 到 master）
      range = 'HEAD~1..HEAD';
    }
  } else {
    range = 'HEAD~1..HEAD';
  }
}

console.log(`🔍 SDD 合规性检查 (${range})\n`);
console.log('='.repeat(50));

const files = getChangedFiles(range);

if (files.length === 0) {
  console.log('无文件改动，跳过检查');
  process.exit(0);
}

console.log(`\n改动的文件 (${files.length} 个):`);
files.slice(0, 10).forEach(f => console.log(`  ${f}`));
if (files.length > 10) {
  console.log(`  ... 还有 ${files.length - 10} 个`);
}

checkStateMachineSpec(files);
checkTestCoverage(files);
checkCommitMessage(range);
checkSpecTests();

console.log('\n' + '='.repeat(50));
console.log(`检查结果: ${errors} 个错误, ${warnings} 个警告`);

if (errors > 0) {
  console.error('\n❌ SDD 合规性检查失败');
  console.error('   请确保：');
  console.error('   1. 状态机代码改动时更新 specs/state-machine.md');
  console.error('   2. 源码改动时有对应的测试更新');
  console.error('   3. commit message 引用受影响的 spec ID');
  process.exit(1);
}

if (warnings > 0) {
  console.warn('\n⚠️  检查通过，但有警告');
  process.exit(0);
}

console.log('\n✅ SDD 合规性检查通过');
process.exit(0);
