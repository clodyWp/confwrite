---
title: 技术文档图表-Mermaid语法参考
tags: [Mermaid, 图表语法, 技术文档, 流程图, 时序图, ER图, 状态图, 类图]
scope: undefined
status: active
priority: normal
source: manual
created: 2026-07-15
updated: 2026-07-15
---

# 技术文档图表 - Mermaid 语法参考

> 本页面提供 Mermaid 各类图表的语法模板，Agent 生成技术文档时可直接参考使用。
> 上级页面：[[技术文档图表-选型指南]]

---

## 1. 架构图 / 流程图（Graph）

### 有向图（从上到下）
```mermaid
graph TD
    A[客户端] --> B[Nginx]
    B --> C[API Gateway]
    C --> D[用户服务]
    C --> E[订单服务]
    C --> F[支付服务]
    D --> G[(MySQL)]
    E --> G
    E --> H[(Redis)]
    F --> H
```

### 有向图（从左到右）
```mermaid
graph LR
    A[请求] --> B{鉴权}
    B -->|通过| C[处理业务]
    B -->|拒绝| D[返回401]
    C --> E[写入数据库]
    E --> F[返回结果]
```

### 子图（分层架构）
```mermaid
graph TD
    subgraph 表现层
        A[Web App] --> B[Mobile App]
    end
    subgraph 服务层
        C[用户服务] --> D[订单服务]
        D --> E[支付服务]
    end
    subgraph 数据层
        F[(MySQL)]
        G[(Redis)]
        H[RabbitMQ]
    end
    表现层 --> 服务层
    服务层 --> 数据层
```

### 样式设置
```mermaid
graph TD
    A[前端] -->|HTTP| B[后端]
    B -->|SQL| C[(数据库)]

    style A fill:#4CAF50,color:#fff
    style B fill:#2196F3,color:#fff
    style C fill:#FF9800,color:#fff
```

---

## 2. 时序图（Sequence Diagram）

### 基础时序图
```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant B as 后端
    participant D as 数据库

    U->>F: 点击登录
    F->>B: POST /api/login
    B->>D: SELECT * FROM users
    D-->>B: 返回用户数据
    B-->>F: 200 OK + Token
    F-->>U: 跳转首页
```

### 带循环和条件
```mermaid
sequenceDiagram
    participant C as 客户端
    participant S as 服务端

    C->>S: 发送请求
    alt 参数合法
        S->>S: 处理业务逻辑
        loop 重试机制(最多3次)
            S->>S: 执行操作
        end
        S-->>C: 返回成功
    else 参数非法
        S-->>C: 返回400错误
    end
```

### 带激活条和注释
```mermaid
sequenceDiagram
    participant A as 服务A
    participant B as 服务B
    participant C as 服务C

    A->>B: 调用接口
    activate B
    Note right of B: 处理中...
    B->>C: 转发请求
    activate C
    C-->>B: 返回结果
    deactivate C
    B-->>A: 返回结果
    deactivate B
```

---

## 3. ER 图（Entity Relationship Diagram）

### 基础 ER 图
```mermaid
erDiagram
    USERS ||--o{ ORDERS : "1:N"
    ORDERS ||--|{ ORDER_ITEMS : "1:N"
    PRODUCTS ||--o{ ORDER_ITEMS : "1:N"

    USERS {
        int id PK
        string name
        string email
        datetime created_at
    }
    ORDERS {
        int id PK
        int user_id FK
        decimal amount
        enum status
        datetime created_at
    }
    ORDER_ITEMS {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        decimal price
    }
    PRODUCTS {
        int id PK
        string name
        decimal price
        int stock
    }
```

### 关系类型说明
| 符号 | 含义 | 示例 |
|------|------|------|
| `\|\|--\|\|` | 一对一 | 用户-身份证 |
| `\|\|--o{` | 一对多 | 用户-订单 |
| `}o--o{` | 多对多 | 学生-课程 |
| `\|\|-\|{` | 一对多(强制) | 订单-订单项 |

---

## 4. 状态图（State Diagram）

### 基础状态图
```mermaid
stateDiagram-v2
    [*] --> 待支付 : 创建订单
    待支付 --> 已支付 : 支付成功
    待支付 --> 已取消 : 超时取消
    已支付 --> 待发货 : 商家确认
    待发货 --> 运输中 : 发货
    运输中 --> 已完成 : 签收确认
    已完成 --> [*]
    已取消 --> [*]
```

### 复合状态
```mermaid
stateDiagram-v2
    [*] --> 订单创建

    state 订单处理 {
        待支付 --> 已支付 : 支付
        已支付 --> 待发货 : 确认
        待发货 --> 已发货 : 发货
    }

    订单处理 --> 已完成 : 签收
    订单处理 --> 已取消 : 取消
    已完成 --> [*]
    已取消 --> [*]
```

### 带条件分支
```mermaid
stateDiagram-v2
    [*] --> 审核中
    审核中 --> 已通过 : 审核通过
    审核中 --> 已拒绝 : 审核拒绝
    已拒绝 --> 审核中 : 重新提交
    已通过 --> 执行中 : 开始执行
    执行中 --> 已完成 : 执行完成
    已完成 --> [*]
```

---

## 5. 类图（Class Diagram）

### 基础类图
```mermaid
classDiagram
    class UserService {
        <<interface>>
        +getUser(id: int) User
        +createUser(user: User) User
        +deleteUser(id: int) bool
    }

    class UserServiceImpl {
        -repo: UserRepository
        -cache: RedisCache
        +getUser(id: int) User
        +createUser(user: User) User
        +deleteUser(id: int) bool
    }

    class UserRepository {
        <<interface>>
        +findById(id: int) User
        +save(user: User) void
        +delete(id: int) void
    }

    UserService <|.. UserServiceImpl : implements
    UserServiceImpl --> UserRepository : depends on
```

### 继承和实现
```mermaid
classDiagram
    class Animal {
        +name: String
        +age: int
        +makeSound() void
    }
    class Dog {
        +breed: String
        +makeSound() void
    }
    class Cat {
        +color: String
        +makeSound() void
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

---

## 6. 流程图（Flowchart）- 高级用法

### 泳道图
```mermaid
graph TD
    subgraph 用户
        A[提交订单] --> B[等待支付]
        B --> H[确认收货]
    end
    subgraph 商家
        C[接收订单] --> D[发货]
    end
    subgraph 平台
        E[创建订单] --> F[处理支付]
        F --> G[通知商家]
    end
    A --> E
    F --> B
    G --> C
    D --> H
```

### 决策流程
```mermaid
graph TD
    A[开始] --> B{是否已登录?}
    B -->|是| C{是否有权限?}
    B -->|否| D[跳转登录页]
    C -->|是| E[执行业务逻辑]
    C -->|否| F[返回403]
    D --> G[登录成功?]
    G -->|是| C
    G -->|否| H[返回错误]
    E --> I[返回结果]
```

---

## 7. 常用配置

### 主题设置
```
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#4CAF50'}}}%%
```

### 方向设置
| 值 | 方向 |
|----|------|
| TD | 从上到下 |
| TB | 从上到下（同TD） |
| BT | 从下到上 |
| LR | 从左到右 |
| RL | 从右到左 |

### 节点形状
| 语法 | 形状 |
|------|------|
| `A[文本]` | 矩形 |
| `A(文本)` | 圆角矩形 |
| `A([文本])` | 体育场形 |
| `A文本` | 子程序形 |
| `A[(文本)]` | 圆柱形(数据库) |
| `A>文本]` | 非对称形 |
| `A{文本}` | 菱形(判断) |
| `A{{文本}}` | 六边形 |
| `A[/文本/]` | 平行四边形 |
| `A[\文本\]` | 反向平行四边形 |
| `A[/文本\]` | 梯形 |
| `A[\文本/]` | 倒梯形 |

---

## Agent 使用建议

1. **优先使用 Mermaid**：纯文本格式，可 git 版本管理，Markdown 原生支持
2. **图要简洁**：一张图不超过 15 个节点，复杂系统拆分为多张图
3. **标注清晰**：箭头上标注调用方式或数据内容
4. **颜色有意义**：用颜色区分职责域，不要随意上色
5. **配合文字**：图后紧跟文字说明，解释关键决策
