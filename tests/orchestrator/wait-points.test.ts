/**
 * Wait Point tests — 等待点功能
 * 
 * 测试状态机在等待点的行为：
 * - 到达等待点时暂停
 * - 用户操作后继续
 * - waitPoint 状态正确设置和清除
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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
      
      // Phase 1 exit condition: requirements.json exists
      writeFileSync(join(tmpDir, 'assets', 'requirements.json'), '[]');
      
      // Phase 2 exit conditions (for later): outline.md + organized materials
      writeFileSync(join(tmpDir, 'outline.md'), '# Outline\nch001 Chapter 1');
      
      const machine = new StateMachine(tmpDir);
      
      // Tick from phase 0b → advance to phase 1 (0b → 1)
      const result0 = await machine.tick();
      expect('phase' in result0 && result0.phase).toBe('1');
      expect('advanced' in result0 && result0.advanced).toBe(true);
      
      // Tick from phase 1 → advance to phase 2 (1 → 2)
      // Phase 2 has waitPoint timing='entry' (default), so waitPoint is set
      // immediately on entry, before execute runs.
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

      // 模拟「用户已确认并续跑」：index.ts 在 runWriteLoop 开头会先清空 waitPoint
      const store0 = new ProjectStore(tmpDir);
      const s0 = store0.load()!;
      s0.waitPoint = undefined;
      store0.save(s0);
      
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

    it('waitPoint 未确认时不得仅因出口条件满足就推进（Bug 10）', async () => {
      // 与上一个测试相同的前置条件，但 **不** 清空 waitPoint
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
      writeFileSync(join(tmpDir, 'outline.md'), '# Outline\nch001 Chapter 1');
      writeFileSync(join(tmpDir, 'assets', 'data-baseline.json'), '{}');
      writeFileSync(join(tmpDir, 'assets', 'references-index.md'), '# Index');

      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();

      // 出口条件虽已满足，但用户尚未确认 → 必须继续暂停
      expect('atWaitPoint' in result && result.atWaitPoint).toBe(true);
      expect('phase' in result && result.phase).toBe('2');
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
    /** phase 5 → 6 的公共 setup（章節草稿 + outline + figures/manifest） */
    function setupPhase5Ready(): void {
      createTestProject(tmpDir, { currentPhase: '5', status: 'writing' });
      writeFileSync(
        join(tmpDir, 'drafts', 'chapters', 'ch001-v1.md'),
        '# 1.1 测试章节\n\n正文内容。\n'
      );
      writeFileSync(join(tmpDir, 'outline.md'), '# 文档\nch001 1.1 测试章节');
      const store = new ProjectStore(tmpDir);
      const state = store.load()!;
      state.chapters = {
        ch001: { id: 'ch001', title: '1.1 测试章节', status: 'completed', round: 1, attempt: 0 },
      } as never;
      store.save(state);
      mkdirSync(join(tmpDir, 'figures'), { recursive: true });
      writeFileSync(join(tmpDir, 'figures', 'manifest.json'), '[]');
    }

    it('到达 phase 6 后应完成组装，再暂停（Bug 10）', async () => {
      setupPhase5Ready();
      const machine = new StateMachine(tmpDir);

      await machine.tick(); // 5 → 6（阶段跳转本身消耗一个 tick）
      await machine.tick(); // 执行组装

      // 关键：组装产物必须已生成 —— 否则用户会被要求审阅一个不存在的文件
      expect(existsSync(join(tmpDir, 'assembly', 'merged-v1.md'))).toBe(true);
    });

    it('组装完成后才返回 wait_point', async () => {
      setupPhase5Ready();
      const machine = new StateMachine(tmpDir);

      await machine.tick(); // 5 → 6（触发器）
      const r2 = await machine.tick(); // 执行组装
      const r3 = await machine.tick(); // 现在才暂停

      expect(existsSync(join(tmpDir, 'assembly', 'merged-v1.md'))).toBe(true);
      expect('atWaitPoint' in r3 && r3.atWaitPoint).toBe(true);
      expect('action' in r3 && r3.action).toBe('wait_point');
      // r2 是执行结果，不应是等待点
      expect('atWaitPoint' in r2 && r2.atWaitPoint).toBeFalsy();
    });

    it('waitPoint 已设置时不得因出口条件满足而跳过暂停', async () => {
      setupPhase5Ready();
      const machine = new StateMachine(tmpDir);

      await machine.tick(); // 5 → 6
      await machine.tick(); // 执行组装，设置 waitPoint
      // 此时 assembly/merged-v1.md 已存在（出口条件已满足）
      expect(existsSync(join(tmpDir, 'assembly', 'merged-v1.md'))).toBe(true);

      // 仍应暂停，而不是直接推进到定稿
      const r3 = await machine.tick();
      expect('atWaitPoint' in r3 && r3.atWaitPoint).toBe(true);
      expect('phase' in r3 && r3.phase).toBe('6');
    });

    it('should set waitPoint when reaching phase 6', async () => {
      setupPhase5Ready();
      const machine = new StateMachine(tmpDir);
      const result = await machine.tick();

      // 跳转本身仍返回 advanced + phase 6（暂停在下一步发生）
      expect('advanced' in result && result.advanced).toBe(true);
      expect('phase' in result && result.phase).toBe('6');
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
