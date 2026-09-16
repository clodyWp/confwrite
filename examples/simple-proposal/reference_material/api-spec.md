# API 规范文档

## 概述

本文档定义了系统的 API 接口规范。

## 性能指标

- 系统可用性: 99.99%
- 平均响应时间: < 100ms
- 最大并发用户数: 10000

## 接口定义

### 用户接口

#### 创建用户

```
POST /api/users
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**响应**：
```
201 Created
{
  "id": "string",
  "username": "string",
  "email": "string",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### 获取用户

```
GET /api/users/:id
```

**响应**：
```
200 OK
{
  "id": "string",
  "username": "string",
  "email": "string"
}
```

### 数据接口

#### 查询数据

```
GET /api/data?page=1&limit=20
```

**响应**：
```
200 OK
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 认证方式

使用 JWT Token 进行认证：

```
Authorization: Bearer <token>
```

Token 有效期为 24 小时。
