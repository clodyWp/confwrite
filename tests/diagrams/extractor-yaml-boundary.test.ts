import { describe, it, expect } from 'vitest';
import { extractDiagrams } from '../../src/diagrams/extractor.js';

/**
 * diagram 块的 YAML 字段边界
 *
 * 真机事故（8 章重跑，第 23 张图全是垃圾）：
 *
 *   extractor 的 parseDiagramBlock 里，`inDescription` 一旦置为 true
 *   **永远不会设回 false** —— description 会把后面的 containers: /
 *   nodes: / edges: 整块 YAML 全吞掉。
 *
 *   于是散文解析器看到的是：
 *     - id: trigger          → 当成「层定义」→ 节点名就是 "id"
 *     - from: entry_monitor  → 当成「层定义」→ 节点名就是 "from"
 *
 *   整块 YAML 里恰好只有 `- id:` 和 `- from:` 两种列表键，
 *   所以 ch006-fig1 的图里只有两个字：id 和 from。
 *   同时 containers: / nodes: 这些行命中「分段标题」正则，
 *   把 layer 虚增到 30+ → 画布高度 2600–4290px。
 *
 * 为什么 781 个测试全绿却没拦住：所有 fixture 都只写 `description: |`
 * 就结束了，**带 nodes:/edges: 的示例块 0 处** —— 而这个 bug 恰恰只在
 * 「description 之后还有内容」时发作。测试覆盖的是散文路径，
 * 真实写手走的是结构化路径，两条路从未交汇。
 *
 * 所以本文件的 fixture 全部取自真机产出（ch006-v2），不自己编简化版。
 */

/** 真机产出：结构化格式（写手实际写出来的形态） */
const STRUCTURED_BLOCK = `<!-- diagram-start
type: flow
title: 故障处置全流程与时限控制点
description: |
  展示故障从触发到关闭的标准路径，标注责任角色、时间控制点与触发条件。
  阅读路径为自上而下：两个并列入口汇入①受理登记，再依次经过②至⑧。
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
    owner: 监控系统
  - id: s1_accept
    label: ① 受理登记
    container: main
    high_weight: true
    detail: 生成工单，记录现象、影响范围与不可修改时间戳
edges:
  - from: entry_monitor
    to: s1_accept
    label: 监控探针判定异常并自动派单
    style: dashed
diagram-end -->`;

function onlyBlock(content: string) {
  const blocks = extractDiagrams(content, 'ch006');
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

describe('diagram 块的 YAML 字段边界（Bug：description 吞掉整块 YAML）', () => {
  describe('description 必须在下一个顶层键处结束', () => {
    it('description 里不含 containers:', () => {
      expect(onlyBlock(STRUCTURED_BLOCK).description).not.toContain('containers:');
    });

    it('description 里不含 nodes:', () => {
      expect(onlyBlock(STRUCTURED_BLOCK).description).not.toContain('nodes:');
    });

    it('description 里不含 edges:', () => {
      expect(onlyBlock(STRUCTURED_BLOCK).description).not.toContain('edges:');
    });

    it('description 里不含任何列表键（- id: / - from:）', () => {
      const d = onlyBlock(STRUCTURED_BLOCK).description;
      expect(d).not.toContain('- id:');
      expect(d).not.toContain('- from:');
      expect(d).not.toContain('to:');
    });

    it('description 里只保留散文，且完整保留', () => {
      const d = onlyBlock(STRUCTURED_BLOCK).description;
      expect(d).toContain('展示故障从触发到关闭的标准路径');
      expect(d).toContain('阅读路径为自上而下');
      // 两行散文，一行不少
      expect(d.trim().split('\n')).toHaveLength(2);
    });
  });

  describe('边界判定用 YAML 的缩进规则，不是关键词猜测', () => {
    it('顶格的键结束 description', () => {
      const block = `<!-- diagram-start
description: |
  第一行
  第二行
title: 后面的标题
diagram-end -->`;
      const d = onlyBlock(block).description;
      expect(d).toContain('第二行');
      expect(d).not.toContain('title:');
    });

    it('缩进的「nodes:」是散文的一部分，不结束 description', () => {
      const block = `<!-- diagram-start
description: |
  说明如下：
    nodes: 这里是正文里提到的字段名，不是 YAML 键
  继续说明
type: flow
diagram-end -->`;
      const d = onlyBlock(block).description;
      expect(d).toContain('nodes: 这里是正文里提到的字段名');
      expect(d).toContain('继续说明');
    });

    it('prose 里出现形如 `- id: xxx` 的缩进行，也不结束 description', () => {
      const block = `<!-- diagram-start
description: |
  节点列表：
    - id: 这是正文里的举例
type: flow
diagram-end -->`;
      expect(onlyBlock(block).description).toContain('- id: 这是正文里的举例');
    });

    it('带下划线与数字的键也能识别为边界', () => {
      const block = `<!-- diagram-start
description: |
  正文
high_weight: true
diagram-end -->`;
      expect(onlyBlock(block).description).not.toContain('high_weight');
    });
  });

  describe('其他字段仍然正常提取', () => {
    it('type 与 title 不受影响', () => {
      const b = onlyBlock(STRUCTURED_BLOCK);
      expect(b.type).toBe('flow');
      expect(b.title).toBe('故障处置全流程与时限控制点');
    });

    it('内联 description（不带 |）之后跟键也正常', () => {
      const block = `<!-- diagram-start
description: 一句话说明
type: concept
diagram-end -->`;
      const b = onlyBlock(block);
      expect(b.description).toBe('一句话说明');
      expect(b.type).toBe('concept');
    });

    it('description 在前、type/title 在后，三个字段都要拿到', () => {
      const block = `<!-- diagram-start
description: |
  正文描述
type: architecture
title: 架构图
diagram-end -->`;
      const b = onlyBlock(block);
      expect(b.description.trim()).toBe('正文描述');
      expect(b.type).toBe('architecture');
      expect(b.title).toBe('架构图');
    });
  });

  describe('真实事故的回归断言：结构化块不能退化出「字段名节点」', () => {
    it('块里所有顶层键都不会被当成 description 内容', () => {
      const d = onlyBlock(STRUCTURED_BLOCK).description;
      for (const key of ['containers', 'nodes', 'edges', 'label', 'container', 'owner', 'high_weight', 'detail', 'style', 'from', 'to']) {
        expect(d, `description 不应包含顶层键 ${key}:`).not.toMatch(new RegExp(`^\\s*${key}:`, 'm'));
      }
    });
  });
});
