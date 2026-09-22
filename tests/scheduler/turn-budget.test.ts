import { describe, it, expect } from 'vitest';
import { TurnBudget } from '../../src/scheduler/turn-budget.js';

describe('TurnBudget', () => {
  it('should start with zero count', () => {
    const budget = new TurnBudget(30);
    expect(budget.turns).toBe(0);
    expect(budget.remaining).toBe(30);
    expect(budget.isExceeded).toBe(false);
  });

  it('should increment count on tick', () => {
    const budget = new TurnBudget(30);
    budget.tick();
    expect(budget.turns).toBe(1);
    expect(budget.remaining).toBe(29);
  });

  it('should not be exceeded before limit', () => {
    const budget = new TurnBudget(30);
    for (let i = 0; i < 30; i++) {
      budget.tick();
    }
    expect(budget.turns).toBe(30);
    expect(budget.isExceeded).toBe(false);
  });

  it('should be exceeded after limit', () => {
    const budget = new TurnBudget(30);
    for (let i = 0; i < 31; i++) {
      budget.tick();
    }
    expect(budget.turns).toBe(31);
    expect(budget.isExceeded).toBe(true);
  });

  it('should return warning flag when approaching limit', () => {
    const budget = new TurnBudget(30);
    let warningTriggered = false;
    
    for (let i = 0; i < 30; i++) {
      const result = budget.tick();
      if (result.warning) {
        warningTriggered = true;
      }
    }
    
    expect(warningTriggered).toBe(true);
    expect(budget.turns).toBe(30);
  });

  it('should return exceeded flag when over limit', () => {
    const budget = new TurnBudget(30);
    let exceededTriggered = false;
    
    for (let i = 0; i < 35; i++) {
      const result = budget.tick();
      if (result.exceeded) {
        exceededTriggered = true;
      }
    }
    
    expect(exceededTriggered).toBe(true);
    expect(budget.turns).toBe(35);
  });

  it('should handle custom limit', () => {
    const budget = new TurnBudget(10);
    for (let i = 0; i < 10; i++) {
      budget.tick();
    }
    expect(budget.remaining).toBe(0);
    expect(budget.isExceeded).toBe(false);
    
    budget.tick();
    expect(budget.isExceeded).toBe(true);
  });

  it('should never have negative remaining', () => {
    const budget = new TurnBudget(5);
    for (let i = 0; i < 20; i++) {
      budget.tick();
    }
    expect(budget.remaining).toBe(0);
  });
});
