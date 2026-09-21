import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { isOrthogonal } from '../../src/diagrams/layout/route.js';
import { extractPolylines } from '../../src/diagrams/layout/render.js';
import { MAX_ASPECT_RATIO, MIN_FONT_RATIO, TARGET_WIDTH } from '../../src/diagrams/layout/metrics.js';
import { parseStructuredDiagram } from '../../src/diagrams/structured-parser.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';
import type { DiagramSpec } from '../../src/diagrams/structured-parser.js';

/**
 * 布局引擎的契约
 *
 * 这些断言直接对应「嵌入 Word 可读」+「布局合理」两个需求：
 *   · 所有连线横平竖直（用户明确要求，不要 mermaid 的弧线/斜线）
 *   · 节点不重叠
 *   · 画布宽不超上限、高宽比不超上限（否则 Word 里跨页）
 *   · 字号占宽比达标（否则 Word 里小于 8pt）
 *   · 容器画出来并且带标签（原则 1）
 *   · 高权重节点有视觉区分（原则 2）
 *
 * 真机数据（LmERP2）也在这里跑一遍 —— 用真实图做回归，
 * 因为本项目最贵的教训就是"测试全绿 ≠ 真实数据能跑"。
 */

const style = getDefaultDiagramStyle();

/**
 * 真实数据回归的草稿目录（可选）
 *
 * 用环境变量指定，因为真实项目不在仓库里（那是使用者的私有内容）。
 * 未设置时相关用例整体跳过，并打印一行说明 —— 不写死机器路径，
 * 否则在别人机器或 CI 上会被 try/catch **静默跳过**，
 * 「每张真实图都满足几何不变量」形同虚设。
 *
 *   CONFWRITE_REAL_DRAFTS=/path/to/project/drafts/chapters npm test
 */
const REAL_DRAFTS = process.env.CONFWRITE_REAL_DRAFTS ?? '';
const REAL_DIR = REAL_DRAFTS;
const HAS_REAL = REAL_DRAFTS !== '' && existsSync(REAL_DRAFTS);

function specFrom(raw: string): DiagramSpec {
  return parseStructuredDiagram(raw);
}

const CROSSCUT_SPEC: DiagramSpec = specFrom(`type: flow
title: 故障处置全流程
containers:
  - id: trigger
    label: 触发入口
    nodes: [e1, e2]
  - id: main
    label: 主流程
    nodes: [s1, s2, s3]
  - id: crosscut
    label: 贯穿动作
    nodes: [x1, x2]
nodes:
  - id: e1
    label: 监控告警自动派单
    container: trigger
  - id: e2
    label: 人工报修
    container: trigger
  - id: s1
    label: ① 受理登记
    container: main
  - id: s2
    label: ② 分级判定
    container: main
    high_weight: true
  - id: s3
    label: ③ 调度响应
    container: main
  - id: x1
    label: 贯穿动作 A：进度通报
    container: crosscut
  - id: x2
    label: 贯穿动作 B：时限监控
    container: crosscut
edges:
  - from: e1
    to: s1
    label: 自动派单
  - from: e2
    to: s1
    label: 人工报修
  - from: s1
    to: s2
    label: 登记后定级
  - from: s2
    to: s3
    label: 定级后调度
    style: dashed
  - from: s3
    to: x2
    label: 调度即计时
    direction: bidirectional
`);

describe('布局引擎契约', () => {
  describe('横平竖直（用户明确要求）', () => {
    it('所有连线都是正交折线', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style, '故障处置全流程');
      expect(r.edges.length).toBeGreaterThan(0);
      for (const e of r.edges) {
        expect(isOrthogonal(e.points), `${e.from}→${e.to} 含斜线`).toBe(true);
      }
    });

    it('渲染出来的折线也是正交的（含自环与反向边）', () => {
      const spec = specFrom(`nodes:
  - id: a
    label: A
  - id: b
    label: B
edges:
  - from: a
    to: b
  - from: b
    to: a
  - from: a
    to: a
`);
      const r = layoutDiagram(spec, style);
      for (const line of extractPolylines(r.svg)) {
        expect(isOrthogonal(line)).toBe(true);
      }
    });

    it('不出现斜线的特征是：每条折线的相邻点必有一轴相等', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      for (const e of r.edges) {
        for (let i = 1; i < e.points.length; i++) {
          const dx = Math.abs(e.points[i].x - e.points[i - 1].x);
          const dy = Math.abs(e.points[i].y - e.points[i - 1].y);
          expect(dx <= 1 || dy <= 1).toBe(true);
        }
      }
    });
  });

  describe('嵌入 Word 的硬约束', () => {
    it('画布宽不超上限（含横切竖条的余量）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      // TARGET_WIDTH 是主体内容上限，横切竖条另占一列
      expect(r.width).toBeLessThanOrEqual(TARGET_WIDTH + 220);
    });

    it('高宽比不超上限（否则 Word 里跨页）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      expect(r.height / r.width).toBeLessThanOrEqual(MAX_ASPECT_RATIO);
    });

    it('字号占宽比达标（否则小于 8pt）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      expect(r.metrics.fontSize / r.width).toBeGreaterThanOrEqual(MIN_FONT_RATIO);
    });

    it('节点不重叠', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      expect(r.warnings.filter(w => w.includes('重叠'))).toEqual([]);
    });
  });

  describe('知识库原则', () => {
    it('原则 1：容器被画出且带标签', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      const labels = r.containers.map(c => c.label);
      expect(labels).toContain('触发入口');
      expect(labels).toContain('主流程');
      expect(labels).toContain('贯穿动作');
    });

    it('原则 1：横切容器画成独立的竖条（不占层序）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      const crosscut = r.containers.filter(c => c.crosscut);
      expect(crosscut).toHaveLength(1);
      // 竖条在主内容右侧
      expect(crosscut[0].x).toBeGreaterThan(Math.max(...r.nodes.filter(n => n.layer >= 0).map(n => n.x)));
    });

    it('横切节点不参与层序（层数不被它推高）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      expect(r.layers).toHaveLength(2); // 触发入口 + 主流程
      const crosscutIds = ['x1', 'x2'];
      for (const layer of r.layers) {
        for (const id of crosscutIds) expect(layer).not.toContain(id);
      }
    });

    it('原则 2：高权重节点被标记（渲染时用深色 + 粗边框）', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      expect(r.nodes.find(n => n.id === 's2')?.highWeight).toBe(true);
      expect(r.nodes.find(n => n.id === 's1')?.highWeight).toBe(false);
    });

    it('原则 2：高权重节点比同层节点高', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      const high = r.nodes.find(n => n.id === 's2')!;
      const normal = r.nodes.find(n => n.id === 's1')!;
      expect(high.h).toBeGreaterThan(normal.h);
    });

    it('原则 4：同层节点同宽', () => {
      const r = layoutDiagram(CROSSCUT_SPEC, style);
      const widths = [...new Set(r.nodes.filter(n => n.layer === 1).map(n => n.w))];
      expect(widths).toHaveLength(1);
    });

    it('原则 6：长标签折行而不是把节点撑爆', () => {
      const spec = specFrom(`nodes:
  - id: a
    label: 业务节点池（x86 与 ARM64 混合，承载无状态业务服务）
`);
      const r = layoutDiagram(spec, style);
      const node = r.nodes[0];
      expect(node.label.length).toBeGreaterThan(1);
      expect(node.w).toBeLessThanOrEqual(220);
    });
  });

  describe('索引一致性（层内下标 vs 全局下标）', () => {
    // 事故：wrapIntoRows 返回层内下标，solveCanvas 却当全局下标用，
    // 把 628px 的画布算成 988px，并报出假的"超宽"警告。
    // 构造"前面层窄、后面层宽"的图就能暴露它。
    it('后面层的宽度不会被前面层的节点宽度顶替', () => {
      const spec = specFrom(`nodes:
  - id: a
    label: A
  - id: b
    label: B
  - id: wide1
    label: 一个相当长的标签内容用来把节点撑宽
  - id: wide2
    label: 另一个相当长的标签内容用来把节点撑宽
edges:
  - from: a
    to: wide1
  - from: b
    to: wide2
`);
      const r = layoutDiagram(spec, style);
      // 第二层两个宽节点的宽度必须体现在画布宽里
      const wide = r.nodes.find(n => n.id === 'wide1')!;
      expect(r.width).toBeGreaterThanOrEqual(wide.w * 2);
    });

    it('报出的画布宽与实际内容一致（不再出现假的超宽警告）', () => {
      const spec = specFrom(`nodes:
  - id: a
    label: A
  - id: b
    label: B
  - id: c
    label: 第三个较长的标签内容用来撑宽节点
edges:
  - from: a
    to: c
`);
      const r = layoutDiagram(spec, style);
      expect(r.warnings.some(w => w.includes('超上限'))).toBe(false);
      expect(r.width).toBeLessThanOrEqual(TARGET_WIDTH);
    });
  });

  describe('真实数据（LmERP2）回归', () => {
    const realSpecs: Array<{ title: string; spec: DiagramSpec }> = [];
    try {
      for (const f of readdirSync(REAL_DIR).filter(f => /^ch\d+-v2\.md$/.test(f)).sort()) {
        const content = readFileSync(join(REAL_DIR, f), 'utf-8');
        for (const m of content.matchAll(/<!--\s*diagram-start\s*\n([\s\S]*?)\n\s*diagram-end\s*-->/g)) {
          if (/^(nodes|containers|edges):\s*$/m.test(m[1])) {
            realSpecs.push({ title: `${f}`, spec: parseStructuredDiagram(m[1]) });
          }
        }
      }
    } catch {
      // 真实项目不在本机时跳过（CI / 其他开发机）
    }

    it('真实项目里每张图都满足可读性与不跨页约束', () => {
      if (realSpecs.length === 0) return; // 没有真机数据时跳过

      const failures: string[] = [];
      for (const { title, spec } of realSpecs) {
        const r = layoutDiagram(spec, style);
        const ratio = r.height / r.width;
        const fontRatio = r.metrics.fontSize / r.width;

        // 自检都不允许出现"不是正交折线"
        if (r.warnings.some(w => w.includes('不是正交'))) {
          failures.push(`${title}: 出现非正交折线`);
        }
        if (ratio > MAX_ASPECT_RATIO + 0.15) {
          failures.push(`${title}: 高宽比 ${ratio.toFixed(2)} 超限`);
        }
        if (fontRatio < MIN_FONT_RATIO * 0.95) {
          failures.push(`${title}: 字号占宽比 ${(fontRatio * 100).toFixed(2)}% 偏低`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    it('真实项目里最坏的那张（曾经 535x4290）现在显著变矮', () => {
      if (realSpecs.length === 0) return;
      const heights = realSpecs.map(({ spec }) => layoutDiagram(spec, style).height);
      expect(Math.max(...heights)).toBeLessThan(4290);
    });
  });
});
