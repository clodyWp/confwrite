#!/usr/bin/env node
/**
 * Pre-commit check script (INV-PC-10: Node.js for cross-platform)
 * 
 * Called by lint-staged with staged .ts files as arguments.
 * Performs:
 * 1. TypeScript compilation check (tsc --noEmit)
 * 2. Related test execution (vitest run <test-file>)
 * 
 * Exit codes: 0 = pass, 1 = fail
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const stagedFiles = process.argv.slice(2);

if (stagedFiles.length === 0) {
  console.log('✅ Pre-commit: No files to check');
  process.exit(0);
}

let hasError = false;

// Step 1: TypeScript compilation check (INV-PC-3)
console.log('🔍 Pre-commit: Running TypeScript compilation check...');
try {
  execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'inherit' });
  console.log('✅ Pre-commit: TypeScript compilation passed');
} catch {
  console.error('\n❌ Pre-commit: TypeScript compilation failed');
  console.error('   Fix: resolve the type errors and try again.');
  hasError = true;
}

// Step 2: Related test check (INV-PC-4)
if (!hasError) {
  const testFilesToRun = [];

  for (const file of stagedFiles) {
    // Only check src/ .ts files (not test files themselves)
    if (!file.startsWith('src/') || !file.endsWith('.ts')) continue;
    if (file.endsWith('.test.ts')) continue;

    // src/foo/bar.ts → tests/foo/bar.test.ts
    const relativePath = relative(join(ROOT, 'src'), file);
    const testPath = join(ROOT, 'tests',
      dirname(relativePath),
      basename(relativePath, '.ts') + '.test.ts');

    if (existsSync(testPath)) {
      testFilesToRun.push(testPath);
    }
  }

  if (testFilesToRun.length > 0) {
    console.log(`\n🔍 Pre-commit: Running ${testFilesToRun.length} related test file(s)...`);
    for (const testPath of testFilesToRun) {
      try {
        execSync(`npx vitest run "${testPath}"`, { cwd: ROOT, stdio: 'inherit' });
      } catch {
        console.error(`\n❌ Pre-commit: Tests failed for ${relative(ROOT, testPath)}`);
        console.error('   Fix: resolve the test failures and try again.');
        hasError = true;
        break;
      }
    }
  }
}

if (hasError) {
  process.exit(1);
}

console.log('\n✅ Pre-commit checks passed');
