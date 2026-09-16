import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';

describe('initProject — material copy', () => {
  let tempDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-init-copy-'));
    sourceDir = join(tempDir, 'source-materials');
    mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('copies top-level files from materialSourceDir', () => {
    // Create source files
    writeFileSync(join(sourceDir, 'doc1.md'), '# Doc 1\nContent here.', 'utf-8');
    writeFileSync(join(sourceDir, 'doc2.md'), '# Doc 2\nMore content.', 'utf-8');

    const result = initProject({
      slug: 'copy-test',
      workspaceDir: tempDir,
      materialSourceDir: sourceDir,
    });

    expect(result.success).toBe(true);

    const projectDir = join(tempDir, 'projects', 'copy-test');
    expect(existsSync(join(projectDir, 'reference_material', 'doc1.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material', 'doc2.md'))).toBe(true);

    const copied = readFileSync(join(projectDir, 'reference_material', 'doc1.md'), 'utf-8');
    expect(copied).toContain('Doc 1');
  });

  it('recursively copies subdirectories', () => {
    // Create nested structure
    mkdirSync(join(sourceDir, '01_policy'), { recursive: true });
    mkdirSync(join(sourceDir, '02_tech'), { recursive: true });
    writeFileSync(join(sourceDir, '01_policy', 'policy.md'), '# Policy\nDetails.', 'utf-8');
    writeFileSync(join(sourceDir, '02_tech', 'arch.md'), '# Architecture\nDiagram.', 'utf-8');
    writeFileSync(join(sourceDir, 'overview.md'), '# Overview\nTop level.', 'utf-8');

    const result = initProject({
      slug: 'recursive-test',
      workspaceDir: tempDir,
      materialSourceDir: sourceDir,
    });

    expect(result.success).toBe(true);

    const projectDir = join(tempDir, 'projects', 'recursive-test');
    expect(existsSync(join(projectDir, 'reference_material', 'overview.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material', '01_policy', 'policy.md'))).toBe(true);
    expect(existsSync(join(projectDir, 'reference_material', '02_tech', 'arch.md'))).toBe(true);
  });

  it('handles empty materialSourceDir gracefully', () => {
    const result = initProject({
      slug: 'empty-test',
      workspaceDir: tempDir,
      materialSourceDir: sourceDir, // exists but empty
    });

    expect(result.success).toBe(true);
  });

  it('handles non-existent materialSourceDir gracefully', () => {
    const result = initProject({
      slug: 'nonexist-test',
      workspaceDir: tempDir,
      materialSourceDir: join(tempDir, 'does-not-exist'),
    });

    // Should succeed — materialSourceDir is optional, non-existent is skipped
    expect(result.success).toBe(true);
  });
});
