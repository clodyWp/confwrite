import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { phases } from '../../src/orchestrator/phases.js';
import type { ProjectState } from '../../src/state/schema.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createState(status: string = 'writing'): ProjectState {
  return {
    version: 1,
    project: 'test',
    projectDir: '/tmp/test',
    createdAt: '2024-01-01T00:00:00Z',
    lastUpdated: '2024-01-01T00:00:00Z',
    currentPhase: '5',
    status: status as any,
    chapters: {},
    round: 1,
  };
}

describe('Phase 5 — exit conditions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'confwrite-p5-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('exits to Phase 6 when manifest.json exists (diagrams done)', () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    // Create the manifest file (simulating pipeline completion)
    mkdirSync(join(tempDir, 'figures'), { recursive: true });
    writeFileSync(join(tempDir, 'figures', 'manifest.json'), '{"diagrams":[]}', 'utf-8');

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6).toBeDefined();
    expect(exitTo6!.condition(ctx)).toBe(true);
  });

  it('does NOT exit when no manifest.json exists', () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6!.condition(ctx)).toBe(false);
  });

  it('exits when status is assembling (already past diagrams)', () => {
    const state = createState('assembling');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6!.condition(ctx)).toBe(true);
  });

  it('execute runs pipeline and returns diagram count', async () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;

    // Create a chapter with a diagram block (new format)
    mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
    writeFileSync(join(tempDir, 'drafts', 'chapters', 'ch001.md'), `# Ch1

<!-- diagram-start
type: architecture
title: 系统架构
description: |
  客户端 → 服务器
  服务器 → 数据库
diagram-end -->
`, 'utf-8');

    const ctx = { state, projectDir: tempDir };
    const result = await phase5.execute(ctx);

    expect(result.action).toBe('generate_diagrams');
    expect(result.params?.diagramCount).toBe(1);
    expect(result.message).toContain('1 个图表');
  });

  it('execute handles no diagrams', async () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    const result = await phase5.execute(ctx);

    expect(result.action).toBe('generate_diagrams');
    expect(result.params?.diagramCount).toBe(0);
  });
});
