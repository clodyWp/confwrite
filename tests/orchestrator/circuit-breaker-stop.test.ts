import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWriteLoop } from '../../src/index.js';
import type { SubagentExecutor, ExecutorResult } from '../../src/scheduler/executor.js';
import type { Task } from '../../src/scheduler/types.js';
import type { ProjectState } from '../../src/state/schema.js';

/**
 * 限流熔断后的终止行为（Bug 1、2）
 *
 * 实测事故：29 个任务竟消耗 2000 次 tick，最终报「达到最大推进次数」。
 * 而真实原因是限流熔断（连续 6 次 429）—— 两个独立性缺陷叠加：
 *
 *  Bug 1  熔断后只 break 了内层批次循环，外层 while 继续：
 *         派发任务 → 熔断立即失败 → 0 执行 → 再派发 → … 空转
 *  Bug 2  stoppedReason 被无条件覆盖成 'max_ticks'，
 *         真实原因 circuit_breaker 丢失，完全误导排查方向
 */

class Always429Executor implements SubagentExecutor {
  async execute(_task: Task): Promise<ExecutorResult> {
    return { success: false, output: 'LLM error: 429 Too Many Requests', durationMs: 1 };
  }
}

describe('限流熔断后的终止（Bug 1、2）', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-cb-'));
    for (const d of ['assets', 'drafts/chapters', 'review', 'output', 'assembly']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
    writeFileSync(join(projectDir, 'outline.md'), '# 测试文档\n\n## 1. 概述\nch001 1.1 概述\n');

    const state: ProjectState = {
      version: 1,
      project: 'cb-test',
      projectDir,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: '4a',
      status: 'writing',
      chapters: {
        ch001: { id: 'ch001', title: '1.1 概述', status: 'pending', version: 0, round: 1, attempt: 0 },
      },
      round: 1,
    };
    writeFileSync(join(projectDir, 'project-state.json'), JSON.stringify(state, null, 2));

    writeFileSync(join(projectDir, 'assets', 'data-baseline.json'), '{}');
    writeFileSync(join(projectDir, 'assets', 'references-index.md'), '# Index');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // Bug 8 修复后 runAll() 会等待 pausedUntil，测试需要用小延迟避免超时
  const fastBackoffConfig = { rateLimitDelayMs: 10 };

  it('终止原因应为 circuit_breaker，而不是被覆盖成 max_ticks（Bug 2）', async () => {
    const result = await runWriteLoop(projectDir, () => {}, {
      executorOverride: new Always429Executor(),
      configOverride: fastBackoffConfig,
    });

    expect(result.stoppedReason).toBe('circuit_breaker');
  });

  it('熔断后不得空转到 MAX_TICKS（Bug 1）', async () => {
    const result = await runWriteLoop(projectDir, () => {}, {
      executorOverride: new Always429Executor(),
      configOverride: fastBackoffConfig,
    });

    // 熔断应在极少次推进内完成；空转旧行为会达到 2000
    expect(result.ticks).toBeLessThan(50);
  });

  it('熔断时 completed 应为 false', async () => {
    const result = await runWriteLoop(projectDir, () => {}, {
      executorOverride: new Always429Executor(),
      configOverride: fastBackoffConfig,
    });

    expect(result.completed).toBe(false);
  });

  it('不应产生大量通知（空转会刷屏）', async () => {
    const messages: string[] = [];
    await runWriteLoop(
      projectDir,
      msg => messages.push(msg),
      { executorOverride: new Always429Executor(), configOverride: fastBackoffConfig },
    );

    expect(messages.length).toBeLessThan(200);
  });
});
