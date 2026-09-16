import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'confwrite-test-'));
}

function createMinimalState(projectDir: string): ProjectState {
  return {
    version: 1,
    project: 'test-project',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '0a',
    status: 'init',
    chapters: {},
    round: 1,
  };
}

describe('ProjectStore', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('save + load', () => {
    it('saves and loads state correctly', () => {
      const store = new ProjectStore(tempDir);
      const state = createMinimalState(tempDir);

      store.save(state);
      const loaded = store.load();

      expect(loaded).not.toBeNull();
      expect(loaded!.project).toBe('test-project');
      expect(loaded!.currentPhase).toBe('0a');
      expect(loaded!.status).toBe('init');
    });

    it('updates lastUpdated on save', () => {
      const store = new ProjectStore(tempDir);
      const state = createMinimalState(tempDir);

      // Set a known old timestamp
      state.lastUpdated = '2020-01-01T00:00:00.000Z';
      store.save(state);

      const loaded = store.load();
      // save() should overwrite with current time, not the old value
      expect(loaded!.lastUpdated).not.toBe('2020-01-01T00:00:00.000Z');
      expect(new Date(loaded!.lastUpdated).getTime()).toBeGreaterThan(
        new Date('2020-01-01T00:00:00.000Z').getTime()
      );
    });

    it('writes valid JSON to disk', () => {
      const store = new ProjectStore(tempDir);
      const state = createMinimalState(tempDir);

      store.save(state);

      const raw = readFileSync(join(tempDir, 'project-state.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.project).toBe('test-project');
    });
  });

  describe('load', () => {
    it('returns null if state file does not exist', () => {
      const store = new ProjectStore(tempDir);
      expect(store.load()).toBeNull();
    });

    it('throws on corrupted JSON', () => {
      writeFileSync(join(tempDir, 'project-state.json'), '{ invalid json', 'utf-8');
      const store = new ProjectStore(tempDir);
      expect(() => store.load()).toThrow('Failed to load state');
    });

    it('loads existing state from disk', () => {
      const state = createMinimalState(tempDir);
      state.currentPhase = '4a';
      writeFileSync(
        join(tempDir, 'project-state.json'),
        JSON.stringify(state, null, 2),
        'utf-8'
      );

      const store = new ProjectStore(tempDir);
      const loaded = store.load();
      expect(loaded!.currentPhase).toBe('4a');
    });
  });

  describe('update', () => {
    it('applies mutator and saves', () => {
      const store = new ProjectStore(tempDir);
      store.save(createMinimalState(tempDir));

      store.update((state) => {
        state.currentPhase = '2';
        state.status = 'outlining';
      });

      const loaded = store.load();
      expect(loaded!.currentPhase).toBe('2');
      expect(loaded!.status).toBe('outlining');
    });

    it('throws if state file does not exist', () => {
      const store = new ProjectStore(tempDir);
      expect(() => store.update(() => {})).toThrow('State file not found');
    });
  });

  describe('get', () => {
    it('throws if not loaded', () => {
      const store = new ProjectStore(tempDir);
      expect(() => store.get()).toThrow('not loaded');
    });

    it('returns in-memory state after load', () => {
      const store = new ProjectStore(tempDir);
      store.save(createMinimalState(tempDir));
      store.load();
      const state = store.get();
      expect(state.project).toBe('test-project');
    });
  });

  describe('exists', () => {
    it('returns false when no state file', () => {
      const store = new ProjectStore(tempDir);
      expect(store.exists()).toBe(false);
    });

    it('returns true after save', () => {
      const store = new ProjectStore(tempDir);
      store.save(createMinimalState(tempDir));
      expect(store.exists()).toBe(true);
    });
  });

  describe('atomic write', () => {
    it('does not leave .tmp file after successful save', () => {
      const store = new ProjectStore(tempDir);
      store.save(createMinimalState(tempDir));

      expect(existsSync(join(tempDir, 'project-state.json.tmp'))).toBe(false);
      expect(existsSync(join(tempDir, 'project-state.json'))).toBe(true);
    });
  });
});
