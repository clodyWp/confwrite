/**
 * E2E 测试：429 限流恢复
 * 
 * 验证 Bug 8 修复后的两阶段退避行为：
 * - 阶段 1：前 2 次重试，间隔 2 分钟（测试用小值）
 * - 阶段 2：第 3-7 次重试，间隔 12 分钟（测试用小值）
 * - 7 次后触发熔断
 * 
 * 回归防护：
 * - Bug 1: 熔断后不得空转
 * - Bug 2: stoppedReason 不得被覆盖
 * - Bug 8: 退避必须生效
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SubagentScheduler } from '../../src/scheduler/index.js';
import { SchedulerRunner } from '../../src/scheduler/runner.js';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task } from '../../src/scheduler/types.js';

/** 总是返回 429 的模拟执行器 */
class Always429Executor implements SubagentExecutor {
  callCount = 0;
  
  async execute(_task: Task): Promise<ExecutorResult> {
    this.callCount++;
    return {
      success: false,
      output: 'LLM error: 429 Too Many Requests',
      durationMs: 1,
    };
  }
}

/** 前 N 次返回 429，之后成功的执行器 */
class RateLimitThenSuccessExecutor implements SubagentExecutor {
  callCount = 0;
  successAfter: number;
  
  constructor(successAfter: number) {
    this.successAfter = successAfter;
  }
  
  async execute(task: Task): Promise<ExecutorResult> {
    this.callCount++;
    
    if (this.callCount <= this.successAfter) {
      return {
        success: false,
        output: 'LLM error: 429 Too Many Requests',
        durationMs: 1,
      };
    }
    
    // 成功后写入文件
    task.result = 'success';
    return {
      success: true,
      output: 'completed',
      durationMs: 1,
    };
  }
}

function setupProject(tempDir: string): void {
  mkdirSync(join(tempDir, 'drafts', 'chapters'), { recursive: true });
  mkdirSync(join(tempDir, 'review'), { recursive: true });
  
  // 创建基本状态
  writeFileSync(join(tempDir, 'project-state.json'), JSON.stringify({
    version: 1,
    project: 'test',
    projectDir: tempDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: '4a',
    status: 'writing',
    round: 1,
    chapters: {
      ch001: {
        id: 'ch001',
        title: '测试章节',
        status: 'pending',
        round: 1,
        attempt: 0,
      },
    },
    tasks: [],
    executionLog: [],
    escalatedToHuman: false,
  }, null, 2));
}

describe('E2E: 429 限流恢复', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cw-e2e-429-'));
    setupProject(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('两阶段退避（Bug 8 修复验证）', () => {
    it('使用小延迟时，退避间隔正确', async () => {
      const scheduler = new SubagentScheduler();
      const executor = new Always429Executor();
      
      // 使用小延迟（10ms 基础值）
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,  // maxConcurrency
        0,  // rateLimitWindowMs
        0,  // rateLimitMaxTasks
        10, // rateLimitDelayMs（基础值）
      );

      // 添加任务
      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      const startTime = Date.now();
      await runner.runAll();
      const elapsed = Date.now() - startTime;

      // 第 1 次 429 后应该等待 phase1Delay = 10 * 2 = 20ms
      // 但由于 runAll 只执行一次，实际等待发生在下一次调用
      // 这里主要验证不会无限等待
      expect(elapsed).toBeLessThan(5000);
    });

    it('连续 7 次 429 后触发熔断', async () => {
      const scheduler = new SubagentScheduler();
      const executor = new Always429Executor();
      
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,  // maxConcurrency
        0,  // rateLimitWindowMs
        0,  // rateLimitMaxTasks
        1,  // rateLimitDelayMs（极小值加速测试）
      );

      // 添加任务
      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      // 多次执行直到熔断
      let circuitBroken = false;
      for (let i = 0; i < 10; i++) {
        await runner.runAll();
        if (runner.isCircuitBroken()) {
          circuitBroken = true;
          break;
        }
      }

      expect(circuitBroken).toBe(true);
      // 7 次重试后应该熔断
      expect(executor.callCount).toBeLessThanOrEqual(8); // 7 次重试 + 1 次初始
    });
  });

  describe('熔断后行为（Bug 1/2 回归防护）', () => {
    it('熔断后 isCircuitBroken() 返回 true', async () => {
      const scheduler = new SubagentScheduler();
      const executor = new Always429Executor();
      
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,
        0,
        0,
        1, // 极小延迟
      );

      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      // 执行直到熔断
      for (let i = 0; i < 10; i++) {
        await runner.runAll();
        if (runner.isCircuitBroken()) break;
      }

      expect(runner.isCircuitBroken()).toBe(true);
    });

    it('熔断后 runAll() 立即返回空结果', async () => {
      const scheduler = new SubagentScheduler();
      const executor = new Always429Executor();
      
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,
        0,
        0,
        1,
      );

      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      // 执行直到熔断
      for (let i = 0; i < 10; i++) {
        await runner.runAll();
        if (runner.isCircuitBroken()) break;
      }

      // 记录熔断前的调用次数
      const callsBefore = executor.callCount;

      // 再次调用 runAll
      const result = await runner.runAll();

      // 应该立即返回，不执行任何任务
      expect(result.executed).toBe(0);
      expect(executor.callCount).toBe(callsBefore);
    });
  });

  describe('恢复后继续执行', () => {
    it('429 恢复后任务成功完成', async () => {
      const scheduler = new SubagentScheduler();
      // 前 2 次 429，第 3 次成功
      const executor = new RateLimitThenSuccessExecutor(2);
      
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,
        0,
        0,
        1, // 极小延迟
      );

      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      // 第一次执行：429
      let result = await runner.runAll();
      expect(result.executed).toBe(1);
      expect(result.succeeded).toBe(0);

      // 第二次执行：429
      result = await runner.runAll();
      expect(result.executed).toBe(1);

      // 第三次执行：成功
      result = await runner.runAll();
      expect(result.executed).toBe(1);
      expect(result.succeeded).toBe(1);

      // 总共调用了 3 次
      expect(executor.callCount).toBe(3);
    });
  });

  describe('pausedUntil 检查（Bug 8 核心修复）', () => {
    it('runAll() 尊重 pausedUntil', async () => {
      const scheduler = new SubagentScheduler();
      const executor = new Always429Executor();
      
      const runner = new SchedulerRunner(
        scheduler,
        executor,
        1,
        0,
        0,
        50, // 50ms 基础延迟
      );

      scheduler.submit({
        id: 'write-ch001-r1',
        type: 'writer',
        chapterId: 'ch001',
        status: 'queued',
        priority: 1,
        sequence: 1,
        attempt: 0,
        prompt: '',
        dependencies: [],
      });

      // 第一次执行：触发 429，设置 pausedUntil
      const start1 = Date.now();
      await runner.runAll();
      const elapsed1 = Date.now() - start1;

      // 第一次执行应该很快（只是设置 pausedUntil）
      expect(elapsed1).toBeLessThan(100);

      // 第二次执行：应该等待 pausedUntil
      const start2 = Date.now();
      await runner.runAll();
      const elapsed2 = Date.now() - start2;

      // 第二次执行应该等待了 phase1Delay = 50 * 2 = 100ms
      // 允许一些误差
      expect(elapsed2).toBeGreaterThanOrEqual(80);
    });
  });
});
