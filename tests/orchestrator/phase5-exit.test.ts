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

  it('skips Phase 5 when no diagrams-to-render.json exists', () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6).toBeDefined();
    expect(exitTo6!.condition(ctx)).toBe(true);
  });

  it('does NOT skip when diagrams-to-render.json exists and status is not assembling', () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;

    // Create the diagrams file
    mkdirSync(join(tempDir, 'figures'), { recursive: true });
    writeFileSync(join(tempDir, 'figures', 'diagrams-to-render.json'), '[]', 'utf-8');

    const ctx = { state, projectDir: tempDir };

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6!.condition(ctx)).toBe(false);
  });

  it('skips when status is assembling (diagrams already processed)', () => {
    const state = createState('assembling');
    const phase5 = phases.get('5')!;

    // Even with diagrams file, assembling status means skip
    mkdirSync(join(tempDir, 'figures'), { recursive: true });
    writeFileSync(join(tempDir, 'figures', 'diagrams-to-render.json'), '[]', 'utf-8');

    const ctx = { state, projectDir: tempDir };

    const exitTo6 = phase5.exits.find(e => e.target === '6');
    expect(exitTo6!.condition(ctx)).toBe(true);
  });

  it('execute returns generate_diagrams action', async () => {
    const state = createState('writing');
    const phase5 = phases.get('5')!;
    const ctx = { state, projectDir: tempDir };

    const result = await phase5.execute(ctx);
    expect(result.action).toBe('generate_diagrams');
  });
});
