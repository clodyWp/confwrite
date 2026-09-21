import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseKitHeader,
  validateChapterKits,
  readChaptersFromOutline,
} from '../../src/organize/kit-validator.js';

/**
 * 素材包与大纲的一致性校验（Bug 31）
 *
 * 真机事故（本次重跑规划时发现）：
 *
 *   assets/chapter-kits/ 里有 48 个素材包（ch001–ch048），
 *   来自更早的 48 章大纲；用户把大纲缩成 8 章并重新编号后：
 *
 *     ch005.md 的标题 = 「2.3 微服务与容器化部署方案」（旧内容）
 *     新大纲 ch005     = 「3.1 质保期服务承诺」（新含义）
 *
 *   而 dispatcher.readChapterKit() 只按 id 找文件、**存在就返回**，
 *   chapter-syncer 又保留已存在章节的 status（completed），
 *   kit-generator.generateBatch() 不清理旧包 ——
 *
 *   三条路径都不校验内容，结果是**静默拿到别的章节的素材**，
 *   产出一份「标题是 A、正文是 B」的文档。
 *
 * 本模块提供单一的事实来源：素材包必须与当前大纲逐章对应。
 */

const OUTLINE = `# 测试文档

## 1. 第一部分
ch001 1.1 项目理解
ch002 1.2 响应承诺

## 2. 第二部分
ch003 2.1 架构设计
`;

function makeKit(dir: string, chapterId: string, title: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${chapterId}.md`),
    `# ${chapterId} 素材包：${title}\n\n## 章节信息\n- **章节 ID**: ${chapterId}\n`,
    'utf-8',
  );
}

describe('parseKitHeader', () => {
  it('解析出章节 id 与标题', () => {
    const h = parseKitHeader('# ch005 素材包：3.1 质保期服务承诺\n\n正文');
    expect(h).toEqual({ chapterId: 'ch005', title: '3.1 质保期服务承诺' });
  });

  it('标题允许包含空格与全角字符', () => {
    const h = parseKitHeader('# ch012 素材包：5.2 故障响应与 SLA 保障\n');
    expect(h?.title).toBe('5.2 故障响应与 SLA 保障');
  });

  it('不是素材包格式时返回 null', () => {
    expect(parseKitHeader('# 随便一个标题\n')).toBeNull();
    expect(parseKitHeader('')).toBeNull();
  });
});

describe('readChaptersFromOutline', () => {
  it('按文档顺序取出全部 ch 章节', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-outline-'));
    try {
      writeFileSync(join(dir, 'outline.md'), OUTLINE, 'utf-8');
      const chs = readChaptersFromOutline(dir);
      expect(chs.map(c => c.id)).toEqual(['ch001', 'ch002', 'ch003']);
      expect(chs[0].title).toBe('1.1 项目理解');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没有 outline.md 时返回空数组', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-outline-'));
    try {
      expect(readChaptersFromOutline(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('validateChapterKits', () => {
  let projectDir: string;
  let kitsDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'kit-validate-'));
    kitsDir = join(projectDir, 'assets', 'chapter-kits');
    mkdirSync(kitsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  const chapters = [
    { id: 'ch001', title: '1.1 项目理解' },
    { id: 'ch002', title: '1.2 响应承诺' },
  ];

  it('全部对应 → ok', () => {
    makeKit(kitsDir, 'ch001', '1.1 项目理解');
    makeKit(kitsDir, 'ch002', '1.2 响应承诺');

    const r = validateChapterKits(projectDir, chapters);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
    expect(r.issues).toEqual([]);
  });

  it('缺素材包 → not ok，标记 missing', () => {
    makeKit(kitsDir, 'ch001', '1.1 项目理解');
    // ch002 缺失

    const r = validateChapterKits(projectDir, chapters);
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ chapterId: 'ch002', state: 'missing' });
  });

  it('【核心】id 相同但标题不同 → not ok，标记 mismatched', () => {
    makeKit(kitsDir, 'ch001', '1.1 项目理解');
    // 这正是真机事故：id 撞车，内容是别的章节的
    makeKit(kitsDir, 'ch002', '2.3 微服务与容器化部署方案');

    const r = validateChapterKits(projectDir, chapters);
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      chapterId: 'ch002',
      state: 'mismatched',
      expectedTitle: '1.2 响应承诺',
      actualTitle: '2.3 微服务与容器化部署方案',
    });
  });

  it('素材包文件存在但格式不对（无表头）→ 视为 mismatched', () => {
    makeKit(kitsDir, 'ch001', '1.1 项目理解');
    writeFileSync(join(kitsDir, 'ch002.md'), '这不是素材包\n', 'utf-8');

    const r = validateChapterKits(projectDir, chapters);
    expect(r.ok).toBe(false);
    expect(r.issues[0].state).toBe('mismatched');
  });

  it('多出来的旧素材包（不在大纲里）不影响结论', () => {
    makeKit(kitsDir, 'ch001', '1.1 项目理解');
    makeKit(kitsDir, 'ch002', '1.2 响应承诺');
    // 上一版大纲遗留的包，当前大纲已不再引用
    makeKit(kitsDir, 'ch005', '2.3 微服务与容器化部署方案');
    makeKit(kitsDir, 'ch048', '9.9 早已删除的章节');

    const r = validateChapterKits(projectDir, chapters);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
  });

  it('空白差异不算不匹配', () => {
    makeKit(kitsDir, 'ch001', '1.1  项目理解'); // 多一个空格
    makeKit(kitsDir, 'ch002', '1.2 响应承诺 ');

    expect(validateChapterKits(projectDir, chapters).ok).toBe(true);
  });

  it('大纲为空 → ok（没有东西要校验）', () => {
    const r = validateChapterKits(projectDir, []);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });
});
