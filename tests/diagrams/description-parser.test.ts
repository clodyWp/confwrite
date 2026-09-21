import { describe, it, expect } from 'vitest';
import { parseDiagramDescription } from '../../src/diagrams/description-parser.js';

/**
 * 图表描述解析
 *
 * 背景（实测事故）：LmERP2 生成的 29 张图标签混乱、且全部节点落在同一层，
 * 导致分层配色失效。三个根因：
 *
 *  Bug 19  分层标记只认半角冒号 `:`，不认中文全角 `：`
 *          实测 ch003 的描述里有 4 行以 `：` 结尾的分层标题，
 *          命中 0 个 → 所有节点 layer 恒为 0 → 分层配色无从生效
 *
 *  Bug 20  「连接关系」分支在「列表项」分支之前，且直接使用未剥离的原始文本
 *          `- 接入层 → 网关层（HTTPS/WSS/MQTT）` 的 fromLabel 变成 `- 接入层`
 *          → 图中出现带 `- ` 前缀的标签
 *
 *  Bug 21  多跳链只解析出首尾一条边
 *          `A → B → C → D` 被解析成 `A → "B → C → D"`，而非 A→B, B→C, C→D
 */

const ARCH_DESCRIPTION = `五层三纵两翼架构：
- 接入层：Web SPA（Vue 3.x/React 18.x + TypeScript）、移动端 APP
- 网关层：API Gateway（路由/鉴权/限流/协议转换）、WebSocket Gateway
- 服务层：微服务集群——数据中台服务、安防服务
- 数据与中间件层：PostgreSQL 15+、TDengine、Redis 7.x 集群
- 基础设施层：Docker 容器运行时、Kubernetes 编排
连接关系：
- 接入层 → 网关层（HTTPS/WSS/MQTT）
- 网关层 → 服务层（gRPC/REST 内部调用）
- 服务层 → 数据与中间件层（JDBC/原生协议）`;

describe('分层识别（Bug 19）', () => {
  it('全角冒号 `：` 结尾的行应触发 layer 递增', () => {
    const r = parseDiagramDescription({ description: ARCH_DESCRIPTION, title: '总体架构' });
    const maxLayer = Math.max(...r.nodes.map(n => n.layer));
    expect(maxLayer).toBeGreaterThan(0);
  });

  it('半角冒号 `:` 结尾的行同样触发（向后兼容）', () => {
    const desc = ['Layer A:', '- 节点1', 'Layer B:', '- 节点2'].join('\n');
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    const layers = new Map(r.nodes.map(n => [n.label, n.layer]));
    // 两个分段应为不同层，且后者更深
    expect(layers.get('节点2')!).toBeGreaterThan(layers.get('节点1')!);
  });

  it('五层描述应产生 0..4 五个层级', () => {
    const r = parseDiagramDescription({ description: ARCH_DESCRIPTION, title: 'T' });
    const layers = new Set(r.nodes.map(n => n.layer));
    expect(layers.size).toBeGreaterThanOrEqual(5);
  });

  it('不同层的节点确实落在不同 layer 上（逐层递增）', () => {
    const r = parseDiagramDescription({ description: ARCH_DESCRIPTION, title: 'T' });
    const layerOf = new Map(r.nodes.map(n => [n.label, n.layer]));
    const access = layerOf.get('接入层')!;
    const gateway = layerOf.get('网关层')!;
    const service = layerOf.get('服务层')!;
    // 配色只关心「是否分层与顺序」，不关心绝对编号
    expect(access).toBeLessThan(gateway);
    expect(gateway).toBeLessThan(service);
  });
});

describe('标签清洗（Bug 20）', () => {
  it('列表中转成节点的标签不带 `- ` 前缀', () => {
    const r = parseDiagramDescription({ description: ARCH_DESCRIPTION, title: 'T' });
    for (const n of r.nodes) {
      expect(n.label.startsWith('- ')).toBe(false);
      expect(n.label.startsWith('* ')).toBe(false);
    }
  });

  it('连接关系的标签也不带 `- ` 前缀', () => {
    const desc = '- A → B（说明）';
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    const labels = r.nodes.map(n => n.label);
    expect(labels).toContain('A');
    expect(labels.some(l => l.startsWith('- '))).toBe(false);
  });

  it('尾部括号注解提取为边的 label，不污染节点名', () => {
    const desc = '- 接入层 → 网关层（HTTPS/WSS/MQTT）';
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    expect(r.nodes.map(n => n.label)).toEqual(expect.arrayContaining(['接入层', '网关层']));
    expect(r.connections[0].label).toBe('HTTPS/WSS/MQTT');
  });
});

describe('多跳链解析（Bug 21）', () => {
  it('`A → B → C` 应产生两条边 A→B、B→C', () => {
    const r = parseDiagramDescription({ description: '- A → B → C', title: 'T' });
    expect(r.connections).toHaveLength(2);
    const labels = r.nodes.map(n => n.label);
    expect(labels).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    // 不存在把整串当标签的节点
    expect(labels.some(l => l.includes('→'))).toBe(false);
  });

  it('四跳链 `A → B → C → D` 应产生三条边', () => {
    const r = parseDiagramDescription({ description: '- A → B → C → D', title: 'T' });
    expect(r.connections).toHaveLength(3);
    expect(r.nodes.map(n => n.label)).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
  });

  it('半角箭头 `->` 同样支持多跳', () => {
    const r = parseDiagramDescription({ description: '- A -> B -> C', title: 'T' });
    expect(r.connections).toHaveLength(2);
  });

  it('链的节点标签不含箭头', () => {
    const r = parseDiagramDescription({ description: '- 数据采集（50+适配器）→ ETL → 数据服务', title: 'T' });
    for (const n of r.nodes) {
      expect(n.label).not.toContain('→');
    }
  });
});

describe('括号注解与层级精度', () => {
  it('链上节点逐层递进（不挤在同一层）', () => {
    const r = parseDiagramDescription({ description: '- A → B → C → D', title: 'T' });
    const layerOf = new Map(r.nodes.map(n => [n.label, n.layer]));
    expect(layerOf.get('B')!).toBeGreaterThan(layerOf.get('A')!);
    expect(layerOf.get('C')!).toBeGreaterThan(layerOf.get('B')!);
    expect(layerOf.get('D')!).toBeGreaterThan(layerOf.get('C')!);
  });

  it('连接目标带括号注解时，应复用已有节点而不新建重复节点', () => {
    const desc = [
      '- 接入层：Web、APP',
      '- 网关层：API Gateway',
      '- 接入层 → 网关层（HTTPS/WSS/MQTT）',
    ].join('\n');
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    const labels = r.nodes.map(n => n.label);
    // 不应出现「网关层（HTTPS/WSS/MQTT）」这种重复节点
    expect(labels.filter(l => l.startsWith('网关层'))).toEqual(['网关层']);
    expect(labels.filter(l => l.startsWith('接入层'))).toEqual(['接入层']);
  });

  it('括号内容应成为连接的 label（此前该字段从未被赋值）', () => {
    const desc = [
      '- 接入层：Web、APP',
      '- 网关层：API Gateway',
      '- 接入层 → 网关层（HTTPS/WSS/MQTT）',
    ].join('\n');
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    const conn = r.connections.find(c => c.label !== undefined);
    expect(conn?.label).toBe('HTTPS/WSS/MQTT');
  });

  it('括号内为空或目标不存在时，保留原标签（不误删）', () => {
    const r = parseDiagramDescription({ description: '- 甲 → 乙（说明）', title: 'T' });
    expect(r.nodes.map(n => n.label)).toEqual(expect.arrayContaining(['甲', '乙']));
  });
});

describe('边界情况', () => {
  it('空描述回退为单个默认节点', () => {
    const r = parseDiagramDescription({ description: '', title: '某图' });
    expect(r.nodes).toHaveLength(1);
    expect(r.nodes[0].label).toBe('某图');
  });

  it('只有标题行时也能产生节点', () => {
    const r = parseDiagramDescription({ description: '仅标题：', title: 'T' });
    expect(r.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('节点 id 唯一', () => {
    const r = parseDiagramDescription({ description: ARCH_DESCRIPTION, title: 'T' });
    const ids = r.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('重复标签只创建一个节点', () => {
    const desc = ['- A → B', '- B → A'].join('\n');
    const r = parseDiagramDescription({ description: desc, title: 'T' });
    expect(r.nodes.filter(n => n.label === 'A')).toHaveLength(1);
    expect(r.nodes.filter(n => n.label === 'B')).toHaveLength(1);
  });
});
