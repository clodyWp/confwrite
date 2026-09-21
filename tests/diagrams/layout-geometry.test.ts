import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { layoutDiagram, type LayoutResult } from '../../src/diagrams/layout/index.js';
import { isOrthogonal, saneStart } from '../../src/diagrams/layout/route.js';
import { textWidth } from '../../src/diagrams/layout/metrics.js';
import { parseStructuredDiagram, type DiagramSpec } from '../../src/diagrams/structured-parser.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';

/**
 * 布局几何契约 —— 逐条对应真机暴露出来的缺陷
 *
 * 用户在预览页上看到「有些字体溢出或者被图形盖住」，人工看图只能发现一部分，
 * 所以这里把**几何不变量**固化成断言，跑在 CI 里：
 *
 *   B1 标题被容器框盖住 —— 标题是第一个画的，容器框向上伸进了标题区
 *      （实测容器 y=23、标题基线 y=49）
 *   B2 连线标签超长、出画布、压节点 —— 21 字标签在 80px 间隙里居中后跨 x=-35..195
 *   B3 连线穿过节点 —— 绕行通道只按端点算，没避开中间节点
 *      （实测 polyline 312,95→312,187 穿过节点 264,111,96x36）
 *   B4 容器框互相重叠 10px —— 层间距压缩时没给容器标签区留位
 *
 * 另外一个更隐蔽的：**索引错位**（wrapIntoRows 返回层内下标，
 * solveCanvas 当全局下标用）—— 靠"画布宽度必须与内容一致"来兜住。
 */

const style = getDefaultDiagramStyle();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxesOf = (r: LayoutResult): Box[] => r.nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));

function overlapArea(a: Box, b: Box, tolerance = 1): number {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > tolerance && iy > tolerance ? ix * iy : 0;
}

/** 折线是否穿过了某个矩形的**内部**（端点贴在边上不算） */
function polylineHitsBox(points: Array<{ x: number; y: number }>, box: Box): boolean {
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(2, Math.ceil((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 3));

    for (let s = 0; s <= steps; s++) {
      const px = a.x + (b.x - a.x) * (s / steps);
      const py = a.y + (b.y - a.y) * (s / steps);

      // 端点处允许接触（连线就是从边框出发的）
      const atEnd =
        Math.hypot(px - first.x, py - first.y) <= 3 || Math.hypot(px - last.x, py - last.y) <= 3;
      if (atEnd) continue;

      if (px > box.x + 1 && px < box.x + box.w - 1 && py > box.y + 1 && py < box.y + box.h - 1) {
        return true;
      }
    }
  }
  return false;
}

/** 全套几何自检，返回问题清单 */
function auditLayout(r: LayoutResult): string[] {
  const problems: string[] = [];
  const nodes = boxesOf(r);

  // ① 节点互不重叠
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlapArea(nodes[i], nodes[j]) > 0) {
        problems.push(`节点重叠 ${r.nodes[i].id} × ${r.nodes[j].id}`);
      }
    }
  }

  // ② 容器互不重叠
  for (let i = 0; i < r.containers.length; i++) {
    for (let j = i + 1; j < r.containers.length; j++) {
      const a = r.containers[i];
      const b = r.containers[j];
      if (overlapArea(a, b, 2) > 0) {
        problems.push(`容器重叠 ${a.label} × ${b.label}`);
      }
    }
  }

  // ③ 连线全正交，且不穿过节点内部
  for (const edge of r.edges) {
    if (!isOrthogonal(edge.points)) {
      problems.push(`连线非正交 ${edge.from}→${edge.to}`);
    }
    for (const box of nodes) {
      if (polylineHitsBox(edge.points, box)) {
        problems.push(`连线穿节点 ${edge.from}→${edge.to}`);
        break;
      }
    }
  }

  // ④ 线段不得与节点边框共线（“黏在图形边上”，用户实际反馈过）
  //    只判“是否进入节点内部”是不够的：距边框 2px 的线在几何上算通畅，
  //    视觉上却贴在边框上。修前 20 张图里有 64 处。
  for (const edge of r.edges) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const horizontal = Math.abs(b.y - a.y) < 0.5 && Math.abs(b.x - a.x) > 2;
      const vertical = Math.abs(b.x - a.x) < 0.5 && Math.abs(b.y - a.y) > 2;
      if (!horizontal && !vertical) continue;

      for (const box of nodes) {
        if (horizontal) {
          const lo = Math.min(a.x, b.x);
          const hi = Math.max(a.x, b.x);
          if (hi <= box.x + 1 || lo >= box.x + box.w - 1) continue;
          if (Math.abs(a.y - box.y) < 2 || Math.abs(a.y - (box.y + box.h)) < 2) {
            problems.push(`线段贴着节点边框 ${edge.from}->${edge.to} (y=${a.y})`);
          }
        } else {
          const lo = Math.min(a.y, b.y);
          const hi = Math.max(a.y, b.y);
          if (hi <= box.y + 1 || lo >= box.y + box.h - 1) continue;
          if (Math.abs(a.x - box.x) < 2 || Math.abs(a.x - (box.x + box.w)) < 2) {
            problems.push(`线段贴着节点边框 ${edge.from}->${edge.to} (x=${a.x})`);
          }
        }
      }
    }
  }

  // ⑤ 连线标签不出画布、不压节点、不互相重叠
  const labelBoxes: Array<{ box: Box; text: string }> = [];
  for (const edge of r.edges) {
    if (!edge.label || !edge.labelAt) continue;

    const w = textWidth(edge.label, Math.max(9, r.metrics.fontSize - 2));
    const h = Math.max(9, r.metrics.fontSize - 2) * 1.2;
    const box: Box =
      (edge.labelAnchor ?? 'middle') === 'middle'
        ? { x: edge.labelAt.x - w / 2, y: edge.labelAt.y - h * 0.8, w, h }
        : { x: edge.labelAt.x, y: edge.labelAt.y - h * 0.8, w, h };

    if (box.x < -1 || box.y < -1 || box.x + box.w > r.width + 1 || box.y + box.h > r.height + 1) {
      problems.push(`标签出画布 ${edge.label}`);
    }
    for (const node of nodes) {
      if (overlapArea(box, node, 2) > 0) {
        problems.push(`标签压节点 ${edge.label}`);
        break;
      }
    }
    for (const other of labelBoxes) {
      if (overlapArea(box, other.box, 2) > 0) {
        problems.push(`标签互相重叠 ${edge.label} × ${other.text}`);
        break;
      }
    }
    labelBoxes.push({ box, text: edge.label });
  }

  return problems;
}

// ---- 测试用的图 ----

const DENSE: DiagramSpec = parseStructuredDiagram(`type: flow
title: 密集流程
containers:
  - id: main
    label: 主流程
    nodes: [a1, a2, a3, a4, b1, b2, b3, b4, c1, c2, c3, c4]
  - id: cross
    label: 贯穿动作
    nodes: [x1, x2]
nodes:
${['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4']
  .map(id => `  - id: ${id}\n    label: 节点 ${id} 的中文标签\n    container: main`)
  .join('\n')}
  - id: x1
    label: 贯穿动作 A：全程留痕
    container: cross
  - id: x2
    label: 贯穿动作 B：时限监控
    container: cross
edges:
${[
  ['a1', 'b1'], ['a2', 'b1'], ['a3', 'b2'], ['a4', 'b2'],
  ['b1', 'c1'], ['b2', 'c2'], ['b3', 'c3'], ['b4', 'c4'],
  ['a1', 'c4'], ['a4', 'c1'], ['a2', 'c3'], ['a3', 'c4'],
  ['c1', 'a3'], ['b1', 'b4'], ['b2', 'b3'],
]
  .map(([f, t]) => `  - from: ${f}\n    to: ${t}\n    label: ${f} 到 ${t} 的条件说明`)
  .join('\n')}
`);

const CROSSCUT: DiagramSpec = parseStructuredDiagram(`type: flow
title: 故障处置全流程
containers:
  - id: trigger
    label: 触发入口
    nodes: [e1, e2]
  - id: main
    label: 主流程
    nodes: [s1, s2, s3]
  - id: crosscut
    label: 贯穿动作（全程不中断）
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
    label: 触发条件：监控探针判定异常并自动派单
  - from: e2
    to: s1
    label: 触发条件：采购人拨打热线或提交工单
  - from: s1
    to: s2
    label: 登记完成后即判定等级
  - from: s2
    to: s3
    label: 等级决定调度强度
  - from: s3
    to: x2
    label: 调度即开始计时
    direction: bidirectional
`);

/**
 * 真实数据回归的草稿目录（可选）
 *
 * 用环境变量指定：真实项目是使用者的私有内容，不进仓库。
 * 未设置时相关用例跳过 —— 不能写死机器路径，否则在别人机器上会被
 * try/catch 静默跳过，这条最关键的回归守卫等于不存在。
 *
 *   CONFWRITE_REAL_DRAFTS=/path/to/project/drafts/chapters npm test
 */
const REAL_DRAFTS = process.env.CONFWRITE_REAL_DRAFTS ?? '';
const REAL_DIR = REAL_DRAFTS;
const HAS_REAL_DATA = REAL_DRAFTS !== '' && existsSync(REAL_DRAFTS);

function loadRealSpecs(): Array<{ name: string; spec: DiagramSpec }> {
  const out: Array<{ name: string; spec: DiagramSpec }> = [];
  try {
    for (const f of readdirSync(REAL_DIR).filter(n => /^ch\d+-v2\.md$/.test(n)).sort()) {
      const content = readFileSync(join(REAL_DIR, f), 'utf-8');
      let i = 0;
      for (const m of content.matchAll(/<!--\s*diagram-start\s*\n([\s\S]*?)\n\s*diagram-end\s*-->/g)) {
        i++;
        if (/^(nodes|containers|edges):\s*$/m.test(m[1])) {
          out.push({ name: `${f}#${i}`, spec: parseStructuredDiagram(m[1]) });
        }
      }
    }
  } catch {
    // 真实项目不在本机时跳过
  }
  return out;
}

describe('布局几何契约（B1–B4 的回归）', () => {
  it('交叉流程 + 横切竖条：无任何几何问题', () => {
    const problems = auditLayout(layoutDiagram(CROSSCUT, style, '故障处置全流程'));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('密集图（12 节点 + 15 条边 + 贯穿容器）：无任何几何问题', () => {
    const problems = auditLayout(layoutDiagram(DENSE, style, '密集流程'));
    expect(problems, problems.join('\n')).toEqual([]);
  });

  describe('B1 标题不被容器框盖住', () => {
    it('标题所在的顶区没有容器框', () => {
      const r = layoutDiagram(CROSSCUT, style, '故障处置全流程');
      const titleBottom = r.metrics.margin + r.metrics.fontSize + 6;
      for (const c of r.containers) {
        expect(c.y, `容器「${c.label}」压住了标题区`).toBeGreaterThanOrEqual(titleBottom);
      }
    });
  });

  describe('B4 容器框互不重叠', () => {
    it('同层容器之间留出足够间隙', () => {
      const r = layoutDiagram(DENSE, style, '密集流程');
      const flow = r.containers.filter(c => !c.crosscut).sort((a, b) => a.y - b.y);
      for (let i = 1; i < flow.length; i++) {
        const gap = flow[i].y - (flow[i - 1].y + flow[i - 1].h);
        expect(gap, `容器「${flow[i - 1].label}」与「${flow[i].label}」间距 ${gap}`).toBeGreaterThan(0);
      }
    });
  });

  describe('B2 连线标签', () => {
    it('长标签被截断到宽度上限内', () => {
      const r = layoutDiagram(DENSE, style, '密集流程');
      for (const e of r.edges) {
        if (!e.label) continue;
        expect(textWidth(e.label, r.metrics.fontSize - 2)).toBeLessThanOrEqual(150);
      }
    });

    it('没有标签落在画布外', () => {
      const r = layoutDiagram(DENSE, style, '密集流程');
      for (const e of r.edges) {
        if (!e.labelAt) continue;
        expect(e.labelAt.x).toBeGreaterThanOrEqual(0);
        expect(e.labelAt.y).toBeGreaterThanOrEqual(0);
        expect(e.labelAt.x).toBeLessThanOrEqual(r.width);
        expect(e.labelAt.y).toBeLessThanOrEqual(r.height);
      }
    });
  });

  describe('索引一致性（画布宽必须与内容一致）', () => {
    it('后面层的宽节点不会被前面层的窄节点顶替', () => {
      const spec = parseStructuredDiagram(`nodes:
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
      const wide = r.nodes.find(n => n.id === 'wide1')!;
      expect(r.width).toBeGreaterThanOrEqual(wide.w * 2);
    });
  });

  describe('连线起点必须朝向目标（用户反馈：黏在图形边上）', () => {
    // 真机问题：s3_dispatch 的右邻居就是目标，起点却落在**左边**中点，
    // 首段还往上走 —— 线从背向的一侧出发再绕整个节点兜回来，
    // 视觉上就像黏在节点边框上。根因是绕行时把四条边全枚举、只按总长择优。

    it('交叉流程图：每条边的出口都朝向目标', () => {
      const r = layoutDiagram(CROSSCUT, style, '故障处置全流程');
      const box = new Map(r.nodes.map(n => [n.id, n]));
      for (const e of r.edges) {
        const from = box.get(e.from)!;
        const to = box.get(e.to)!;
        expect(saneStart(e.points, from, to), `${e.from}→${e.to} 的起点背向目标`).toBe(true);
      }
    });

    it('密集图：每条边的出口都朝向目标', () => {
      const r = layoutDiagram(DENSE, style, '密集流程');
      const box = new Map(r.nodes.map(n => [n.id, n]));
      const bad: string[] = [];
      for (const e of r.edges) {
        const from = box.get(e.from)!;
        const to = box.get(e.to)!;
        if (!saneStart(e.points, from, to)) bad.push(`${e.from}→${e.to}`);
      }
      // 允许极少数（拥挤到只能让步时），但不能成片
      expect(bad.length, bad.join(', ')).toBeLessThanOrEqual(1);
    });

    it('起点落在源节点边框上（不是内部、也不悬空）', () => {
      const r = layoutDiagram(CROSSCUT, style, '故障处置全流程');
      const box = new Map(r.nodes.map(n => [n.id, n]));
      for (const e of r.edges) {
        const b = box.get(e.from)!;
        const p = e.points[0];
        const onBorder =
          Math.abs(p.x - b.x) <= 1.5 ||
          Math.abs(p.x - (b.x + b.w)) <= 1.5 ||
          Math.abs(p.y - b.y) <= 1.5 ||
          Math.abs(p.y - (b.y + b.h)) <= 1.5;
        expect(onBorder, `${e.from}→${e.to} 起点 (${p.x},${p.y}) 不在边框上`).toBe(true);
      }
    });
  });

  describe('真实数据（LmERP2）', () => {
    const specs = loadRealSpecs();

    it('每一张真实图都满足全部几何不变量', () => {
      if (specs.length === 0) return;

      const failures: string[] = [];
      let saneViolations = 0;
      let edgeTotal = 0;

      for (const { name, spec } of specs) {
        const r = layoutDiagram(spec, style);
        for (const problem of auditLayout(r)) {
          failures.push(`${name}: ${problem}`);
        }
        const box = new Map(r.nodes.map(n => [n.id, n]));
        for (const e of r.edges) {
          edgeTotal++;
          const from = box.get(e.from);
          const to = box.get(e.to);
          if (from && to && !saneStart(e.points, from, to)) saneViolations++;
        }
      }

      // 起点朝向：允许极少数为“不穿节点 + 不贴边框”让步。
      // 实测 208 条里 3 条会先反向走 12px 再绕 —— 这比穿过节点或贴着
      // 边框走要好，所以阈值放到 4 并留一条余量。
      if (saneViolations > 4) {
        failures.push(`起点朝向：${saneViolations}/${edgeTotal} 条背向目标（上限 4）`);
      }
      expect(failures, `\n${failures.join('\n')}`).toEqual([]);
    });

    it('每一张真实图都满足「可读 + 不跨页」', () => {
      if (specs.length === 0) return;

      const failures: string[] = [];
      for (const { name, spec } of specs) {
        const r = layoutDiagram(spec, style);
        const ratio = r.height / r.width;
        if (ratio > 1.55) failures.push(`${name}: 高宽比 ${ratio.toFixed(2)}`);
        if (r.metrics.fontSize / r.width < 0.018) {
          failures.push(`${name}: 字号占宽比 ${((r.metrics.fontSize / r.width) * 100).toFixed(2)}%`);
        }
      }
      expect(failures, `\n${failures.join('\n')}`).toEqual([]);
    });
  });
});
