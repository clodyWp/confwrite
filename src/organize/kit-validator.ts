/**
 * 素材包一致性校验（Bug 31）
 *
 * 为什么需要它：
 *
 * 素材包是**按章节 id** 取用的 —— `dispatcher.readChapterKit()` 只做
 * 「文件是否存在」的判断，不校验内容是否属于这个章节。
 * 而 `kit-generator.generateBatch()` 只写当前大纲的包、**不清理旧的**。
 *
 * 于是当大纲发生变化（增删章节、重新编号）时会出现静默错配：
 *
 *   assets/chapter-kits/ch005.md  ← 上一版大纲的「2.3 微服务与容器化部署」
 *   新大纲 ch005                  ← 本版大纲的「3.1 质保期服务承诺」
 *
 * 结果是「标题是 A、正文是 B」的文档，而且**没有任何报错**。
 *
 * 本模块给出单一事实来源：素材包必须与当前大纲逐章对应
 * （id 一致 + 标题一致）。phase 出口与 dispatcher 都用它。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OutlineParser } from './outline-parser.js';

export interface ChapterRef {
  id: string;
  title: string;
}

export type KitState = 'ok' | 'missing' | 'mismatched';

export interface KitIssue {
  chapterId: string;
  expectedTitle: string;
  actualTitle?: string;
  state: Exclude<KitState, 'ok'>;
}

export interface KitValidation {
  /** 全部章节都有对应素材包时为 true */
  ok: boolean;
  /** 实际校验的章节数 */
  checked: number;
  /** 有问题的章节 */
  issues: KitIssue[];
}

/** 归一化：去掉所有空白，避免「1.1  项目理解」这类差异被误判 */
function normalize(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * 解析素材包首行表头
 *
 * 格式（由 KitGenerator 产出）：`# ch005 素材包：3.1 质保期服务承诺`
 */
export function parseKitHeader(content: string): { chapterId: string; title: string } | null {
  const firstLine = content.split('\n', 1)[0] ?? '';
  const m = firstLine.match(/^#\s*(ch\d+)\s*素材包[：:]\s*(.+)$/);
  if (!m) return null;
  return { chapterId: m[1], title: m[2].trim() };
}

/**
 * 从 outline.md 读取全部 ch 章节（按文档顺序）
 */
export function readChaptersFromOutline(projectDir: string): ChapterRef[] {
  const outlinePath = join(projectDir, 'outline.md');
  if (!existsSync(outlinePath)) return [];

  const outline = new OutlineParser().parse(readFileSync(outlinePath, 'utf-8'));
  return outline.getAllChapters().map(node => ({
    id: node.id as string,
    title: node.title,
  }));
}

/** 素材包目录 */
export function kitsDirOf(projectDir: string): string {
  return join(projectDir, 'assets', 'chapter-kits');
}

/**
 * 逐个校验章节是否有对应且匹配的素材包
 *
 * 只校验传入的 `chapters`；目录里多出来的旧素材包（大纲已不再引用的
 * 章节）不影响结论 —— 它们永远不会被读到，清理与否是整理策略问题。
 */
export function validateChapterKits(
  projectDir: string,
  chapters: ChapterRef[],
): KitValidation {
  const kitsDir = kitsDirOf(projectDir);
  const issues: KitIssue[] = [];

  for (const ch of chapters) {
    const kitPath = join(kitsDir, `${ch.id}.md`);

    if (!existsSync(kitPath)) {
      issues.push({ chapterId: ch.id, expectedTitle: ch.title, state: 'missing' });
      continue;
    }

    const header = parseKitHeader(readFileSync(kitPath, 'utf-8'));

    if (!header || normalize(header.title) !== normalize(ch.title)) {
      issues.push({
        chapterId: ch.id,
        expectedTitle: ch.title,
        actualTitle: header?.title,
        state: 'mismatched',
      });
    }
  }

  return { ok: issues.length === 0, checked: chapters.length, issues };
}

/** 便捷封装：直接按当前大纲校验 */
export function validateChapterKitsAgainstOutline(projectDir: string): KitValidation {
  return validateChapterKits(projectDir, readChaptersFromOutline(projectDir));
}

/**
 * 生成人类可读的问题描述（用于报错信息）
 */
export function describeKitIssues(v: KitValidation): string {
  return v.issues
    .map(i =>
      i.state === 'missing'
        ? `${i.chapterId}（缺素材包，期望标题「${i.expectedTitle}」）`
        : `${i.chapterId}（素材包标题为「${i.actualTitle ?? '无法解析'}」，应为「${i.expectedTitle}」）`,
    )
    .join('；');
}
