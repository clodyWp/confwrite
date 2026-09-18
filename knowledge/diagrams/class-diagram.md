---
title: 技术文档图表-类图
tags: [技术文档, 类图, UML, Class Diagram]
scope: undefined
status: active
priority: normal
source: manual
created: 2026-07-15
updated: 2026-07-15
---

# 技术文档图表 - 类图（UML Class Diagram）

> 上级索引：[[技术文档图表-选型指南]]
> 语法参考：[[技术文档图表-Mermaid语法参考]] | [[技术文档图表-PlantUML语法参考]]

---

## 视觉表现形式

- **核心元素**：三层方框（类名/属性/方法）+ 关系箭头
- **关系类型**：
  - 实线空心三角 = 继承（extends）
  - 虚线空心三角 = 实现接口（implements）
  - 实线菱形 = 组合（composition，强依赖，生命周期绑定）
  - 虚线菱形 = 聚合（aggregation，弱依赖，可独立存在）
  - 实线箭头 = 关联（association）
  - 虚线箭头 = 依赖（dependency，最弱）
- **可见性标注**：`+` 公开，`-` 私有，`#` 保护
- **可标注**：抽象类（`«abstract»`）、接口（`«interface»`）

## 典型结构

```
  ┌─────────────────────┐
  │    «interface»       │
  │     UserService      │
  ├─────────────────────┤
  │ + getUser(id): User  │
  │ + createUser(): User │
  └──────────┬──────────┘
             │ implements
             │
  ┌──────────▼──────────┐
  │   UserServiceImpl    │
  ├─────────────────────┤
  │ - repo: UserRepo    │
  │ - cache: RedisCache │
  ├─────────────────────┤
  │ + getUser(id): User  │
  │ + createUser(): User │
  └─────────────────────┘
```

## 使用场景

| 场景 | 目的 |
|------|------|
| 代码设计文档 | 展示核心模块的代码结构 |
| 架构评审 | 评估类的职责划分和依赖关系 |
| 重构文档 | 展示重构前后的类结构变化 |
| 设计模式文档 | 说明使用的设计模式 |

## 适用文档类型

详细设计文档、代码规范文档、重构方案

## 推荐工具

| 工具 | 适用情况 |
|------|---------|
| PlantUML | 功能最全的 UML 工具 |
| Mermaid `classDiagram` | Markdown 内嵌 |
| draw.io | 通用绘图 |
| IntelliJ 内置 | 从代码自动生成 |

## 绘图要点

1. 只展示关键类，不要把所有类都画上去
2. 关系类型要准确（继承 vs 实现 vs 组合 vs 聚合）
3. 方法签名包含参数类型和返回类型
4. 接口和抽象类要明确标注
5. 大系统按模块拆分为多张类图
