# 系统架构设计

## 技术栈
- 前端: React + TypeScript
- 后端: Node.js + Express
- 数据库: PostgreSQL 15
- 缓存: Redis 7

## 架构模式
采用微服务架构，主要服务包括：
- 用户服务 (user-service)
- 数据服务 (data-service)
- 通知服务 (notification-service)

## 部署架构
- 容器化: Docker + Kubernetes
- CI/CD: GitHub Actions
- 监控: Prometheus + Grafana
