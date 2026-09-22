import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnBudget } from '../../src/scheduler/turn-budget.js';
import { LoopDetector } from '../../src/scheduler/loop-detector.js';
import { EventBus } from '../../src/logging/event-bus.js';

describe('Budget & Loop Control Integration', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('should track tool calls and emit events', () => {
    const budget = new TurnBudget(30);
    const loopDetector = new LoopDetector();
    
    const toolCallEvents: any[] = [];
    eventBus.subscribe('tool.call', (event) => {
      toolCallEvents.push(event);
    });

    // Simulate 3 tool calls
    for (let i = 0; i < 3; i++) {
      const budgetResult = budget.tick();
      const loopResult = loopDetector.record('bash', `cmd${i}`);
      
      eventBus.emit({
        type: 'tool.call',
        taskId: 'test-task',
        toolName: 'bash',
        commandPrefix: `cmd${i}`,
        callCount: budget.turns,
      });
    }

    expect(toolCallEvents).toHaveLength(3);
    expect(budget.turns).toBe(3);
  });

  it('should emit budget.warning when approaching limit', () => {
    const budget = new TurnBudget(30);
    
    const warningEvents: any[] = [];
    eventBus.subscribe('budget.warning', (event) => {
      warningEvents.push(event);
    });

    // Simulate 25 tool calls (warning threshold)
    for (let i = 0; i < 25; i++) {
      const result = budget.tick();
      if (result.warning) {
        eventBus.emit({
          type: 'budget.warning',
          taskId: 'test-task',
          warningType: 'approaching_limit',
          currentCount: budget.turns,
          limit: 30,
        });
      }
    }

    expect(warningEvents).toHaveLength(1);
    expect(warningEvents[0].currentCount).toBe(25);
    expect(warningEvents[0].limit).toBe(30);
  });

  it('should emit budget.exceeded when over limit', () => {
    const budget = new TurnBudget(30);
    
    const exceededEvents: any[] = [];
    eventBus.subscribe('budget.exceeded', (event) => {
      exceededEvents.push(event);
    });

    // Simulate 31 tool calls (over limit)
    for (let i = 0; i < 31; i++) {
      const result = budget.tick();
      if (result.exceeded) {
        eventBus.emit({
          type: 'budget.exceeded',
          taskId: 'test-task',
          totalCalls: budget.turns,
          limit: 30,
          action: 'completed_with_warning',
        });
      }
    }

    expect(exceededEvents).toHaveLength(1);
    expect(exceededEvents[0].totalCalls).toBe(31);
    expect(exceededEvents[0].action).toBe('completed_with_warning');
  });

  it('should emit loop.detected warning at 3 consecutive calls', () => {
    const loopDetector = new LoopDetector();
    
    const loopEvents: any[] = [];
    eventBus.subscribe('loop.detected', (event) => {
      loopEvents.push(event);
    });

    // Simulate 3 consecutive same tool calls
    for (let i = 0; i < 3; i++) {
      const result = loopDetector.record('bash', 'python3 -c "count words"');
      if (result.isWarning) {
        eventBus.emit({
          type: 'loop.detected',
          taskId: 'test-task',
          toolName: 'bash',
          commandPrefix: 'python3 -c "count words"',
          consecutiveCount: result.consecutiveCount,
          action: 'warning',
        });
      }
    }

    expect(loopEvents).toHaveLength(1);
    expect(loopEvents[0].consecutiveCount).toBe(3);
    expect(loopEvents[0].action).toBe('warning');
  });

  it('should emit loop.detected terminated at 5 consecutive calls', () => {
    const loopDetector = new LoopDetector();
    
    const loopEvents: any[] = [];
    eventBus.subscribe('loop.detected', (event) => {
      loopEvents.push(event);
    });

    // Simulate 5 consecutive same tool calls
    for (let i = 0; i < 5; i++) {
      const result = loopDetector.record('bash', 'python3 -c "count words"');
      if (result.isWarning || result.isTerminated) {
        eventBus.emit({
          type: 'loop.detected',
          taskId: 'test-task',
          toolName: 'bash',
          commandPrefix: 'python3 -c "count words"',
          consecutiveCount: result.consecutiveCount,
          action: result.isTerminated ? 'terminated' : 'warning',
        });
      }
    }

    expect(loopEvents).toHaveLength(2); // 1 warning + 1 terminated
    expect(loopEvents[0].action).toBe('warning');
    expect(loopEvents[1].action).toBe('terminated');
  });
});
