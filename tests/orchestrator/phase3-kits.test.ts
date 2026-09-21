import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import { parseKitHeader } from '../../src/organize/kit-validator.js';
import type { ProjectState } from '../../src/state/schema.js';

/**
 * phase 2/3 必须保证「素材包与大纲对应」（Bug 31）
 *
 * 原状况：
 *   - phase 0b 与 phase 3 的 execute() 都是空壳（只返回一个 action 字符串），
 *     而 `organize_materials` / `prepare_materials` 不在 EXECUTABLE_ACTIONS 里，
 *     dispatcher 也不处理 —— 所以**流程永远不会重建素材包**，
 *     素材包只由手动命令 /confwrite:organize 生成。
 *   - phase 2 的出口条件只检查 `hasOrganizedMaterials`（data-baseline +
 *     references-index），**不检查素材包**。于是大纲改过之后：
 *
 *       phase 2 → 4a（直接开写，用的是旧素材包）
 *
 * 实测：上一次运行时 `0b → 2 → 4a`，phase 3 被完全跳过，写作用的是
 * 更早 48 章大纲留下的素材包（当时恰好标题没变才没出事）。
 *
 * 修法：
 *   - phase 3 的 execute 真正调用 organizeMaterials()（阶段名叫「素材准备」，
 *     本来就该做这件事）
 *   - phase 2/3 的出口条件加上「素材包与大纲逐章对应」的校验，
 *     不满足就先去 phase 3 重建，而不是硬着头皮开写
 */

const OUTLINE = `# 测试文档

## 1. 第一部分
ch001 1.1 项目理解
ch002 1.2 响应承诺

## 2. 第二部分
ch003 2.1 架构设计
`;

function makeKit(projectDir: string, chapterId: string, title: string): void {
  const dir = join(projectDir, 'assets', 'chapter-kits');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${chapterId}.md`),
    `# ${chapterId} 素材包：${title}\n\n## 章节信息\n- **章节 ID**: ${chapterId}\n`,
    'utf-8',
  );
}

describe('phase 2/3 与素材包一致性（Bug 31）', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-kits-'));
    for (const d of ['assets', 'drafts/chapters', 'reference_material', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }

    writeFileSync(join(projectDir, 'outline.md'), OUTLINE, 'utf-8');

    // 原始素材（organize 会扫描它）
    writeFileSync(
      join(projectDir, 'reference_material', '需求说明.md'),
      '# 需求说明\n\n系统需支持不少于 500 并发用户。\n',
      'utf-8',
    );

    // 「已整理」标志：两个文件都在 → hasOrganizedMaterials 为真
    writeFileSync(join(projectDir, 'assets', 'data-baseline.json'), '{"metrics":{}}', 'utf-8');
    writeFileSync(join(projectDir, 'assets', 'references-index.md'), '# 索引\n', 'utf-8');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeState(phase: ProjectState['currentPhase']) {
    const state: ProjectState = {
      version: 1,
      project: 'test',
      projectDir,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: phase,
      status: 'organizing',
      chapters: {},
      round: 1,
    };
    writeFileSync(join(projectDir, 'project-state.json'), JSON.stringify(state, null, 2));
  }

  it('素材包缺失时，phase 2 不得直接跳去写作，应先去 phase 3', async () => {
    writeState('2'); // 一个素材包都没有

    const machine = new StateMachine(projectDir);
    await machine.tick();

    expect(new ProjectStore(projectDir).load()!.currentPhase).toBe('3');
  });

  it('素材包与大纲不匹配时（id 撞车），phase 2 也不得跳去写作', async () => {
    writeState('2');
    makeKit(projectDir, 'ch001', '1.1 项目理解');
    makeKit(projectDir, 'ch002', '2.3 微服务与容器化部署方案'); // ← 旧大纲的内容
    makeKit(projectDir, 'ch003', '2.1 架构设计');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    expect(new ProjectStore(projectDir).load()!.currentPhase).toBe('3');
  });

  it('素材包全部匹配时，phase 2 直接跳去写作', async () => {
    writeState('2');
    makeKit(projectDir, 'ch001', '1.1 项目理解');
    makeKit(projectDir, 'ch002', '1.2 响应承诺');
    makeKit(projectDir, 'ch003', '2.1 架构设计');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    expect(new ProjectStore(projectDir).load()!.currentPhase).toBe('4a');
  });

  it('phase 3 的 execute 会真正重建素材包（不再是空壳）', async () => {
    writeState('3');
    // 先放一个错配的包，验证它会被覆盖
    makeKit(projectDir, 'ch002', '2.3 微服务与容器化部署方案');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // 三个章节都应生成，且标题与大纲一致
    for (const [id, title] of [['ch001', '1.1 项目理解'], ['ch002', '1.2 响应承诺'], ['ch003', '2.1 架构设计']]) {
      const p = join(projectDir, 'assets', 'chapter-kits', `${id}.md`);
      expect(existsSync(p), `${id} 素材包应存在`).toBe(true);
      expect(parseKitHeader(readFileSync(p, 'utf-8'))?.title).toBe(title);
    }
  });

  it('phase 3 重建后即可出口到写作（并且同步了章节状态）', async () => {
    writeState('3');

    const machine = new StateMachine(projectDir);
    await machine.tick(); // execute：重建素材包
    await machine.tick(); // 出口条件已满足

    const store = new ProjectStore(projectDir);
    expect(store.load()!.currentPhase).toBe('4a');
    // organizeMaterials 会同步大纲 → 状态
    expect(Object.keys(store.load()!.chapters).sort()).toEqual(['ch001', 'ch002', 'ch003']);
  });

  it('素材包已匹配时，phase 3 不重复劳动直接出口', async () => {
    writeState('3');
    makeKit(projectDir, 'ch001', '1.1 项目理解');
    makeKit(projectDir, 'ch002', '1.2 响应承诺');
    makeKit(projectDir, 'ch003', '2.1 架构设计');
    const before = readFileSync(join(projectDir, 'assets', 'chapter-kits', 'ch001.md'), 'utf-8');

    const machine = new StateMachine(projectDir);
    await machine.tick();

    // 出口条件在 execute 之前判定，所以直接跳走，不做多余工作
    expect(new ProjectStore(projectDir).load()!.currentPhase).toBe('4a');
    expect(readFileSync(join(projectDir, 'assets', 'chapter-kits', 'ch001.md'), 'utf-8')).toBe(before);
  });
});
