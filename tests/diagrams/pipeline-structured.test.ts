import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramPipeline } from '../../src/diagrams/pipeline.js';

/**
 * 管线对结构化格式的处理（containers / nodes / edges）
 *
 * 真机事故：写手产出结构化 YAML，渲染端只认散文 description ——
 * 结果 23 张图里 20 张混进字面量为 id / from 的节点，10 张只有这两个节点。
 * （根因是 extractor 的 inDescription 吞掉整块 YAML，已修；
 *   本文件锁的是"解析器选对了、标签取自 label 字段"这一层行为。）
 *
 * fixture 取自真机产出（LmERP2 ch006-v2）。
 */

const TEST_DIR = join(process.cwd(), '.test-pipeline-structured');

const STRUCTURED = `<!-- diagram-start
type: flow
title: 故障处置全流程与时限控制点
description: |
  展示故障从触发到关闭的标准路径，标注责任角色与时间控制点。
containers:
  - id: trigger
    label: 触发入口
    nodes: [entry_monitor, entry_manual]
  - id: main
    label: 主流程
    nodes: [s1_accept, s2_grade]
nodes:
  - id: entry_monitor
    label: 监控告警自动派单
    container: trigger
  - id: entry_manual
    label: 人工报修
    container: trigger
  - id: s1_accept
    label: ① 受理登记
    container: main
  - id: s2_grade
    label: ② 分级判定
    container: main
    high_weight: true
edges:
  - from: entry_monitor
    to: s1_accept
    label: 自动派单
  - from: entry_manual
    to: s1_accept
    label: 人工报修
  - from: s1_accept
    to: s2_grade
    label: 登记后定级
diagram-end -->`;

const PROSE = `<!-- diagram-start
type: architecture
title: 三层架构
description: |
  三层架构：
  - 客户端层：Web 浏览器、移动端 App
  - 服务层：API Gateway、用户服务
  连接关系：
  - 客户端 → API Gateway（HTTP/HTTPS）
diagram-end -->`;

async function runPipeline(content: string) {
  mkdirSync(join(TEST_DIR, 'drafts', 'chapters'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'figures'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'assets'), { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'assets', 'diagram-style.json'),
    JSON.stringify({
      colorScheme: 'warm',
      nodeShape: 'rounded',
      layoutDirection: 'top-to-bottom',
      fontSize: 'normal',
      customColors: null,
    }),
  );
  writeFileSync(join(TEST_DIR, 'drafts', 'chapters', 'ch006-v1.md'), `# 第 6 章\n\n${content}\n`, 'utf-8');

  const pipeline = new DiagramPipeline(TEST_DIR);
  await pipeline.run({ skipPng: true, skipValidation: true });
  return readFileSync(join(TEST_DIR, 'figures', 'ch006-fig1.svg'), 'utf-8');
}

function textNodes(svg: string): string[] {
  return Array.from(svg.matchAll(/>([^<>]+)<\/text>/g)).map(m => m[1]);
}

describe('管线：结构化格式', () => {
  let svg: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    svg = await runPipeline(STRUCTURED);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('标签取自 label 字段（不是字段名）', () => {
    const texts = textNodes(svg);
    expect(texts).toContain('① 受理登记');
    expect(texts).toContain('② 分级判定');
    expect(texts).toContain('监控告警自动派单');
  });

  it('不再出现字面量为 id / from 的节点（真机事故的回归断言）', () => {
    const texts = textNodes(svg);
    expect(texts).not.toContain('id');
    expect(texts).not.toContain('from');
    expect(texts).not.toContain('to');
    expect(texts).not.toContain('nodes');
  });

  it('节点数与结构化块一致（4 个）', () => {
    // 用 data-node-id 而不是旧渲染器的 <g id="node-...">，避免绑死渲染器实现
    expect(Array.from(svg.matchAll(/data-node-id="/g))).toHaveLength(4);
  });

  it('连线标签取自 edges 的 label 字段', () => {
    expect(textNodes(svg)).toContain('自动派单');
    expect(textNodes(svg)).toContain('登记后定级');
  });

  it('连线数与 edges 一致（3 条）', () => {
    expect(Array.from(svg.matchAll(/data-edge-from="/g))).toHaveLength(3);
  });

  it('description 的散文不会被当成节点', () => {
    const texts = textNodes(svg);
    expect(texts.join('|')).not.toContain('展示故障从触发到关闭');
  });
});

describe('管线：散文格式仍然可用（回归）', () => {
  let svg: string;

  beforeEach(async () => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    svg = await runPipeline(PROSE);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('散文里的层名单被解析成节点', () => {
    const texts = textNodes(svg);
    expect(texts).toContain('客户端层');
    expect(texts).toContain('服务层');
  });

  it('散文里的连接关系被解析成边', () => {
    expect(Array.from(svg.matchAll(/data-edge-from="/g)).length).toBeGreaterThanOrEqual(1);
  });
});
