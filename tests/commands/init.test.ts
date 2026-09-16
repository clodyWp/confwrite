import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject } from '../../src/commands/init.js';

describe('initProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-init-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates project directory structure', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    expect(result.success).toBe(true);

    const projectDir = join(tempDir, 'projects', 'test-project');
    expect(existsSync(projectDir)).toBe(true);

    // Check all required directories
    const requiredDirs = [
      'inputs',
      'inputs/feedback',
      'reference_material',
      'assets',
      'assets/indexes',
      'assets/chapter-kits',
      'drafts',
      'drafts/chapters',
      'review',
      'figures',
      'assembly',
      'output',
    ];

    for (const dir of requiredDirs) {
      expect(existsSync(join(projectDir, dir)), `${dir} should exist`).toBe(true);
    }
  });

  it('creates project-state.json with correct initial values', () => {
    initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const statePath = join(tempDir, 'projects', 'test-project', 'project-state.json');
    expect(existsSync(statePath)).toBe(true);

    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(state.project).toBe('test-project');
    expect(state.currentPhase).toBe('0a');
    expect(state.status).toBe('init');
    expect(state.chapters).toEqual({});
    expect(state.round).toBe(1);
    expect(state.version).toBe(1);
    expect(state.createdAt).toBeDefined();
    expect(state.lastUpdated).toBeDefined();
  });

  it('generates agent-instructions.md', () => {
    initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const instructionsPath = join(tempDir, 'projects', 'test-project', 'inputs', 'agent-instructions.md');
    expect(existsSync(instructionsPath)).toBe(true);

    const content = readFileSync(instructionsPath, 'utf-8');
    expect(content).toContain('写作指引');
    expect(content).toContain('素材包');
    expect(content).toContain('data-baseline.json');
  });

  it('rejects duplicate project slug', () => {
    initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('已存在');
  });

  it('rejects invalid slug with path traversal', () => {
    expect(() => {
      initProject({
        slug: '../etc',
        workspaceDir: tempDir,
      });
    }).toThrow();
  });

  it('rejects empty slug', () => {
    expect(() => {
      initProject({
        slug: '',
        workspaceDir: tempDir,
      });
    }).toThrow();
  });

  it('returns normalized projectDir path', () => {
    const result = initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
    });

    // Should use forward slashes
    expect(result.projectDir).not.toContain('\\');
    expect(result.projectDir).toContain('test-project');
  });

  it('copies requirements file if provided', () => {
    // Create a temp requirements file
    const reqPath = join(tempDir, 'requirements.md');
    const { writeFileSync } = require('node:fs');
    writeFileSync(reqPath, '# Test Requirements\nSome content here.', 'utf-8');

    initProject({
      slug: 'test-project',
      workspaceDir: tempDir,
      requirementsPath: reqPath,
    });

    const copiedPath = join(tempDir, 'projects', 'test-project', 'inputs', 'requirements.md');
    expect(existsSync(copiedPath)).toBe(true);

    const content = readFileSync(copiedPath, 'utf-8');
    expect(content).toContain('Test Requirements');
  });
});
