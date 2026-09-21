import { describe, it, expect } from 'vitest';
import { parseStructuredDiagram } from '../../src/diagrams/structured-parser.js';
import { layoutDiagram } from '../../src/diagrams/layout/index.js';
import { loadDiagramStyle } from '../../src/diagrams/style.js';

/**
 * 边标签之间不能互相重叠 ✓
 *
 * 背景：ch002-fig2 中"消息订阅"与"缓存"两个边标签重叠 ✗。
 * 用项目的 compact 样式（fontSize=11）复现。
 */

const SPEC = `<!-- diagram-start
type: flow
title: 容器化部署与实时推送架构
containers:
  - id: client
    label: 客户端
    nodes: [pc, mobile, third]
  - id: gateway
    label: 接入网关
    nodes: [api_gw, ws_gw, sdk]
  - id: service
    label: 微服务层
    nodes: [biz_svc, data_svc, push_svc]
  - id: infra
    label: 数据与基础设施
    nodes: [redis, mq, rdb, tsdb, k8s]
nodes:
  - id: pc
    label: PC 端
    container: client
  - id: mobile
    label: 移动 APP
    container: client
  - id: third
    label: 第三方系统
    container: client
  - id: api_gw
    label: API 网关
    container: gateway
  - id: ws_gw
    label: WebSocket 网关
    container: gateway
  - id: sdk
    label: 多语言 SDK
    container: gateway
  - id: biz_svc
    label: 业务微服务
    container: service
  - id: data_svc
    label: 数据服务
    container: service
  - id: push_svc
    label: 推送服务
    container: service
  - id: redis
    label: Redis 集群
    container: infra
  - id: mq
    label: 消息队列
    container: infra
  - id: rdb
    label: 关系型数据库
    container: infra
  - id: tsdb
    label: 时序数据库
    container: infra
  - id: k8s
    label: K8s 编排
    container: infra
edges:
  - from: pc
    to: api_gw
    label: HTTPS
  - from: mobile
    to: ws_gw
    label: WebSocket
  - from: third
    to: sdk
    label: SDK 调用
  - from: api_gw
    to: biz_svc
    label: 路由
  - from: ws_gw
    to: data_svc
    label: 路由
  - from: sdk
    to: push_svc
    label: 连接管理
  - from: biz_svc
    to: redis
    label: 缓存
  - from: biz_svc
    to: mq
    label: 事件发布
  - from: data_svc
    to: rdb
    label: 持久化
  - from: data_svc
    to: tsdb
    label: 缓存
  - from: push_svc
    to: mq
    label: 消息订阅
  - from: push_svc
    to: k8s
    label: 编排调度
diagram-end -->`;

describe('边标签之间不能互相重叠', () => {
  it('任何两个边标签的占位框不能重叠（compact 样式）', () => {
    const spec = parseStructuredDiagram(SPEC);
    // 用项目的 compact 样式
    const style = loadDiagramStyle('/home/water/Projects/t3/projects/LmERP2');
    const result = layoutDiagram(spec, style, '容器化部署与实时推送架构');

    // 计算边标签的占位框
    const labelBoxes = result.edges
      .filter(e => e.label && e.labelAt)
      .map(e => {
        const fontSize = Math.max(9, result.metrics.fontSize - 2);
        const w = e.label!.length * fontSize * 0.6 + 12;
        const h = fontSize * 1.2 + 8;
        return {
          label: e.label!,
          x: e.labelAnchor === 'middle' ? e.labelAt!.x - w / 2 : e.labelAt!.x,
          y: e.labelAt!.y - h * 0.8,
          w,
          h,
        };
      });

    // 检查重叠
    let overlaps = 0;
    for (let i = 0; i < labelBoxes.length; i++) {
      for (let j = i + 1; j < labelBoxes.length; j++) {
        const a = labelBoxes[i];
        const b = labelBoxes[j];
        const intersects =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;

        if (intersects) {
          overlaps++;
          console.log(`  边标签重叠: "${a.label}" @ (${a.x.toFixed(0)},${a.y.toFixed(0)}) 与 "${b.label}" @ (${b.x.toFixed(0)},${b.y.toFixed(0)})`);
        }
      }
    }

    expect(overlaps).toBe(0);
  });
});
