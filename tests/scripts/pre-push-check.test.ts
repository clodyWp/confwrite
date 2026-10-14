/**
 * Tests for scripts/pre-push-check.js
 * 
 * Tests the pre-push check script behavior:
 * - INV-PC-9: Full build + test validation before push
 * - INV-PC-10: Cross-platform Node.js script
 */
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'pre-push-check.js');

describe('pre-push-check.js', () => {
  it('script file exists', () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it('INV-PC-10: script is valid Node.js (parses without error)', () => {
    // Verify the script can be parsed by Node.js
    const content = readFileSync(SCRIPT, 'utf-8');
    expect(content).toContain('execSync');
    expect(content).toContain('npm run build');
    expect(content).toContain('npm test');
    expect(content).toContain('npm run docs:check');
  });

  it('INV-PC-9: defines blocking steps (build + test)', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // Build and test should be blocking
    expect(content).toContain("blocking: true");
    // docs:check should be non-blocking
    expect(content).toContain("blocking: false");
  });

  it('INV-PC-10: uses Node.js APIs only (cross-platform)', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // Should use child_process, not bash-specific commands
    expect(content).toContain("import { execSync } from 'child_process'");
    // Should use path.join for paths
    expect(content).toContain("import { join");
    // Should NOT contain bash-only syntax
    expect(content).not.toContain('set -e');
    expect(content).not.toContain('[[');
  });

  it('exits 1 on blocking failure', () => {
    const content = readFileSync(SCRIPT, 'utf-8');
    // Should call process.exit(1) when blocking step fails
    expect(content).toContain('process.exit(1)');
    // Should break on first blocking failure
    expect(content).toContain('break');
  });
});
