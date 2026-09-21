import { describe, it, expect } from 'vitest';
import { parseStructuredDiagram } from '../../src/diagrams/structured-parser.js';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { getDefaultDiagramStyle } from '../../src/diagrams/style.js';

/**
 * 边标签不能与容器标签重叠 ✓
 *
 * 背景：ch006-fig3 的 "改进反哺" 边标签 @ (94,174) 与 "指标计算" 容器标签
 * @ (111,170) 重叠 ✗。容器标签位置固定（容器左上角），边标签位置由路由算法
 * 计算，但算法没避开容器标签。
 *
 * 本测试锁的是：边标签的占位框不能与容器标签的占位框重叠 ✓。
 */

const SPEC = `<!-- diagram-start
type: flow
title: SLA 指标度量与考核数据流
containers:
  - id: source
    label: 数据来源
    nodes: [itsm, change, monitor, log]
  - id: compute
    label: 指标计算
    nodes: [engine, availability, timeliness]
  - id: report
    label: 报告考核
    nodes: [monthly, quarterly, yearly]
nodes:
  - id: itsm
    label: ITSM 工单系统
    container: source
  - id: change
    label: 变更记录
    container: source
  - id: monitor
    label: 监控与 APM
    container: source
  - id: log
    label: 日志与链路追踪
    container: source
  - id: engine
    label: 指标计算引擎
    container: compute
    high_weight: true
  - id: availability
    label: 可用性计算
    container: compute
  - id: timeliness
    label: 时限达成统计
    container: compute
  - id: monthly
    label: 月度服务报告
    container: report
  - id: quarterly
    label: 季度 SLA 考核
    container: report
  - id: yearly
    label: 年度服务总评
    container: report
edges:
  - from: itsm
    to: engine
    label: 指标计算
  - from: change
    to: engine
    label: 指标计算
  - from: monitor
    to: availability
    label: 指标计算
  - from: log
    to: timeliness
    label: 指标计算
  - from: engine
    to: monthly
    label: 报告考核
  - from: availability
    to: quarterly
    label: 报告考核
  - from: timeliness
    to: yearly
    label: 报告考核
  - from: quarterly
    to: itsm
    label: 改进反哺
diagram-end -->`;

describe('边标签不能与容器标签重叠', () => {
  it('边标签的占位框不能与容器标签的占位框重叠', () => {
    const spec = parseStructuredDiagram(SPEC);
    const result = layoutDiagram(spec, getDefaultDiagramStyle(), 'SLA 指标度量与考核数据流');

    // 计算容器标签的占位框
    const containerLabelBoxes = result.containers
      .filter(c => c.label)
      .map(c => ({
        x: c.x + 8,
        y: c.y + result.metrics.fontSize + 4 - result.metrics.fontSize * 0.8,
        w: c.label.length * (result.metrics.fontSize - 1) * 0.6, // 估算宽度
        h: result.metrics.fontSize * 1.2,
      }));

    // 计算边标签的占位框
    const edgeLabelBoxes = result.edges
      .filter(e => e.label && e.labelAt)
      .map(e => {
        const w = e.label!.length * 11 * 0.6 + 12; // 估算宽度
        const h = 11 * 1.2 + 8;
        return {
          x: e.labelAnchor === 'middle' ? e.labelAt!.x - w / 2 : e.labelAt!.x,
          y: e.labelAt!.y - h * 0.8,
          w,
          h,
        };
      });

    // 检查重叠
    let overlaps = 0;
    for (const edgeBox of edgeLabelBoxes) {
      for (const containerBox of containerLabelBoxes) {
        const intersects =
          edgeBox.x < containerBox.x + containerBox.w &&
          edgeBox.x + edgeBox.w > containerBox.x &&
          edgeBox.y < containerBox.y + containerBox.h &&
          edgeBox.y + edgeBox.h > containerBox.y;

        if (intersects) {
          overlaps++;
          console.log(`  边标签与容器标签重叠`);
        }
      }
    }

    expect(overlaps).toBe(0);
  });
});
