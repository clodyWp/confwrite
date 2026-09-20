import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWriteLoop } from '../../src/index.js';
import type { SubagentExecutor } from '../../src/scheduler/executor.js';
import type { ProjectState } from '../../src/state/schema.js';

/**
 * Bug 30 —— 到达 done 之后收尾报错，看起来像失败
 *
 * 真机现象（本次重跑）：
 *   ⏩ 8 → done (done)
 *   📝 [done] done: 进入 done
 *   Error: ⛔ 未知: 未知 Phase: done      ← 这里
 *
 * 根因：`done` 只是 phase 8 的跳转**目标**，并没有注册进 phases 表：
 *   phases = new Map([['0a', …], … ['8', phase8]])   // 没有 'done'
 * 于是推进到 done 之后的下一次 tick：
 *   const definition = phases.get(phase);           // undefined
 *   return { phase, phaseName: '未知', blocked: true, error: `未知 Phase: ${phase}` };
 * 而 index.ts 把 blocked 一律当失败：
 *   if (tickResult.blocked) { notify('⛔ …', 'error'); result.stoppedReason = 'blocked'; break; }
 *
 * 影响：产物完整、completed 仍为 true，但 stoppedReason 变成 'blocked'
 * 并在控制台打印红色 Error —— 一次成功的运行看起来像失败。
 */

/** 不需要跑 subagent：本测试在到达 done 之前就已满足 phase 8 的出口条件 */
class NoopExecutor implements SubagentExecutor {
  async execute(): Promise<never> {
    throw new Error('本测试不应派发任何任务');
  }
}

function createProject(dir: string, state: ProjectState): void {
  mkdirSync(dir, { recursive: true });
  for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures', 'review']) {
    mkdirSync(join(dir, d), { recursive: true });
  }
  writeFileSync(join(dir, 'project-state.json'), JSON.stringify(state, null, 2));
}

function baseState(projectDir: string, phase: ProjectState['currentPhase']): ProjectState {
  return {
    version: 1,
    project: 'test',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: phase,
    status: 'exporting',
    chapters: {
      ch001: { id: 'ch001', title: '1.1 章节', status: 'completed', round: 1, attempt: 0, version: 0 },
    },
    round: 1,
  };
}

describe('到达 done 的收尾（Bug 30）', () => {
  let projectDir: string;
  let messages: Array<{ msg: string; level: string }>;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-done-'));
    messages = [];
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  const notify = (msg: string, level: string): void => {
    messages.push({ msg, level });
  };

  it('phase 8 出口满足后推进到 done，且不得报错', async () => {
    createProject(projectDir, baseState(projectDir, '8'));
    // 满足 phase 8 的出口条件 → 下一次 tick 会 advance 到 done
    writeFileSync(join(projectDir, 'output', 'final.docx'), 'FAKE-DOCX-CONTENT');

    const result = await runWriteLoop(projectDir, notify, { executorOverride: new NoopExecutor() });

    // 正常收尾
    expect(result.stoppedReason).toBe('completed');
    expect(result.completed).toBe(true);

    // 不得出现「未知 Phase: done」的报错
    const errors = messages.filter(m => m.level === 'error');
    expect(errors.map(e => e.msg).join(' | ')).not.toContain('未知 Phase');
    expect(errors).toHaveLength(0);
  });

  it('状态已经是 done 时再次运行，直接正常收尾', async () => {
    createProject(projectDir, baseState(projectDir, 'done'));

    const result = await runWriteLoop(projectDir, notify, { executorOverride: new NoopExecutor() });

    expect(result.stoppedReason).toBe('completed');
    expect(result.completed).toBe(true);
    expect(messages.filter(m => m.level === 'error')).toHaveLength(0);
  });
});
