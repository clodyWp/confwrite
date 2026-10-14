#!/usr/bin/env node
/**
 * Pre-push check script (INV-PC-9, INV-PC-10)
 * 
 * Called by husky pre-push hook.
 * Performs full validation before push:
 * 1. npm run build (blocking)
 * 2. npm test (blocking)
 * 3. npm run docs:check (warning only)
 * 
 * Exit codes: 0 = pass, 1 = fail (blocking)
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const steps = [
  { name: 'Build', cmd: 'npm run build', blocking: true },
  { name: 'Test', cmd: 'npm test', blocking: true },
  { name: 'Docs check', cmd: 'npm run docs:check', blocking: false },
];

let failed = false;

for (const step of steps) {
  console.log(`\n🔍 Running ${step.name}...`);
  try {
    execSync(step.cmd, { cwd: ROOT, stdio: 'inherit' });
    console.log(`✅ ${step.name} passed`);
  } catch {
    if (step.blocking) {
      console.error(`\n❌ Pre-push: ${step.name} failed — push blocked`);
      console.error(`   Fix: resolve the ${step.name.toLowerCase()} errors and try again.`);
      failed = true;
      break;  // Stop at first blocking failure
    } else {
      console.warn(`\n⚠️  Pre-push: ${step.name} failed — warning only (push allowed)`);
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('\n✅ Pre-push checks passed');
