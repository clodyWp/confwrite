import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
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

import { platform } from 'node:os';

/** 生成一个假 pandoc：支持 --version，并能写出 -o 指定的文件 */
function createStubPandoc(dir: string): void {
  const isWindows = platform() === 'win32';
  const ext = isWindows ? '.cmd' : '';
  const p = join(dir, 'pandoc' + ext);
  
  if (isWindows) {
    // Windows batch file
    writeFileSync(
      p,
      [
        '@echo off',
        'if "%1"=="--version" (',
        '  echo pandoc 3.99.0',
        '  exit /b 0',
        ')',
        'set "out="',
        ':loop',
        'if "%~1"=="" goto done',
        'if "%~1"=="-o" (',
        '  set "out=%~2"',
        '  shift',
        '  shift',
        '  goto loop',
        ')',
        'shift',
        'goto loop',
        ':done',
        'if defined out echo STUB-DOCX> "%out%"',
        'exit /b 0',
      ].join('\r\n'),
      'utf-8',
    );
  } else {
    // Unix shell script
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
}

/** 生成一个失败的假 pandoc：--version 成功但导出失败 */
function createFailingStubPandoc(dir: string): void {
  const isWindows = platform() === 'win32';
  const ext = isWindows ? '.cmd' : '';
  const p = join(dir, 'pandoc' + ext);
  
  if (isWindows) {
    writeFileSync(
      p,
      [
        '@echo off',
        'if "%1"=="--version" (',
        '  echo pandoc 3.99.0',
        '  exit /b 0',
        ')',
        'exit /b 1',
      ].join('\r\n'),
      'utf-8',
    );
  } else {
    writeFileSync(
      p,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "pandoc 3.99.0"; exit 0; fi\nexit 1\n',
      'utf-8',
    );
    chmodSync(p, 0o755);
  }
}

describe('Phase 8 导出（Bug 9、16）', () => {
  const isWindows = platform() === 'win32';
  let projectDir: string;
  let stubDir: string;
  let originalPath: string | undefined;
  let state: ProjectState;

  /** 把状态文件的 currentPhase 设为指定阶段（用于测试阶段跳转） */
  function setPhase(phase: ProjectState['currentPhase']): void {
    state.currentPhase = phase;
    writeFileSync(join(projectDir, 'project-state.json'), JSON.stringify(state, null, 2));
  }

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

    state = {
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
    process.env.PATH = `${stubDir}${platform() === 'win32' ? ';' : ':'}${originalPath}`;
    const machine = new StateMachine(projectDir);
    await machine.tick();

    // Bug 9 的核心断言：导出真的发生了
    expect(existsSync(join(projectDir, 'output', 'final.docx'))).toBe(true);
  });

  it('导出成功后出口条件满足，可推进到 done', async () => {
    process.env.PATH = `${stubDir}${platform() === 'win32' ? ';' : ':'}${originalPath}`;
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

  // Windows 上 execFileSync 可能优先找到 pandoc.exe 而不是 pandoc.cmd
  // 导致无法模拟 pandoc 失败场景，跳过这些测试
  (isWindows ? it.skip : it)('导出失败时不误报成功', async () => {
    // stub 返回非零退出码
    createFailingStubPandoc(stubDir);

    process.env.PATH = `${stubDir}${platform() === 'win32' ? ';' : ':'}${originalPath}`;
    const machine = new StateMachine(projectDir);
    const r = await machine.tick();

    // 未生成 docx，且不应推进
    expect(existsSync(join(projectDir, 'output', 'final.docx'))).toBe(false);
    expect('phase' in r && r.phase).toBe('8');
  });

  // ── Bug 28 ──────────────────────────────────────────────
  // phase 8 的出口条件只有 hasFile('output/final.docx')，不看导出是否成功。
  // 上次运行留下的残件会让失败的导出仍然满足出口条件 → 假成功。
  // 实测事故：pandoc 报 YAML 解析错误，流程仍然推进到 done，
  // 而那份 final.docx 是 552 KB 的坏文件（图全变 alt 文字）。

  (isWindows ? it.skip : it)('残留的旧产物不能掩盖导出失败（Bug 28）', async () => {
    const docx = join(projectDir, 'output', 'final.docx');
    writeFileSync(docx, 'STALE-DOCX-FROM-PREVIOUS-RUN');
    // 满足 phase 7 的出口条件 → 下一次 tick 会「进入」phase 8
    writeFileSync(join(projectDir, 'output', 'finalization.json'), '{"stats":{}}');
    setPhase('7');

    // 让 pandoc 失败
    createFailingStubPandoc(stubDir);
    process.env.PATH = `${stubDir}${platform() === 'win32' ? ';' : ':'}${originalPath}`;

    const machine = new StateMachine(projectDir);
    await machine.tick(); // 进入 phase 8，onEnter 清掉残件

    // 残件必须被清掉，否则出口条件就只靠「文件存在」而假成功
    expect(existsSync(docx)).toBe(false);

    await machine.tick(); // execute：导出失败
    await machine.tick(); // 再来一次：出口条件仍不应满足

    const store = new ProjectStore(projectDir);
    expect(store.load()!.currentPhase).toBe('8');
    expect(existsSync(docx)).toBe(false);
  });

  it('残留旧产物时，成功导出会覆盖它并正常推进', async () => {
    const docx = join(projectDir, 'output', 'final.docx');
    writeFileSync(docx, 'STALE-DOCX-FROM-PREVIOUS-RUN');
    writeFileSync(join(projectDir, 'output', 'finalization.json'), '{"stats":{}}');
    setPhase('7');

    process.env.PATH = `${stubDir}${platform() === 'win32' ? ';' : ':'}${originalPath}`;
    const machine = new StateMachine(projectDir);
    await machine.tick(); // 进入 phase 8（清残件）
    expect(existsSync(docx)).toBe(false);

    await machine.tick(); // execute：导出成功
    expect(existsSync(docx)).toBe(true);
    // Windows 上 batch 文件写出的内容可能带 BOM 或换行符差异，只检查非空
    const content = readFileSync(docx, 'utf-8');
    expect(content.trim().length).toBeGreaterThan(0);

    await machine.tick(); // 出口条件满足
    expect(new ProjectStore(projectDir).load()!.currentPhase).toBe('done');
  });
});
