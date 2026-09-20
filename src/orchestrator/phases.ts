/**
 * Phase definitions — declarative phase descriptors
 * 
 * Each phase defines:
 * - validate: check if phase prerequisites are met
 * - execute: what to do in this phase
 * - exits: possible transitions to other phases
 */
import { existsSync, statSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { FormatConverter } from '../assemble/converter.js';
import { validateChapterKitsAgainstOutline } from '../organize/kit-validator.js';
import type { Phase, ProjectState } from '../state/schema.js';

export interface PhaseContext {
  state: ProjectState;
  projectDir: string;
}

export interface PhaseResult {
  action: string;
  message: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface Transition {
  target: Phase;
  condition: (ctx: PhaseContext) => boolean;
}

export interface PhaseDefinition {
  id: Phase;
  name: string;
  validate: (ctx: PhaseContext) => ValidationResult;
  execute: (ctx: PhaseContext) => Promise<PhaseResult>;
  exits: Transition[];
  /**
   * 进入本阶段时调用（由状态机在 advance 时触发）。
   *
   * 用途：清掉**本阶段自己产物**的残留文件（Bug 28）。
   *
   * 为什么必需：状态机的 tick 顺序是「先查出口条件 → 再 validate/execute」，
   * 而 phase 6/7/8 的出口条件就是「某个文件存在」，那个文件又正是本阶段
   * 要产出的。于是上次运行留下的残件会让出口条件直接成立，**阶段根本不
   * 执行就跳到下一阶段** —— 真机事故：残留的 output/final.docx 使
   * phase 8 跳过导出，pandoc 报错的情况下仍然进入 done。
   *
   * 注意：只清「工作产物」，不清「缓存」（如 figures/manifest.json）。
   * 缓存命中时跳过重算是正确行为。
   */
  onEnter?: (ctx: PhaseContext) => void;
  /** 是否为等待点（暂停等待用户确认后才继续） */
  waitPoint?: {
    reason: string;
    instructions: string;
    /**
     * 暂停时机：
     *
     * - `entry`（默认）：进入本阶段即暂停，不执行 execute。
     *   用于「纯人工确认点」——阶段自身不产生任何产物，
     *   如 phase2 大纲规划（等用户编写/确认 outline.md）。
     *
     * - `after-execute`：先完成本阶段工作，再暂停。
     *   用于「机器先干活、再请人审阅」——如 phase6 组装：
     *   必须先生成 assembly/merged-v1.md，否则会让用户
     *   审阅一个不存在的文件（Bug 10）。
     */
    timing?: 'entry' | 'after-execute';
  };
}

// ============ Helper Functions ============

function hasFile(ctx: PhaseContext, relativePath: string): boolean {
  try {
    const fullPath = join(ctx.projectDir, relativePath);
    return existsSync(fullPath) && statSync(fullPath).size > 0;
  } catch {
    return false;
  }
}

function hasDir(ctx: PhaseContext, relativePath: string): boolean {
  try {
    const fullPath = join(ctx.projectDir, relativePath);
    return existsSync(fullPath) && statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function hasOrganizedMaterials(ctx: PhaseContext): boolean {
  return hasFile(ctx, 'assets/data-baseline.json') &&
    (hasFile(ctx, 'assets/references-index.md') || hasDir(ctx, 'assets/indexes'));
}

/**
 * 素材包是否与当前大纲逐章对应（Bug 31）
 *
 * 只看 hasOrganizedMaterials 是不够的：它只验证「整理过」，不验证
 * 「素材包属于当前这一版大纲」。大纲增删/重编号后旧素材包仍在，
 * 而 dispatcher 是按 id 直接取文件的 —— 于是静默拿到别的章节的素材。
 *
 * 实测：上一次运行时 `0b → 2 → 4a`，phase 3 被跳过，写作用的是
 * 更早 48 章大纲留下的素材包（当时恰好标题未变才没出事）。
 */
function kitsMatchOutline(ctx: PhaseContext): boolean {
  try {
    return validateChapterKitsAgainstOutline(ctx.projectDir).ok;
  } catch {
    return false;
  }
}

function needsFix(ctx: PhaseContext, chapterId: string): boolean {
  try {
    const reviewPath = join(ctx.projectDir, 'review', `${chapterId}-r${ctx.state.round}.json`);
    const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    return review.verdict === 'revise';
  } catch {
    return false;
  }
}

function needsRewrite(ctx: PhaseContext, chapterId: string): boolean {
  try {
    const reviewPath = join(ctx.projectDir, 'review', `${chapterId}-r${ctx.state.round}.json`);
    const review = JSON.parse(readFileSync(reviewPath, 'utf-8'));
    return review.verdict === 'reject';
  } catch {
    return false;
  }
}

// ============ Phase Definitions ============

export const phase0a: PhaseDefinition = {
  id: '0a',
  name: '项目初始化',
  validate: () => ({ ok: true }),
  async execute() {
    return { action: 'advance', message: '项目已初始化' };
  },
  exits: [
    { target: '0b', condition: (ctx) => ctx.state.status === 'init' },
  ],
};

export const phase0b: PhaseDefinition = {
  id: '0b',
  name: '素材整理',
  validate: (ctx) => {
    if (ctx.state.status === 'init') {
      return { ok: false, error: '项目未初始化' };
    }
    return { ok: true };
  },
  async execute(ctx) {
    return {
      action: 'organize_materials',
      message: '开始素材整理',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '2',
      condition: (ctx) => ctx.state.status === 'organizing' && hasOrganizedMaterials(ctx),
    },
  ],
};

export const phase1: PhaseDefinition = {
  id: '1',
  name: '需求分析',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'spawn_researcher',
      message: 'Phase 1: 需求分析',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    { target: '2', condition: (ctx) => hasFile(ctx, 'inputs/requirements.md') },
  ],
};

export const phase2: PhaseDefinition = {
  id: '2',
  name: '大纲规划',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'outline_collaboration',
      message: 'Phase 2: 大纲规划（人机协作）',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '4a',
      // 必须同时满足「整理过」与「素材包与大纲逐章对应」（Bug 31）
      condition: (ctx) =>
        hasFile(ctx, 'outline.md') && hasOrganizedMaterials(ctx) && kitsMatchOutline(ctx),
    },
    {
      target: '3',
      condition: (ctx) =>
        hasFile(ctx, 'outline.md') && !(hasOrganizedMaterials(ctx) && kitsMatchOutline(ctx)),
    },
  ],
  waitPoint: {
    reason: '大纲规划和图表风格需要用户确认',
    instructions: `请确认以下两项内容：

1. 大纲内容
   请编辑 outline.md，用 ch001/ch002 等标记需要独立写作的章节。

2. 图表风格偏好
   当前配置 (assets/diagram-style.json):
   - 配色方案: 暖色系 (warm)
   - 节点形状: 圆角矩形 (rounded)
   - 布局方向: 从上到下 (top-to-bottom)
   - 字体大小: 标准 (normal)

   可选配色方案:
   - warm: 暖色系（橙色为主，适合技术方案）
   - cool: 冷色系（蓝色为主，适合互联网/科技）
   - mono: 黑白灰（适合正式文档/打印）
   - custom: 自定义（编辑 diagram-style.json）

   如需修改，请编辑 assets/diagram-style.json

完成后再次运行 /confwrite:write 继续。`,
  },
};

export const phase3: PhaseDefinition = {
  id: '3',
  name: '素材准备',
  validate: (ctx) => {
    if (!hasFile(ctx, 'outline.md')) {
      return { ok: false, error: 'outline.md 不存在，请先完成大纲规划' };
    }
    return { ok: true };
  },
  // 真正重建素材（Bug 31）
  //
  // 原实现只返回一个 action: 'prepare_materials' 描述，而它不在
  // EXECUTABLE_ACTIONS 里、dispatcher 也不处理 —— 于是**流程永远不会重建
  // 素材包**，素材包只由手动命令 /confwrite:organize 生成。
  // 大纲改过之后就会静默用上旧素材包（见 kitsMatchOutline 注释）。
  // 阶段名叫「素材准备」，本来就该做这件事。
  async execute(ctx) {
    const { organizeMaterials } = await import('../commands/organize.js');
    const { ProjectStore } = await import('../state/store.js');

    const r = await organizeMaterials(ctx.projectDir);

    // 把「大纲 → 章节列表」的同步结果合并回内存中的 state。
    //
    // organizeMaterials 会把同步结果写进磁盘上的 project-state.json，
    // 但状态机在 execute 之后会用**它自己内存里的** state 覆盖保存
    // （state-machine.ts: `this.store.save(state)`）—— 不同步回来的话，
    // 磁盘上的章节列表会被回滚，新大纲的章节永远不会变成 pending，
    // 于是 phase 4a 看不到任何待写章节。
    const fresh = new ProjectStore(ctx.projectDir).load();
    if (fresh?.chapters) {
      ctx.state.chapters = fresh.chapters;
      if (fresh.totalChapters !== undefined) {
        ctx.state.totalChapters = fresh.totalChapters;
      }
    }

    return {
      action: 'prepare_materials',
      message:
        `Phase 3: 素材准备完成 —— 素材包 ${r.kitStats.success}/${r.kitStats.total}，` +
        `章节映射 ${r.chapterMappings.length} 个`,
      params: { projectDir: ctx.projectDir, kitStats: r.kitStats },
    };
  },
  exits: [
    // 重建后才允许出口；重建失败则留在此阶段重试
    {
      target: '4a',
      condition: (ctx) => hasOrganizedMaterials(ctx) && kitsMatchOutline(ctx),
    },
  ],
};

export const phase4a: PhaseDefinition = {
  id: '4a',
  name: '写作',
  validate: (ctx) => {
    if (!hasFile(ctx, 'outline.md')) {
      return { ok: false, error: 'outline.md 不存在' };
    }
    if (Object.keys(ctx.state.chapters).length === 0) {
      return { ok: false, error: '没有章节定义' };
    }
    return { ok: true };
  },
  async execute(ctx) {
    const pending = Object.entries(ctx.state.chapters)
      .filter(([_, ch]) => ch.status === 'pending' || ch.status === 'failed')
      .map(([id]) => id);

    if (pending.length === 0) {
      return { action: 'advance', message: '所有章节已完成写作' };
    }

    return {
      action: 'spawn_writers',
      message: `Phase 4a: ${pending.length} 章待写`,
      params: { chapters: pending, projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '4b',
      condition: (ctx) => {
        const chapters = Object.values(ctx.state.chapters);
        return chapters.length > 0 && chapters.every(
          ch => ['written', 'completed', 'failed', 'skipped'].includes(ch.status),
        );
      },
    },
  ],
};

export const phase4b: PhaseDefinition = {
  id: '4b',
  name: '审阅',
  validate: (ctx) => {
    const written = Object.values(ctx.state.chapters).filter(ch => ch.status === 'written');
    if (written.length === 0) {
      return { ok: false, error: '没有已写好的章节需要审阅' };
    }
    return { ok: true };
  },
  async execute(ctx) {
    const needsReview = Object.entries(ctx.state.chapters)
      .filter(([_, ch]) => ch.status === 'written')
      .map(([id]) => id);

    return {
      action: 'spawn_reviewers',
      message: `Phase 4b: ${needsReview.length} 章待审阅`,
      params: { chapters: needsReview, round: ctx.state.round, projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '4c',
      condition: (ctx) => {
        const chapters = Object.values(ctx.state.chapters);
        const needsReview = chapters.some(ch => ['written', 'reviewing'].includes(ch.status));
        const hasProcessed = chapters.some(ch => ['reviewed', 'completed', 'failed', 'skipped'].includes(ch.status));
        return !needsReview && hasProcessed;
      },
    },
  ],
};

export const phase4c: PhaseDefinition = {
  id: '4c',
  name: '决策',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    const chapters = Object.entries(ctx.state.chapters);
    let pass = 0, revise = 0, reject = 0;

    for (const [id, ch] of chapters) {
      if (ch.status === 'reviewed') {
        const verdict = ch.lastReviewVerdict;
        if (verdict === 'reject') {
          // Process reject: reset to pending for rewrite
          ch.status = 'pending';
          ch.round = (ch.round || 1) + 1;
          reject++;
        } else if (verdict === 'revise') {
          revise++;
        } else {
          // accept or no verdict — treat as pass
          pass++;
        }
      }
    }

    // Persist state changes
    ctx.state.lastUpdated = new Date().toISOString();

    return {
      action: 'decide',
      message: `Phase 4c: pass=${pass}, revise=${revise}, reject=${reject}`,
      params: { pass, revise, reject },
    };
  },
  exits: [
    {
      target: '4d',
      condition: (ctx) => Object.values(ctx.state.chapters).some(
        ch => ch.status === 'reviewed' && ch.lastReviewVerdict === 'revise',
      ),
    },
    {
      target: '4a',
      condition: (ctx) => Object.values(ctx.state.chapters).some(
        ch => ch.status === 'pending' && ch.round > 1,
      ),
    },
    {
      target: '5',
      condition: (ctx) => Object.values(ctx.state.chapters).every(
        ch => ['completed', 'skipped', 'failed'].includes(ch.status),
      ),
    },
  ],
};

export const phase4d: PhaseDefinition = {
  id: '4d',
  name: '修复',
  validate: (ctx) => {
    const fixable = Object.values(ctx.state.chapters).filter(
      ch => ch.status === 'reviewed' && ch.lastReviewVerdict === 'revise',
    );
    if (fixable.length === 0) {
      return { ok: false, error: '没有需要修复的章节' };
    }
    return { ok: true };
  },
  async execute(ctx) {
    const fixable = Object.entries(ctx.state.chapters)
      .filter(([_, ch]) => ch.status === 'reviewed' && ch.lastReviewVerdict === 'revise')
      .map(([id]) => id);

    return {
      action: 'spawn_fixers',
      message: `Phase 4d: ${fixable.length} 章待修复`,
      params: { chapters: fixable, round: ctx.state.round, projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '4b',
      condition: (ctx) => {
        // Exit only when no chapters need fixing anymore
        // (all reviewed chapters have been processed by fixers)
        return !Object.values(ctx.state.chapters).some(
          ch => ch.status === 'reviewed' && ch.lastReviewVerdict === 'revise',
        );
      },
    },
  ],
};

export const phase5: PhaseDefinition = {
  id: '5',
  name: '图表生成',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    const { DiagramPipeline } = await import('../diagrams/pipeline.js');
    const pipeline = new DiagramPipeline(ctx.projectDir);
    const result = await pipeline.run();

    return {
      action: 'generate_diagrams',
      message: `Phase 5: 图表生成完成 (${result.generated} 个图表)`,
      params: {
        projectDir: ctx.projectDir,
        diagramCount: result.total,
        generated: result.generated,
        skipped: result.skipped,
        errors: result.errors,
      },
    };
  },
  exits: [
    {
      target: '6',
      condition: (ctx) => ctx.state.status === 'assembling' || hasFile(ctx, 'figures/manifest.json'),
    },
  ],
};

export const phase6: PhaseDefinition = {
  id: '6',
  name: '组装',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    const { ChapterAssembler } = await import('../assemble/assembler.js');
    const assembler = new ChapterAssembler();
    const chapters = assembler.listChapters(ctx.projectDir);
    // 传入文档标题（取自 outline.md 的一级标题），否则最终文档没有标题（Bug 22）
    const result = assembler.assemble(ctx.projectDir, chapters, {
      title: assembler.resolveDocumentTitle(ctx.projectDir),
      generateTOC: true,
    });
    const outputPath = join(ctx.projectDir, 'assembly', 'merged-v1.md');
    assembler.save(result, outputPath);
    return {
      action: 'assemble',
      message: `Phase 6: 组装完成 (${result.stats.totalChapters} 章, ${result.stats.totalWords} 词)`,
      params: { projectDir: ctx.projectDir, outputPath, stats: result.stats },
    };
  },
  exits: [
    { target: '7', condition: (ctx) => hasFile(ctx, 'assembly/merged-v1.md') },
  ],
  // 清掉上次组装的残件（Bug 28）：否则出口条件立刻成立，
  // phase 6 会跳过组装，连「请审阅初稿」的人工确认点也一并跳过。
  onEnter(ctx) {
    const p = join(ctx.projectDir, 'assembly', 'merged-v1.md');
    if (existsSync(p)) unlinkSync(p);
  },
  waitPoint: {
    reason: '初稿组装完成，需要用户审阅确认',
    instructions: '请审阅 assembly/merged-v1.md 初稿。确认无误后再次运行 /confwrite:write 继续定稿。',
    // 组装必须先生成产物，否则用户会被要求审阅一个不存在的文件（Bug 10）
    timing: 'after-execute',
  },
};

export const phase7: PhaseDefinition = {
  id: '7',
  name: '定稿',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    const { finalize } = await import('../assemble/finalizer.js');
    const report = finalize(ctx.projectDir);

    return {
      action: 'finalize',
      message: `Phase 7: 定稿完成 — ${report.stats.words} 字, ${report.stats.chapters} 章, 一致性 ${report.consistency.termConsistency}`,
      params: {
        projectDir: ctx.projectDir,
        stats: report.stats,
        consistency: report.consistency,
        readyForExport: report.readyForExport,
      },
    };
  },
  exits: [
    { target: '8', condition: (ctx) => hasFile(ctx, 'output/finalization.json') },
  ],
  // 清掉上次定稿的残件（Bug 28）
  onEnter(ctx) {
    const p = join(ctx.projectDir, 'output', 'finalization.json');
    if (existsSync(p)) unlinkSync(p);
  },
};

export const phase8: PhaseDefinition = {
  id: '8',
  name: '导出',
  // 依赖预检（Bug 16）：docx 导出需要 pandoc。
  // 以前 checkDependencies() 是死代码，缺依赖时只会抛出难懂的
  // execFileSync 报错，用户不知道该怎么办。
  validate: () => {
    const deps = new FormatConverter().checkDependencies();
    if (!deps.pandoc.installed) {
      return {
        ok: false,
        error:
          '导出 Word 需要 pandoc，但未检测到。请先安装：\n' +
          '  Arch:    sudo pacman -S pandoc\n' +
          '  Debian:  sudo apt install pandoc\n' +
          '  其他:    https://pandoc.org/installing.html\n' +
          '安装后再次运行 /confwrite:write 继续。',
      };
    }
    return { ok: true };
  },
  // 真正执行导出（Bug 9）
  // 原实现只返回一个 action: 'export_docx' 描述，而 dispatcher 与
  // EXECUTABLE_ACTIONS 都不处理它 —— 导出从未发生，出口条件永不满足，
  // 流程空转到 MAX_TICKS（实测：29 个任务消耗 2000 次 tick）。
  // 改为与 phase5/6/7 一致：在本阶段 execute 内直接完成工作。
  async execute(ctx) {
    const { exportDocument } = await import('../commands/export.js');
    const outputPath = join(ctx.projectDir, 'output', 'final.docx');

    const result = await exportDocument(ctx.projectDir, {
      format: 'docx',
      outputPath,
      toc: true,
    });

    return {
      action: 'export_docx',
      message: result.success
        ? `Phase 8: 导出完成 → ${outputPath}`
        : `Phase 8: 导出失败 — ${result.error ?? '未知错误'}`,
      params: { projectDir: ctx.projectDir, outputPath, success: result.success },
    };
  },
  exits: [
    { target: 'done', condition: (ctx) => hasFile(ctx, 'output/final.docx') },
  ],
  // 清掉上次导出的残件（Bug 28）
  //
  // 实测事故：pandoc 报 YAML 解析错误（分隔符 --- 被当元数据块），
  // 流程却仍进入 done —— 因为出口条件只有「final.docx 是否存在」，
  // 而上次运行留了一份 552 KB 的坏文件（29 张图全变成 alt 文字）。
  // 更隐蔽的是：出口检查在 execute **之前**，所以残件存在时
  // phase 8 连导出都不会尝试，直接跳过。
  onEnter(ctx) {
    const p = join(ctx.projectDir, 'output', 'final.docx');
    if (existsSync(p)) unlinkSync(p);
  },
};

// ============ Phase Registry ============

// 终态阶段（Bug 30）
//
// `done` 一直是 phase 8 的跳转目标，也是合法的 PhaseEnum 成员，
// 但从未注册进 phases 表。后果：推进到 done 之后的下一次 tick
// 走 `phases.get('done')` → undefined → 返回
//   { phaseName: '未知', blocked: true, error: '未知 Phase: done' }
// 而 index.ts 把 blocked 一律当失败，于是**一次成功的运行**在收尾时
// 打印红色 Error 并把 stoppedReason 记成 'blocked'。
//
// 注册后至少让 `phases.get('done')` 有定义、名字显示正常；
// 真正的「不再 tick」由 index.ts 循环顶部的终态检查负责。
const phaseDone: PhaseDefinition = {
  id: 'done',
  name: '完成',
  validate: () => ({ ok: true }),
  // 不会被调用：index.ts 在 tick 之前就判定终态并退出
  async execute() {
    return { action: 'complete', message: '文档已完成' };
  },
  exits: [],
};

export const phases: Map<Phase, PhaseDefinition> = new Map([
  ['0a', phase0a],
  ['0b', phase0b],
  ['1', phase1],
  ['2', phase2],
  ['3', phase3],
  ['4a', phase4a],
  ['4b', phase4b],
  ['4c', phase4c],
  ['4d', phase4d],
  ['5', phase5],
  ['6', phase6],
  ['7', phase7],
  ['8', phase8],
  ['done', phaseDone],
]);
