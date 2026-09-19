import { describe, it, expect } from 'vitest';
import { TurnBudget, classifyOutcome } from '../../src/scheduler/pi-executor.js';

/**
 * Turn 硬预算（feat/tool-least-privilege）
 *
 * 工具最小权限消除了「字数校验」这一具体循环，但迭代不止这一种形态。
 * 预算是一道与具体病理无关的兜底：无论模型出于什么理由反复折腾，
 * 都不可能无限进行下去。
 *
 * 关键风险：abort() 之后 stopReason 可能仍是 'stop'，若判定顺序写错，
 * 被中止的任务会被当成成功 —— 那样预算就形同虚设。故 classifyOutcome
 * 的顺序被单独测试。
 */
describe('TurnBudget', () => {
  describe('限额生效', () => {
    it('未超限时 tick() 返回 false', () => {
      const b = new TurnBudget(3);
      expect(b.tick()).toBe(false); // 1
      expect(b.tick()).toBe(false); // 2
      expect(b.tick()).toBe(false); // 3
    });

    it('恰好超过限额时 tick() 返回 true', () => {
      const b = new TurnBudget(3);
      b.tick(); b.tick(); b.tick();
      expect(b.tick()).toBe(true); // 第 4 次
    });

    it('超限后持续返回 true', () => {
      const b = new TurnBudget(2);
      b.tick(); b.tick();
      expect(b.tick()).toBe(true);
      expect(b.tick()).toBe(true);
    });

    it('max=1 时只允许 1 个 turn', () => {
      const b = new TurnBudget(1);
      expect(b.tick()).toBe(false);
      expect(b.tick()).toBe(true);
    });
  });

  describe('不限模式', () => {
    it('max 为 undefined 时永不超限', () => {
      const b = new TurnBudget(undefined);
      for (let i = 0; i < 100; i++) expect(b.tick()).toBe(false);
    });

    it('max 为 0 时永不超限', () => {
      const b = new TurnBudget(0);
      for (let i = 0; i < 100; i++) expect(b.tick()).toBe(false);
    });

    it('max 为负数时永不超限', () => {
      const b = new TurnBudget(-1);
      for (let i = 0; i < 100; i++) expect(b.tick()).toBe(false);
    });
  });

  describe('计数与状态', () => {
    it('turns 准确反映已发生的 turn 数', () => {
      const b = new TurnBudget(10);
      expect(b.turns).toBe(0);
      b.tick();
      expect(b.turns).toBe(1);
      b.tick();
      expect(b.turns).toBe(2);
    });

    it('limit 在不限模式下为 0', () => {
      expect(new TurnBudget(undefined).limit).toBe(0);
      expect(new TurnBudget(0).limit).toBe(0);
      expect(new TurnBudget(-5).limit).toBe(0);
    });

    it('limit 在有额模式下等于设定值', () => {
      expect(new TurnBudget(40).limit).toBe(40);
    });

    it('exceeded 在超限前为 false，超限后为 true', () => {
      const b = new TurnBudget(2);
      b.tick();
      expect(b.exceeded).toBe(false);
      b.tick();
      expect(b.exceeded).toBe(false); // 正好用满
      b.tick();
      expect(b.exceeded).toBe(true);
    });

    it('不限模式下 exceeded 恒为 false', () => {
      const b = new TurnBudget(0);
      for (let i = 0; i < 50; i++) b.tick();
      expect(b.exceeded).toBe(false);
    });
  });
});

describe('classifyOutcome', () => {
  const base = {
    hasAssistantMessage: true,
    budgetExhausted: false,
    turnCount: 5,
    maxTurns: 40,
    stopReason: 'stop' as string | undefined,
    errorMessage: undefined as string | undefined,
    textOutput: '完成了',
  };

  describe('关键：预算中止必须判失败', () => {
    it('预算耗尽 + stopReason=stop → 失败（防漏判）', () => {
      const r = classifyOutcome({ ...base, budgetExhausted: true, stopReason: 'stop' });
      expect(r.success).toBe(false);
      expect(r.output).toContain('budget');
    });

    it('预算耗尽 + stopReason=toolUse → 失败', () => {
      const r = classifyOutcome({ ...base, budgetExhausted: true, stopReason: 'toolUse' });
      expect(r.success).toBe(false);
    });

    it('预算耗尽的输出包含实际与上限 turn 数', () => {
      const r = classifyOutcome({
        ...base, budgetExhausted: true, turnCount: 41, maxTurns: 40,
      });
      expect(r.output).toContain('41');
      expect(r.output).toContain('40');
    });

    it('预算优先级高于 stopReason 错误判定', () => {
      const r = classifyOutcome({
        ...base, budgetExhausted: true, stopReason: 'error', errorMessage: 'boom',
      });
      expect(r.success).toBe(false);
      expect(r.output).toContain('budget');
    });
  });

  describe('正常路径', () => {
    it('stopReason=stop → 成功', () => {
      const r = classifyOutcome({ ...base });
      expect(r.success).toBe(true);
      expect(r.output).toBe('完成了');
    });

    it('stopReason=toolUse → 成功（现有语义）', () => {
      const r = classifyOutcome({ ...base, stopReason: 'toolUse' });
      expect(r.success).toBe(true);
    });

    it('无文本输出时成功但 output 为空串', () => {
      const r = classifyOutcome({ ...base, textOutput: undefined });
      expect(r.success).toBe(true);
      expect(r.output).toBe('');
    });
  });

  describe('既有失败路径不得回归', () => {
    it('无 assistant 消息 → 失败', () => {
      const r = classifyOutcome({ ...base, hasAssistantMessage: false });
      expect(r.success).toBe(false);
      expect(r.output).toContain('No assistant response');
    });

    it('stopReason=error → 失败', () => {
      const r = classifyOutcome({ ...base, stopReason: 'error' });
      expect(r.success).toBe(false);
      expect(r.output).toContain('LLM error');
    });

    it('errorMessage 存在 → 失败', () => {
      const r = classifyOutcome({ ...base, errorMessage: 'rate limited' });
      expect(r.success).toBe(false);
      expect(r.output).toContain('rate limited');
    });

    it('无 assistant 消息优先于预算判定', () => {
      const r = classifyOutcome({
        ...base, hasAssistantMessage: false, budgetExhausted: true,
      });
      expect(r.success).toBe(false);
    });
  });
});
