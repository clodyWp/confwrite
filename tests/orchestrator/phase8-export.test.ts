import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateMachine } from '../../src/orchestrator/state-machine.js';
import { ProjectStore } from '../../src/state/store.js';
import type { ProjectState } from '../../src/state/schema.js';

/**
 * Phase 8 导出（Bug 9 + Bug 16）
 *
 * 实测事故：流程推进到 phase 8 后空转到 MAX_TICKS，output/final.docx
 * 永不生成。根因是 phase8.execute 只返回一个 action: 'export_docx'
 * 描述，而 dispatcher 的 switch 与 index.ts 的 EXECUTABLE_ACTIONS 都
 * 不处理它 —— 导出从未发生。
 *
 * phase5/6/7 都是在自己的 execute 内直接完成工作，只有 phase8 例外。
 *
 * 本文件用 stub pandoc（临时 PATH 上的脚本）验证接线，不依赖真实 pandoc。
 */

/** 生成一个假 pandoc：支持 --version，并能写出 -o 指定的文件 */
function createStubPandoc(dir: string): void {
  const p = join(dir, 'pandoc');
  writeFileSync(
    p,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "pandoc 3.99.0"; exit 0; fi',
      'out=""',
      'while [ $# -gt 0 ]; do',
      '  case "$1" in',
      '    -o) out="$2"; shift 2 ;;',
      '    *) shift ;;',
      '  esac',
      'done',
      '[ -n "$out" ] && printf "STUB-DOCX" > "$out"',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(p, 0o755);
}

describe('Phase 8 导出（Bug 9、16）', () => {
  let projectDir: string;
  let stubDir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'confwrite-phase8-'));
    stubDir = mkdtempSync(join(tmpdir(), 'confwrite-stub-'));
    originalPath = process.env.PATH;
    createStubPandoc(stubDir);

    // 项目结构
    for (const d of ['assets', 'drafts/chapters', 'output', 'assembly', 'figures']) {
      mkdirSync(join(projectDir, d), { recursive: true });
    }

    // 章节 + 大纲（导出会重新组装）
    writeFileSync(join(projectDir, 'drafts', 'chapters', 'ch001-v1.md'), '# 1.1 章节\n\n正文内容。\n');
    writeFileSync(join(projectDir, 'outline.md'), '# 测试文档标题\n\n## 1. 第一部分\nch001 1.1 章节\n');

    const state: ProjectState = {
      version: 1,
      project: 'test',
      projectDir,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: '8',
      status: 'exporting',
      chapters: {
        ch001: { id: 'ch001', title: '1.1 章节', status: 'completed', round: 1, attempt: 0, version: 0 },
      },
      round: 1,
    };
    writeFileSync(join(projectDir, 'project-state.json'), JSON.stringify(state, null, 2));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(stubDir, { recursive: true, force: true });
  });

  it('检测到 pandoc 时执行导出并生成 output/final.docx', async () => {
    process.env.PATH = `${stubDir}:${originalPath}`;
    const machine = new StateMachine(projectDir);
    await machine.tick();

    // Bug 9 的核心断言：导出真的发生了
    expect(existsSync(join(projectDir, 'output', 'final.docx'))).toBe(true);
  });

  it('导出成功后出口条件满足，可推进到 done', async () => {
    process.env.PATH = `${stubDir}:${originalPath}`;
    const machine = new StateMachine(projectDir);
    await machine.tick(); // 执行导出

    const r2 = await machine.tick(); // 出口条件已满足
    const store = new ProjectStore(projectDir);
    expect(store.load()!.currentPhase).toBe('done');
    expect('advanced' in r2 && r2.advanced).toBe(true);
  });

  it('缺少 pandoc 时 validate 返回 blocked 并给出安装指引（Bug 16）', async () => {
    // 用一个真正的空目录（stubDir 里放着 stub pandoc，不能用来模拟缺失）
    const emptyDir = mkdtempSync(join(tmpdir(), 'confwrite-empty-'));
    try {
      process.env.PATH = emptyDir;
      const machine = new StateMachine(projectDir);
      const r = await machine.tick();

      expect('blocked' in r && r.blocked).toBe(true);
      if ('blocked' in r && r.blocked) {
        expect(r.error).toContain('pandoc');
        expect(r.error).toMatch(/pacman|apt|pandoc\.org/);
      }
      // 不应生成产物
      expect(existsSync(join(projectDir, 'output', 'final.docx'))).toBe(false);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('缺少 pandoc 时不会空转消耗 tick（不会走到 done）', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'confwrite-empty2-'));
    try {
      process.env.PATH = emptyDir;
      const machine = new StateMachine(projectDir);
      await machine.tick();
      const store = new ProjectStore(projectDir);
      expect(store.load()!.currentPhase).toBe('8');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('导出失败时不误报成功', async () => {
    // stub 返回非零退出码
    const st = join(stubDir, 'pandoc');
    writeFileSync(st, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pandoc 3.99.0"; exit 0; fi\nexit 1\n', 'utf-8');
    chmodSync(st, 0o755);

    process.env.PATH = `${stubDir}:${originalPath}`;
    const machine = new StateMachine(projectDir);
    const r = await machine.tick();

    // 未生成 docx，且不应推进
    expect(existsSync(join(projectDir, 'output', 'final.docx'))).toBe(false);
    expect('phase' in r && r.phase).toBe('8');
  });
});
