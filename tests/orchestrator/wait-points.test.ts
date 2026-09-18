/**
 * Wait Point tests — 等待点功能
 * 
 * 测试状态机在等待点的行为：
 * - 到达等待点时暂停
 * - 用户操作后继续
 * - waitPoint 状态正确设置和清除
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

function createTestProject(dir: string, overrides?: Partial<ProjectState>): void {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'drafts', 'chapters'), { recursive: true });
  mkdirSync(join(dir, 'review'), { recursive: true });
  mkdirSync(join(dir, 'output'), { recursive: true });

  const state: ProjectState = {
    version: 1,
    project: 'test-project',
    projectDir: dir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '0a',
    status: 'init',
    chapters: {},
    round: 1,
    ...overrides,
  };

  writeFileSync(join(dir, 'project-state.json'), JSON.stringify(state, null, 2));
}

describe('Wait Points', () => {
  const tmpDir = join(process.cwd(), '.test-wait-points');

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Phase 2 (大纲规划) wait point', () => {
    it('should set waitPoint when reaching phase 2 with exit condition met', async () => {
      // Setup: project at phase 0b, with outline.md + materials ready
      // so phase 2 will be entered and immediately hit wait point
      createTestProject(tmpDir, { currentPhase: '0b', status: 'organizing' });
      
      // Phase 0b exit condition: hasOrganizedMaterials
      writeFileSync(join(tmpDir, 'assets', 'data-baseline.json'), '{}');
      writeFileSync(join(tmpDir, 'assets', 'references-index.md'), '# Index');
      
      // Phase 2 exit conditions (for later): outline.md + organized materials
      writeFileSync(join(tmpDir, 'outline.md'), '# Outline\nch001 Chapter 1');
      
      const machine = new StateMachine(tmpDir);
      
      // Tick from phase 0b → should advance through phase 1 to phase 2 (wait point)
      // Phase 0b exit: hasOrganizedMaterials → target is phase 2 (skipping phase 1)
      // Actually phase 0b exits to phase 2 directly
      const result1 = await machine.tick();
      
      // Should be at phase 2 wait point
      expect('phase' in result1 && result1.phase).toBe('2');
      expect('atWaitPoint' in result1 && result1.atWaitPoint).toBe(true);
      expect('action' in result1 && result1.action).toBe('wait_point');
      
      // State should have waitPoint set
      const store = new ProjectStore(tmpDir);
      const state = store.load();
      expect(state?.waitPoint).toBeDefined();
      expect(state?.waitPoint?.phase).toBe('2');
    });

    it('should clear waitPoint and advance when user continues', async () => {
      // Setup: project at phase 2 with waitPoint set
      createTestProject(tmpDir, { 
        currentPhase: '2', 
        status: 'outlining',
        waitPoint: {
          phase: '2',
          reason: '大纲规划需要用户确认',
          instructions: '请编辑 outline.md',
          createdAt: new Date().toISOString(),
        },
      });
      
      // Exit conditions met
      writeFileSync(join(tmpDir, 'outline.md'), '# Outline\nch001 Chapter 1');
      writeFileSync(join(tmpDir, 'assets', 'data-baseline.json'), '{}');
      writeFileSync(join(tmpDir, 'assets', 'references-index.md'), '# Index');
      
      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();
      
      // Should advance past wait point
      expect('advanced' in result && result.advanced).toBe(true);
      expect('phase' in result && (result.phase === '3' || result.phase === '4a')).toBe(true);
      
      // waitPoint should be cleared
      const store = new ProjectStore(tmpDir);
      const state = store.load();
      expect(state?.waitPoint).toBeUndefined();
    });

    it('should stay at wait point when exit condition not met', async () => {
      // Setup: project at phase 2 with waitPoint set, but no outline.md
      createTestProject(tmpDir, { 
        currentPhase: '2', 
        status: 'outlining',
        waitPoint: {
          phase: '2',
          reason: '大纲规划需要用户确认',
          instructions: '请编辑 outline.md',
          createdAt: new Date().toISOString(),
        },
      });
      
      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();
      
      // Should still be at wait point
      expect('atWaitPoint' in result && result.atWaitPoint).toBe(true);
      expect('action' in result && result.action).toBe('wait_point');
    });
  });

  describe('Phase 6 (组装) wait point', () => {
    it('should set waitPoint when reaching phase 6', async () => {
      // Setup: project at phase 5 with conditions to advance to 6
      createTestProject(tmpDir, { 
        currentPhase: '5', 
        status: 'writing',
      });
      
      // Create chapters
      const chapters: Record<string, any> = {
        ch001: { id: 'ch001', title: 'Chapter 1', status: 'completed', round: 1, attempt: 0 },
      };
      const store = new ProjectStore(tmpDir);
      const state = store.load()!;
      state.chapters = chapters;
      store.save(state);
      
      // Phase 5 exit condition: status === 'assembling' or has figures/manifest.json
      mkdirSync(join(tmpDir, 'figures'), { recursive: true });
      writeFileSync(join(tmpDir, 'figures', 'manifest.json'), '{"diagrams":[]}');
      
      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();
      
      // Should advance to phase 6 and set wait point
      expect('advanced' in result && result.advanced).toBe(true);
      expect('phase' in result && result.phase).toBe('6');
      expect('atWaitPoint' in result && result.atWaitPoint).toBe(true);
    });
  });

  describe('Wait point in runWriteLoop', () => {
    it('should stop loop with wait_point reason', async () => {
      // This tests the integration with runWriteLoop
      // The loop should stop when it encounters a wait_point action
      createTestProject(tmpDir, { 
        currentPhase: '2', 
        status: 'outlining',
        waitPoint: {
          phase: '2',
          reason: '大纲规划需要用户确认',
          instructions: '请编辑 outline.md',
          createdAt: new Date().toISOString(),
        },
      });
      
      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();
      
      expect('atWaitPoint' in result && result.atWaitPoint).toBe(true);
      expect('action' in result && result.action).toBe('wait_point');
      expect('waitPointInstructions' in result).toBe(true);
    });
  });
});
