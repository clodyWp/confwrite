/**
 * Phase definitions — declarative phase descriptors
 * 
 * Each phase defines:
 * - validate: check if phase prerequisites are met
 * - execute: what to do in this phase
 * - exits: possible transitions to other phases
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      condition: (ctx) => hasFile(ctx, 'outline.md') && hasOrganizedMaterials(ctx),
    },
    {
      target: '3',
      condition: (ctx) => hasFile(ctx, 'outline.md') && !hasOrganizedMaterials(ctx),
    },
  ],
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
  async execute(ctx) {
    return {
      action: 'prepare_materials',
      message: 'Phase 3: 素材准备',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    { target: '4a', condition: (ctx) => hasOrganizedMaterials(ctx) },
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
        return chapters.every(ch => !['written', 'reviewing'].includes(ch.status));
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
        if (needsRewrite(ctx, ch.id)) reject++;
        else if (needsFix(ctx, ch.id)) revise++;
        else pass++;
      }
    }

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
        ch => ch.status === 'reviewed' && needsFix(ctx, ch.id),
      ),
    },
    {
      target: '4a',
      condition: (ctx) => Object.values(ctx.state.chapters).some(
        ch => ch.status === 'reviewed' && needsRewrite(ctx, ch.id),
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
  validate: () => ({ ok: true }),
  async execute(ctx) {
    const fixable = Object.entries(ctx.state.chapters)
      .filter(([_, ch]) => ch.status === 'reviewed' && needsFix(ctx, ch.id))
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
      condition: (ctx) => !Object.values(ctx.state.chapters).some(ch => ch.status === 'fixing'),
    },
  ],
};

export const phase5: PhaseDefinition = {
  id: '5',
  name: '图表生成',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'generate_diagrams',
      message: 'Phase 5: 图表生成',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    {
      target: '6',
      condition: (ctx) => ctx.state.status === 'assembling' || !hasFile(ctx, 'figures/diagrams-to-render.json'),
    },
  ],
};

export const phase6: PhaseDefinition = {
  id: '6',
  name: '组装',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'assemble',
      message: 'Phase 6: 组装文档',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    { target: '7', condition: (ctx) => hasFile(ctx, 'output/final.md') },
  ],
};

export const phase7: PhaseDefinition = {
  id: '7',
  name: '定稿',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'wait_user_review',
      message: 'Phase 7: 等待用户审阅定稿',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    { target: '8', condition: (ctx) => ctx.state.status === 'exporting' },
  ],
};

export const phase8: PhaseDefinition = {
  id: '8',
  name: '导出',
  validate: () => ({ ok: true }),
  async execute(ctx) {
    return {
      action: 'export_docx',
      message: 'Phase 8: 导出 Word 文档',
      params: { projectDir: ctx.projectDir },
    };
  },
  exits: [
    { target: 'done', condition: (ctx) => hasFile(ctx, 'output/final.docx') },
  ],
};

// ============ Phase Registry ============

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
]);
