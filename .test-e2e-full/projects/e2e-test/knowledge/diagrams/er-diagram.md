---
title: 技术文档图表-ER图
tags: [技术文档, ER图, 实体关系图, 数据库设计, Crow's Foot]
scope: undefined
status: active
priority: normal
source: manual
created: 2026-07-15
updated: 2026-07-15
---

# 技术文档图表 - ER 图（实体关系图）

> 上级索引：[[技术文档图表-选型指南]]
> 语法参考：[[技术文档图表-Mermaid语法参考]] | [[技术文档图表-PlantUML语法参考]]

---

## 视觉表现形式

- **核心元素**：表结构卡片 + 关系连线
- **卡片式**：表名 + 字段列表，标注 PK（主键）、FK（外键）
- **关系记号**：
  - 乌鸦脚记号（Crow's Foot）表示 1:N、M:N
  - 连线标注基数（1、N、M）和参与度（强制/可选）
- **其他记号法**：Chen 记号法（椭圆表示实体）

## 典型结构

```
  ┌──────────────────┐          ┌──────────────────┐
  │     users         │          │     orders        │
  ├──────────────────┤          ├──────────────────┤
  │ PK  id    INT    │──1:N────│ FK  user_id  INT  │
  │     name  VARCHAR│          │ PK  id      INT   │
  │     email VARCHAR│          │     amount DECIMAL│
  │     created_at   │          │     status  ENUM  │
  └──────────────────┘          │     created_at    │
                                └──────────────────┘
```

## 使用场景

| 场景 | 目的 |
|------|------|
| 数据库设计文档 | 展示表结构和关联关系 |
| 数据模型评审 | 评估数据设计的合理性 |
| 新人培训 | 了解系统的数据存储结构 |
| 数据迁移 | 梳理需要迁移的表和关系 |

## 适用文档类型

数据库设计文档、架构设计文档、数据迁移方案

## 推荐工具

| 工具 | 适用情况 |
|------|---------|
| dbdiagram.io | 专为 ER 图设计，支持 DSL |
| Mermaid `erDiagram` | Markdown 内嵌 |
| PlantUML | 完整 UML 支持 |
| draw.io | 通用绘图 |

## 绘图要点

1. 表名用复数形式（users, orders）
2. 字段标注类型和约束（PK/FK/NOT NULL/UNIQUE）
3. 关系连线标注基数（1:1、1:N、M:N）
4. 按业务域分组排列相关的表
5. 大系统拆分为多个子 ER 图，每个图不超过 8 张表
