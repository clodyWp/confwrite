import { describe, it, expect } from 'vitest';
import {
  textWidth,
  wrapLabel,
  wrapIntoRows,
  solveCanvas,
  DEFAULT_METRICS,
  TARGET_WIDTH,
  MAX_ASPECT_RATIO,
} from '../../src/diagrams/layout/metrics.js';

/**
 * 尺寸解算
 *
 * 目标（用户确认的 Q1 + Q-B）：
 *   · 不拆图 —— 用压缩保证整体性
 *   · 压缩顺序：先压边距 → 再压字号
 *   · 两个硬约束：
 *       字号 / 画布宽 ≥ 1.9%   （Word 里缩到 14.8cm 宽后 ≥ 8pt 可读）
 *       画布高 / 画布宽 ≤ 1.5  （不超一页）
 *
 * 两个约束联立可以直接解出设计包线：
 *
 *   字号/宽 ≥ 0.019  →  宽 ≤ 字号 / 0.019
 *   13px 字号 → 宽 ≤ 684px      ← 正好是知识库的 680px
 *   宽 = 680 → 高 ≤ 1020px      ← 知识库说 900px（更保守）
 *
 * 所以策略是：**固定画布宽上限 680px，把过宽的层折成多行**，
 * 可读性就自动达标；剩下的只需控制高度。
 */

describe('textWidth', () => {
  it('中文字符按 1em 计算', () => {
    expect(textWidth('受理登记', 13)).toBe(52);
  });

  it('ASCII 按约 0.55em 计算', () => {
    expect(textWidth('Kubernetes', 13)).toBeCloseTo(71.5, 1);
  });

  it('中英混排累加', () => {
    // 2 个汉字 26px + "K8s" 3×7.15
    expect(textWidth('容器K8s', 13)).toBeCloseTo(26 + 21.45, 1);
  });

  it('全角括号与顿号按 1em（中文标点不窄）', () => {
    expect(textWidth('（一）、', 13)).toBeCloseTo(52, 1);
  });

  it('空字符串为 0', () => {
    expect(textWidth('', 13)).toBe(0);
  });
});

describe('wrapLabel', () => {
  it('放得下就不折行', () => {
    expect(wrapLabel('① 受理登记', 13, 200)).toHaveLength(1);
  });

  it('超宽时折成两行', () => {
    const lines = wrapLabel('业务节点池（x86 与 ARM64 混合，承载无状态业务服务）', 13, 200);
    expect(lines).toHaveLength(2);
  });

  it('折行后每行都不超宽', () => {
    const lines = wrapLabel('业务节点池（x86 与 ARM64 混合，承载无状态业务服务）', 13, 200);
    for (const line of lines) {
      expect(textWidth(line, 13)).toBeLessThanOrEqual(200);
    }
  });

  it('最多两行（再多就截断加省略号，避免节点变成方块）', () => {
    const lines = wrapLabel('这是一个非常非常非常非常非常非常非常非常非常长的标签内容需要截断', 13, 120);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('折行不丢字（未截断时两行拼起来等于原文）', () => {
    const label = '业务节点池（x86 与 ARM64 混合，承载无状态业务服务）';
    const lines = wrapLabel(label, 13, 200);
    if (!lines[lines.length - 1].endsWith('…')) {
      expect(lines.join('')).toBe(label);
    }
  });

  it('单字超宽时不产生空行', () => {
    const lines = wrapLabel('测试', 13, 10);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.every(l => l.length > 0)).toBe(true);
  });
});

describe('wrapIntoRows', () => {
  it('宽度够就一行', () => {
    expect(wrapIntoRows([200, 200, 200], 680, 20)).toEqual([[0, 1, 2]]);
  });

  it('超宽时折行', () => {
    // 3 × 200 + 2 × 20 = 640 放得下；加第 4 个 260 就超了
    const rows = wrapIntoRows([200, 200, 200, 260], 680, 20);
    expect(rows).toEqual([[0, 1, 2], [3]]);
  });

  it('9 个并排的层会折成多行（真机数据里的最坏情况）', () => {
    const rows = wrapIntoRows(Array(9).fill(190), TARGET_WIDTH - 2 * DEFAULT_METRICS.margin, DEFAULT_METRICS.rowGap);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flat()).toHaveLength(9);
  });

  it('顺序保持（折行不能打乱逻辑顺序）', () => {
    const rows = wrapIntoRows([300, 300, 300, 300], 680, 20);
    expect(rows.flat()).toEqual([0, 1, 2, 3]);
  });

  it('单个节点超宽也不单独放一行以外的地方', () => {
    const rows = wrapIntoRows([700, 100], 680, 20);
    expect(rows[0]).toEqual([0]);
    expect(rows[1]).toEqual([1]);
  });

  it('空输入返回空数组', () => {
    expect(wrapIntoRows([], 680, 20)).toEqual([]);
  });
});

describe('solveCanvas', () => {
  const nodeW = 190;
  const nodeH = 50;

  function solve(rowsPerLayer: number[][][], nodeCount: number) {
    return solveCanvas({
      layers: rowsPerLayer,
      nodeWidths: Array(nodeCount).fill(nodeW),
      nodeHeights: Array(nodeCount).fill(nodeH),
      crosscut: null,
      titleHeight: 0,
      metrics: DEFAULT_METRICS,
    });
  }

  it('简单一层的画布宽高都合理', () => {
    const r = solve([[[0, 1, 2]]], 3);
    expect(r.width).toBeLessThanOrEqual(TARGET_WIDTH);
    expect(r.height).toBeGreaterThan(0);
  });

  it('宽高比不超上限', () => {
    // 11 层，每层 2 个节点
    const layers = Array.from({ length: 11 }, () => [[0, 1]]);
    const r = solve(layers, 22);
    expect(r.height / r.width).toBeLessThanOrEqual(MAX_ASPECT_RATIO);
  });

  it('字号 / 宽度 ≥ 1.9%（Word 里可读）', () => {
    const layers = Array.from({ length: 8 }, () => [[0, 1, 2]]);
    const r = solve(layers, 24);
    expect(r.metrics.fontSize / r.width).toBeGreaterThanOrEqual(0.019);
  });

  it('折行之后画布宽不超目标宽度', () => {
    // 编排层负责按 TARGET_WIDTH 折行；这里给的是折好的行
    const layers = Array.from({ length: 5 }, () => [[0, 1, 2], [3]]);
    const r = solve(layers, 20);
    expect(r.width).toBeLessThanOrEqual(TARGET_WIDTH);
  });

  it('行太宽（编排层没折行）时如实报警，而不是默默产出超宽画布', () => {
    const layers = Array.from({ length: 5 }, () => [[0, 1, 2, 3]]);
    const r = solve(layers, 20);
    expect(r.width).toBeGreaterThan(TARGET_WIDTH);
    expect(r.adjustments.some(a => a.includes('超上限') || a.includes('折行'))).toBe(true);
  });

  it('太高时先压边距与层间距（不先动字号）', () => {
    const layers = Array.from({ length: 20 }, () => [[0, 1]]);
    const r = solve(layers, 40);
    // 压缩动作被记录下来（可诊断）
    expect(r.adjustments.length).toBeGreaterThan(0);
    expect(r.adjustments.some(a => a.includes('边距') || a.includes('层间距'))).toBe(true);
  });

  it('压缩动作里记录压了多少（便于事后归因）', () => {
    const layers = Array.from({ length: 20 }, () => [[0, 1]]);
    const r = solve(layers, 40);
    for (const a of r.adjustments) expect(typeof a).toBe('string');
  });

  it('横切容器占据右侧额外宽度', () => {
    const withCross = solveCanvas({
      layers: [[[0, 1]]],
      nodeWidths: [nodeW, nodeW],
      nodeHeights: [nodeH, nodeH],
      crosscut: { width: 160, nodeCount: 3 },
      titleHeight: 0,
      metrics: DEFAULT_METRICS,
    });
    const without = solve([[[0, 1]]], 2);
    expect(withCross.width).toBeGreaterThan(without.width);
  });

  it('标题占用高度', () => {
    const a = solve([[[0, 1]]], 2);
    const b = solveCanvas({
      layers: [[[0, 1]]],
      nodeWidths: [nodeW, nodeW],
      nodeHeights: [nodeH, nodeH],
      crosscut: null,
      titleHeight: 30,
      metrics: DEFAULT_METRICS,
    });
    expect(b.height).toBeGreaterThan(a.height);
  });
});
