import { describe, it, expect } from 'vitest';
import {
  hasStructuredFormat,
  parseStructuredDiagram,
} from '../../src/diagrams/structured-parser.js';

/**
 * 结构化图表格式解析（containers / nodes / edges）
 *
 * 背景：写手实际产出的是**结构化 YAML**（它比提示词教的散文格式丰富得多），
 * 而渲染端只认散文 `description` —— 写手的 owner / timing / high_weight /
 * direction / style 全部被丢掉，图退化成「散文里提到的几个方框」。
 *
 * 更关键的是：知识库 knowledge/diagrams/layout.md 的 7 条布局原则，
 * 每一条都有对应的写手字段：
 *
 *   原则1 分组压缩（容器 3-4 个）  ← containers
 *   原则2 视觉权重（高权重 ≤3 个）  ← high_weight
 *   原则3 路径引导（编号 ①②③）    ← label
 *   原则4 重复模式（同类同尺寸）    ← container
 *   原则5 连线简化（≤1.5 倍）      ← edges
 *   原则6 标注外置（内短外详）      ← label / detail 分离
 *   原则7 边界清晰（间距 3:1）      ← container 归属
 *
 * 所以这个解析器不是"新加功能"，而是把知识库和写手之间已经断掉的链路接上。
 *
 * fixture 取自真机产出（LmERP2 ch006-v2）。
 */

/** 真机产出：13 节点 / 3 容器 / 13 边的完整结构化块 */
const REAL_BLOCK = `type: flow
title: 故障处置全流程与时限控制点
description: |
  展示故障从触发到关闭的标准路径，标注责任角色、时间控制点与触发条件。
containers:
  - id: trigger
    label: 触发入口
    nodes: [entry_monitor, entry_manual]
  - id: main
    label: 主流程
    nodes: [s1_accept, s2_grade]
  - id: crosscut
    label: 贯穿动作
    nodes: [cross_notify]
nodes:
  - id: entry_monitor
    label: 监控告警自动派单
    container: trigger
    owner: 监控系统
    detail: 异常检测（接口不可用、副本不足、队列积压、连接耗尽）
  - id: entry_manual
    label: 人工报修
    container: trigger
    owner: 采购人 / 服务台
  - id: s1_accept
    label: ① 受理登记
    container: main
    owner: 服务台
    timing: 即时
    detail: 生成工单，记录现象、影响范围、报修人与不可修改时间戳
  - id: s2_grade
    label: ② 分级判定
    container: main
    owner: 服务台 + 二线
    timing: 5 分钟内
    high_weight: true
    detail: 按四级定义定级，争议时"就高不就低"并事后复核
  - id: cross_notify
    label: 贯穿动作 A：进度通报
    container: crosscut
    owner: 服务经理
    detail: 一级每 30 分钟、二级每 1 小时
edges:
  - from: entry_monitor
    to: s1_accept
    label: 触发条件：监控探针判定异常并自动派单
    direction: forward
    owner: 监控系统
  - from: entry_manual
    to: s1_accept
    label: 触发条件：采购人拨打热线或提交工单
    direction: forward
  - from: s1_accept
    to: s2_grade
    label: 登记完成后即判定等级
    direction: forward
    style: dashed
  - from: s2_grade
    to: cross_notify
    label: 恢复期间按等级节奏对外通报
    direction: bidirectional
`;

describe('hasStructuredFormat', () => {
  it('含 nodes: 段 → true', () => {
    expect(hasStructuredFormat(REAL_BLOCK)).toBe(true);
  });

  it('含 edges: 段 → true', () => {
    expect(hasStructuredFormat('edges:\n  - from: a\n    to: b')).toBe(true);
  });

  it('含 containers: 段 → true', () => {
    expect(hasStructuredFormat('containers:\n  - id: c\n    label: C')).toBe(true);
  });

  it('只有散文 description → false（走散文解析器）', () => {
    const prose = `type: architecture
title: 三层架构
description: |
  三层架构：
  - 客户端层：Web 浏览器、移动端 App
  - 服务层：API Gateway
  连接关系：
  - 客户端 → API Gateway（HTTP）`;
    expect(hasStructuredFormat(prose)).toBe(false);
  });

  it('散文里提到 nodes: 不算结构化（必须顶格且后面有列表）', () => {
    expect(hasStructuredFormat('description: |\n  nodes: 这里只是正文')).toBe(false);
  });
});

describe('parseStructuredDiagram', () => {
  const spec = parseStructuredDiagram(REAL_BLOCK);

  describe('容器', () => {
    it('解析出 3 个容器，顺序与 YAML 一致', () => {
      expect(spec.containers.map(c => c.id)).toEqual(['trigger', 'main', 'crosscut']);
    });

    it('容器标签正确', () => {
      expect(spec.containers.map(c => c.label)).toEqual(['触发入口', '主流程', '贯穿动作']);
    });

    it('识别出横切/贯穿型容器（不由写手显式标注，按语义判定）', () => {
      const crosscut = spec.containers.find(c => c.id === 'crosscut');
      expect(crosscut?.crosscut).toBe(true);
      expect(spec.containers.find(c => c.id === 'main')?.crosscut).toBeFalsy();
    });

    it('容器的 nodes 列表（内联数组形式）解析正确', () => {
      const main = spec.containers.find(c => c.id === 'main');
      expect(main?.nodes).toEqual(['s1_accept', 's2_grade']);
    });
  });

  describe('节点', () => {
    it('解析出 5 个节点', () => {
      expect(spec.nodes).toHaveLength(5);
    });

    it('节点顺序与 YAML 一致', () => {
      expect(spec.nodes.map(n => n.id)).toEqual([
        'entry_monitor', 'entry_manual', 's1_accept', 's2_grade', 'cross_notify',
      ]);
    });

    it('label 取的是 label 字段，不是 id', () => {
      const n = spec.nodes.find(n => n.id === 's1_accept');
      expect(n?.label).toBe('① 受理登记');
    });

    it('container 归属正确', () => {
      expect(spec.nodes.find(n => n.id === 's2_grade')?.container).toBe('main');
      expect(spec.nodes.find(n => n.id === 'cross_notify')?.container).toBe('crosscut');
    });

    it('owner / timing / detail 都保留下来', () => {
      const n = spec.nodes.find(n => n.id === 's2_grade');
      expect(n?.owner).toBe('服务台 + 二线');
      expect(n?.timing).toBe('5 分钟内');
      expect(n?.detail).toBe('按四级定义定级，争议时"就高不就低"并事后复核');
    });

    it('detail 里的全角括号与顿号完整保留', () => {
      const n = spec.nodes.find(n => n.id === 'entry_monitor');
      expect(n?.detail).toBe('异常检测（接口不可用、副本不足、队列积压、连接耗尽）');
    });

    it('high_weight: true → highWeight', () => {
      expect(spec.nodes.find(n => n.id === 's2_grade')?.highWeight).toBe(true);
    });

    it('没有 high_weight 的节点 → highWeight 为空（不是 false 噪声）', () => {
      expect(spec.nodes.find(n => n.id === 's1_accept')?.highWeight).toBeFalsy();
    });
  });

  describe('连线', () => {
    it('解析出 4 条边', () => {
      expect(spec.edges).toHaveLength(4);
    });

    it('from / to / label 正确', () => {
      const e = spec.edges[0];
      expect(e.from).toBe('entry_monitor');
      expect(e.to).toBe('s1_accept');
      expect(e.label).toBe('触发条件：监控探针判定异常并自动派单');
    });

    it('label 里的全角冒号不被当作字段分隔（只切第一个冒号）', () => {
      expect(spec.edges[0].label).toContain('触发条件：');
    });

    it('direction 默认 forward，显式值生效', () => {
      expect(spec.edges[0].direction).toBe('forward');
      expect(spec.edges[3].direction).toBe('bidirectional');
    });

    it('style 默认 solid，显式值生效', () => {
      expect(spec.edges[0].style).toBe('solid');
      expect(spec.edges[2].style).toBe('dashed');
    });
  });

  describe('健壮性', () => {
    it('没有 containers 段时给空数组，不报错', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: a\n    label: A\nedges:\n  - from: a\n    to: a');
      expect(s.containers).toEqual([]);
      expect(s.nodes).toHaveLength(1);
    });

    it('边引用了不存在的节点 → 丢弃该边（不让布局引擎拿到悬空引用）', () => {
      const s = parseStructuredDiagram(
        'nodes:\n  - id: a\n    label: A\nedges:\n  - from: a\n    to: 不存在\n  - from: a\n    to: a',
      );
      expect(s.edges).toHaveLength(1);
      expect(s.edges[0].to).toBe('a');
    });

    it('节点缺 label 时回退用 id，不让图出现空白框', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: only_id\n    container: main');
      expect(s.nodes[0].label).toBe('only_id');
    });

    it('节点没有 container 字段 → container 为空', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: a\n    label: A');
      expect(s.nodes[0].container).toBeFalsy();
    });

    it('引号包裹的值会被去掉引号', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: a\n    label: "带引号的标签"');
      expect(s.nodes[0].label).toBe('带引号的标签');
    });

    it('重复 id 的节点只保留第一个（避免布局出现重叠框）', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: a\n    label: 第一个\n  - id: a\n    label: 第二个');
      expect(s.nodes).toHaveLength(1);
      expect(s.nodes[0].label).toBe('第一个');
    });

    it('空内容 → 空结构，不抛错', () => {
      const s = parseStructuredDiagram('');
      expect(s.nodes).toEqual([]);
      expect(s.edges).toEqual([]);
      expect(s.containers).toEqual([]);
    });

    it('detail 用块标量（|）时保留多行', () => {
      const s = parseStructuredDiagram('nodes:\n  - id: a\n    label: A\n    detail: |\n      第一行\n      第二行');
      expect(s.nodes[0].detail).toContain('第一行');
      expect(s.nodes[0].detail).toContain('第二行');
    });
  });
});
