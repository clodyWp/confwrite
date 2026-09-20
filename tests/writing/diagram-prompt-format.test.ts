import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasStructuredFormat, parseStructuredDiagram } from '../../src/diagrams/structured-parser.js';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';

/**
 * 提示词里的图表示例**必须能被解析器读懂**
 *
 * 这是整场图表事故的起因：提示词教写手写散文 `description`，写手却产出
 * 结构化 YAML，渲染端只认散文 —— 链路对不上，23 张图里 20 张混进字面量
 * 为 id / from 的节点。
 *
 * 写手是照抄提示词示例的，所以示例本身必须过解析 + 布局这两关。
 * 这个测试直接读提示词源文件，把示例当成一份真实产物跑一遍。
 */

const SOURCE = join(process.cwd(), 'src', 'writing', 'task-executor.ts');
const source = readFileSync(SOURCE, 'utf-8');

/** 抽出提示词里所有 diagram-start 块 */
function extractBlocks(): string[] {
  return Array.from(
    source.matchAll(/<!-- diagram-start[\s\S]*?diagram-end -->/g),
  ).map(m => m[0]);
}

const blocks = extractBlocks();
/**
 * 具体示例 = 不含占位符的那个
 *
 * 注意不能用 `!b.includes('<')` 判断 —— 示例里 `timing: P99 < 50ms`
 * 自带一个小于号，会把示例本身排除掉（写这条断言时踩过一次）。
 */
const example = blocks.find(b => !b.includes('<英文id>'));

describe('提示词：图表格式示例', () => {
  it('提示词里有格式模板和具体示例', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(example, '提示词里找不到具体示例（只有占位符模板）').toBeTruthy();
  });

  it('格式模板教的是 containers / nodes / edges 三段', () => {
    const template = blocks.find(b => b.includes('<'));
    expect(template).toBeTruthy();
    expect(template).toContain('containers:');
    expect(template).toContain('nodes:');
    expect(template).toContain('edges:');
    expect(template).toContain('high_weight');
  });

  it('示例能被识别为结构化格式', () => {
    expect(hasStructuredFormat(example!)).toBe(true);
  });

  it('示例解析出的节点 / 连线 / 容器数量与示例内容一致', () => {
    const spec = parseStructuredDiagram(example!);
    expect(spec.nodes).toHaveLength(7);
    expect(spec.edges).toHaveLength(6);
    expect(spec.containers).toHaveLength(4);
  });

  it('示例的标签取自 label，不是字段名', () => {
    const spec = parseStructuredDiagram(example!);
    expect(spec.nodes.map(n => n.label)).toContain('API 网关');
    for (const node of spec.nodes) {
      expect(['id', 'label', 'from', 'to', 'nodes']).not.toContain(node.label);
    }
  });

  it('示例的 high_weight 与 style 字段被解析', () => {
    const spec = parseStructuredDiagram(example!);
    expect(spec.nodes.filter(n => n.highWeight)).toHaveLength(1);
    expect(spec.edges.filter(e => e.style === 'dashed')).toHaveLength(2);
  });

  it('示例能排版成一张合法图表（不超页面框、无告警）', () => {
    const spec = parseStructuredDiagram(example!);
    const layout = layoutDiagram(spec, getDefaultDiagramStyle(), '系统整体架构');
    expect(layout.warnings).toEqual([]);
    // 判据是页面框（Word A4 可用区），不是高宽比：
    // 这个示例是 4 层纵向架构，宽 236，高宽比 1.56 —— 窄图高宽比天然偏大，
    // 但仍轻松放得下一页。高宽比只看是否触发压缩。
    expect(layout.width).toBeLessThanOrEqual(680);
    expect(layout.height).toBeLessThanOrEqual(900);
    expect(layout.nodes).toHaveLength(7);
  });

  it('提示词明确禁止 mermaid，并说明「一张图装下全部内容」', () => {
    expect(source).toContain('严禁使用 mermaid 代码块');
    expect(source).toContain('一张图装下全部内容');
  });

  it('提示词不再把散文 description 当作图的唯一来源', () => {
    // 散文只用于「给审阅者看」，不画进图
    expect(source).toMatch(/description:\s*\|[\s\S]{0,120}不会画进图里/);
  });
});
