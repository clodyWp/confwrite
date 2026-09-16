import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTempProjectDir(phase: ProjectState['currentPhase'] = '0a', status: ProjectState['status'] = 'init'): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'confwrite-sm-test-'));
  const now = new Date().toISOString();

  const state: ProjectState = {
    version: 1,
    project: 'test-project',
    projectDir: tempDir,
    createdAt: now,
    lastUpdated: now,
    currentPhase: phase,
    status,
    chapters: {},
    round: 1,
    executionLog: [],
  };

  const store = new ProjectStore(tempDir);
  store.save(state);
  return tempDir;
}

describe('StateMachine', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('tick()', () => {
    it('returns blocked if state file does not exist', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'confwrite-sm-test-'));
      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      expect('blocked' in result && result.blocked).toBe(true);
      if ('blocked' in result) {
        expect(result.error).toContain('project-state.json 不存在');
      }
    });

    it('executes phase 0b and returns action (no auto-advance)', async () => {
      tempDir = createTempProjectDir('0b', 'organizing');
      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      expect('blocked' in result).toBe(false);
      if (!('blocked' in result)) {
        expect(result.phase).toBe('0b');
        expect(result.phaseName).toBe('素材整理');
        expect(result.action).toBe('organize_materials');
        expect(result.advanced).toBe(false);
      }
    });

    it('advances from 0a to 0b when status is init', async () => {
      tempDir = createTempProjectDir('0a', 'init');
      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      // Should advance to 0b
      expect('blocked' in result).toBe(false);
      if (!('blocked' in result)) {
        // After advancing from 0a, it should re-tick from 0b
        expect(result.phase).toBe('0b');
        expect(result.advanced).toBe(true);
      }

      // Verify state was updated
      const store = new ProjectStore(tempDir);
      const state = store.load();
      expect(state!.currentPhase).toBe('0b');
    });

    it('stays in 4a when chapters are pending', async () => {
      tempDir = createTempProjectDir('4a', 'writing');
      
      // Add chapters
      const store = new ProjectStore(tempDir);
      store.update((state) => {
        state.chapters = {
          'ch001': { id: 'ch001', title: 'Chapter 1', status: 'pending', version: 0, round: 1, attempt: 0 },
          'ch002': { id: 'ch002', title: 'Chapter 2', status: 'pending', version: 0, round: 1, attempt: 0 },
        };
      });

      // Create outline.md (required for 4a validation)
      writeFileSync(join(tempDir, 'outline.md'), '# Outline\n## Chapter 1\n## Chapter 2', 'utf-8');

      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      expect('blocked' in result).toBe(false);
      if (!('blocked' in result)) {
        expect(result.phase).toBe('4a');
        expect(result.action).toBe('spawn_writers');
        expect(result.params?.chapters).toEqual(['ch001', 'ch002']);
      }
    });

    it('advances from 4a to 4b when all chapters are written', async () => {
      tempDir = createTempProjectDir('4a', 'writing');
      
      const store = new ProjectStore(tempDir);
      store.update((state) => {
        state.chapters = {
          'ch001': { id: 'ch001', title: 'Chapter 1', status: 'written', version: 1, round: 1, attempt: 0 },
          'ch002': { id: 'ch002', title: 'Chapter 2', status: 'written', version: 1, round: 1, attempt: 0 },
        };
      });

      writeFileSync(join(tempDir, 'outline.md'), '# Outline', 'utf-8');

      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      // Should advance to 4b
      expect('blocked' in result).toBe(false);
      if (!('blocked' in result)) {
        expect(result.phase).toBe('4b');
        expect(result.advanced).toBe(true);
      }
    });

    it('returns blocked for 4b when no chapters are written', async () => {
      tempDir = createTempProjectDir('4b', 'reviewing');
      
      const store = new ProjectStore(tempDir);
      store.update((state) => {
        state.chapters = {
          'ch001': { id: 'ch001', title: 'Chapter 1', status: 'pending', version: 0, round: 1, attempt: 0 },
        };
      });

      const machine = new StateMachine(tempDir);
      const result = await machine.tick();

      expect('blocked' in result && result.blocked).toBe(true);
    });

    it('logs phase transitions in executionLog', async () => {
      tempDir = createTempProjectDir('0a', 'init');
      const machine = new StateMachine(tempDir);
      await machine.tick();

      const store = new ProjectStore(tempDir);
      const state = store.load();
      expect(state!.executionLog!.length).toBeGreaterThan(0);
      expect(state!.executionLog![0].action).toContain('0a');
    });
  });

  describe('status()', () => {
    it('returns null if state file does not exist', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'confwrite-sm-test-'));
      const machine = new StateMachine(tempDir);
      expect(machine.status()).toBeNull();
    });

    it('returns current phase info', () => {
      tempDir = createTempProjectDir('4a', 'writing');
      const machine = new StateMachine(tempDir);
      const status = machine.status();

      expect(status).not.toBeNull();
      expect(status!.phase).toBe('4a');
      expect(status!.name).toBe('写作');
      expect(status!.status).toBe('writing');
    });
  });

  describe('forceAdvance()', () => {
    it('forces state to a specific phase', () => {
      tempDir = createTempProjectDir('0a', 'init');
      const machine = new StateMachine(tempDir);
      
      machine.forceAdvance('4a');

      const store = new ProjectStore(tempDir);
      const state = store.load();
      expect(state!.currentPhase).toBe('4a');
    });

    it('throws if state file does not exist', () => {
      tempDir = mkdtempSync(join(tmpdir(), 'confwrite-sm-test-'));
      const machine = new StateMachine(tempDir);
      expect(() => machine.forceAdvance('4a')).toThrow();
    });
  });
});
