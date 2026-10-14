/**
 * SM-20: Phase 4b 退出条件测试
 * 
 * 当所有章节都 failed 时，Phase 4b 必须能正常退出。
 * 
 * E2E v26 事故：所有 7 章节都 failed 后，Phase 4b 卡在 reviewing 状态，
 * 因为退出条件要求 hasProgress（至少一个 completed 或 reviewed）。
 */
import { describe, it, expect } from 'vitest';
import { phase4b } from '../../src/orchestrator/phases.js';
import type { ProjectState } from '../../src/state/schema.js';

describe('SM-20: Phase 4b 退出条件', () => {
  const createMockState = (chapters: Record<string, { status: string }>): ProjectState => {
    return {
      currentPhase: '4b',
      status: 'reviewing',
      round: 1,
      chapters: Object.fromEntries(
        Object.entries(chapters).map(([id, ch]) => [
          id,
          {
            id,
            title: `Chapter ${id}`,
            status: ch.status as any,
            round: 1,
            attempt: 0,
            consecutiveFailures: 0,
            maxRounds: 5,
            type: 'functional',
            wordBudget: { min: 5000, max: 8000 },
            importance: 3,
            description: '',
            style: 'functional',
          }
        ])
      ),
      tasks: [],
    } as ProjectState;
  };

  const mockContext = (state: ProjectState) => ({
    state,
    projectDir: '/tmp/test',
  });

  describe('正常流程', () => {
    it('所有章节 reviewed 时应退出到 4c', () => {
      const state = createMockState({
        ch001: { status: 'reviewed' },
        ch002: { status: 'reviewed' },
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(true);
    });

    it('所有章节 completed 时应退出到 4c', () => {
      const state = createMockState({
        ch001: { status: 'completed' },
        ch002: { status: 'completed' },
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(true);
    });
  });

  describe('E2E v26 回归场景', () => {
    it('所有章节 failed 时应退出到 4c (SM-20)', () => {
      const state = createMockState({
        ch001: { status: 'failed' },
        ch002: { status: 'failed' },
        ch003: { status: 'failed' },
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(true);
    });

    it('混合 failed 和 completed 时应退出到 4c', () => {
      const state = createMockState({
        ch001: { status: 'failed' },
        ch002: { status: 'completed' },
        ch003: { status: 'failed' },
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(true);
    });

    it('混合 failed 和 skipped 时应退出到 4c', () => {
      const state = createMockState({
        ch001: { status: 'failed' },
        ch002: { status: 'skipped' },
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(true);
    });
  });

  describe('不应退出的场景', () => {
    it('有章节 written 时不应退出', () => {
      const state = createMockState({
        ch001: { status: 'reviewed' },
        ch002: { status: 'written' },  // 还在等待审阅
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(false);
    });

    it('有章节 reviewing 时不应退出', () => {
      const state = createMockState({
        ch001: { status: 'reviewed' },
        ch002: { status: 'reviewing' },  // 正在审阅
      });
      const ctx = mockContext(state);
      
      const exitCondition = phase4b.exits[0];
      expect(exitCondition.condition(ctx)).toBe(false);
    });
  });
});
