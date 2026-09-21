import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import type { ProjectState } from '../../src/state/schema.js';

/**
 * 残留产物不得让阶段「跳过自己的工作」（Bug 28 的一般形式）
 *
 * 状态机的 tick 顺序是：
 *   1. 检查出口条件 → 满足就跳转（**在 validate / execute 之前**）
 *   2. validate
 *   3. waitPoint
 *   4. execute
 *
 * 而 phase 6/7/8 的出口条件都是「某个文件存在」，那个文件又正是
 * 本阶段自己要产出的。于是上次运行留下的残件会让**出口条件直接成立**，
 * 阶段根本不执行就跳到下一阶段：
 *
 *   - 残留 assembly/merged-v1.md   → phase 6 跳过组装（也跳过人工确认点！）
 *   - 残留 output/finalization.json → phase 7 跳过定稿
 *   - 残留 output/final.docx       → phase 8 跳过导出并报 done（真机事故）
 *
 * 修法：阶段声明 onEnter，在**进入**该阶段时清掉自己产物的残件。
 * 这样出口条件只能由「本次运行真的产出了」来满足。
 *
 * 反例：phase 5 的 figures/manifest.json 是**缓存**而非工作产物，
 * 不应清理（缓存有效时跳过重算是正确的）。故不在本文件覆盖。
 */

function baseState(projectDir: string, phase: ProjectState['currentPhase']): ProjectState {
  return {
    version: 1,
    project: 'test',
    projectDir,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    currentPhase: phase,
    status: 'test',
    chapters: {
      ch001: { id: 'ch001', title: '1.1 章节', status: 'completed', round: 1, attempt: 0, version: 0 },
    },
    round: 1,
  };
}

describe('进入阶段时清理残留产物（Bug 28）', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-stale-'));
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }
    writeFileSync(join(projectDir, 'drafts', 'chapters', 'ch001-v1.md'), '# 1.1 章节\n\n正文。\n');
    writeFileSync(join(projectDir, 'outline.md'), '# 测试文档标题\n\n## 1. 第一部分\nch001 1.1 章节\n');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeState(phase: ProjectState['currentPhase']): void {
    writeFileSync(join(projectDir, 'project-state.json'), JSON.stringify(baseState(projectDir, phase), null, 2));
  }

  it('进入 phase 6 时清掉残留的 assembly/merged-v1.md（否则会跳过组装与人工确认）', async () => {
    const stale = join(projectDir, 'assembly', 'merged-v1.md');
    writeFileSync(stale, 'STALE-ASSEMBLY-FROM-PREVIOUS-RUN');
    // 满足 phase 5 的出口条件
    writeFileSync(join(projectDir, 'figures', 'manifest.json'), '{}');
    writeState('5');

    const machine = new StateMachine(projectDir);
    await machine.tick(); // 出口满足 → 进入 6 → onEnter 清残件

    expect(existsSync(stale)).toBe(false);
  });

  it('进入 phase 7 时清掉残留的 output/finalization.json（否则会跳过定稿）', async () => {
    const stale = join(projectDir, 'output', 'finalization.json');
    writeFileSync(stale, '{"stats":{}}');
    // 满足 phase 6 的出口条件
    writeFileSync(join(projectDir, 'assembly', 'merged-v1.md'), '# 合并稿\n');
    writeState('6');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    expect(existsSync(stale)).toBe(false);
  });

  it('进入 phase 8 时清掉残留的 output/final.docx（否则导出失败也会报 done）', async () => {
    const stale = join(projectDir, 'output', 'final.docx');
    writeFileSync(stale, 'STALE-DOCX-FROM-PREVIOUS-RUN');
    // 满足 phase 7 的出口条件
    writeFileSync(join(projectDir, 'output', 'finalization.json'), '{"stats":{}}');
    writeState('7');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    expect(existsSync(stale)).toBe(false);
  });

  it('清理只发生在「进入」时，不干涉本次刚产出的产物', async () => {
    // 已在 phase 8 且产物是本次运行刚生成的（时间上晚于进入）
    const docx = join(projectDir, 'output', 'final.docx');
    writeFileSync(docx, 'FRESH-DOCX');
    writeState('8');

    const machine = new StateMachine(projectDir);
    await machine.tick(); // 出口条件已满足 → 推进到 done，不应删除产物

    expect(existsSync(docx)).toBe(true);
  });
});
