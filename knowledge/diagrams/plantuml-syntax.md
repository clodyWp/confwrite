---
title: 技术文档图表-PlantUML语法参考
tags: [PlantUML, 图表语法, 技术文档, UML, 时序图, 类图, 活动图, 部署图, 组件图]
scope: undefined
status: active
priority: normal
source: manual
created: 2026-07-15
updated: 2026-07-15
---

# 技术文档图表 - PlantUML 语法参考

> 本页面提供 PlantUML 各类图表的语法模板，Agent 生成技术文档时可直接参考使用。
> 上级页面：[[技术文档图表-选型指南]]

---

## 1. 用例图（Use Case Diagram）

```plantuml
@startuml
left to right direction
actor 用户 as user
actor 管理员 as admin

rectangle 电商系统 {
    usecase 浏览商品 as UC1
    usecase 下单购买 as UC2
    usecase 管理库存 as UC3
    usecase 处理退款 as UC4
}

user --> UC1
user --> UC2
admin --> UC3
admin --> UC4
UC2 ..> UC4 : <<include>>
@enduml
```

---

## 2. 时序图（Sequence Diagram）

### 基础时序图
```plantuml
@startuml
participant "用户" as U
participant "前端" as F
participant "后端" as B
database "MySQL" as D

U -> F: 点击登录
F -> B: POST /api/login
B -> D: SELECT * FROM users
D --> B: 返回用户数据
B --> F: 200 OK + Token
F --> U: 跳转首页
@enduml
```

### 带分组和条件
```plantuml
@startuml
participant A
participant B
participant C

A -> B: 发送请求
activate B

alt 条件1
    B -> C: 转发请求
    activate C
    C --> B: 返回结果
    deactivate C
else 条件2
    B -> B: 本地处理
end

B --> A: 返回结果
deactivate B

loop 最多重试3次
    A -> B: 重试请求
end
@enduml
```

### 自动编号
```plantuml
@startuml
autonumber
participant A
participant B
participant C

A -> B: 第一步
B -> C: 第二步
C --> A: 第三步
@enduml
```

---

## 3. 类图（Class Diagram）

### 基础类图
```plantuml
@startuml
interface UserService {
    +getUser(id: int): User
    +createUser(user: User): User
    +deleteUser(id: int): boolean
}

class UserServiceImpl {
    -repo: UserRepository
    -cache: RedisCache
    +getUser(id: int): User
    +createUser(user: User): User
    +deleteUser(id: int): boolean
}

interface UserRepository {
    +findById(id: int): User
    +save(user: User): void
    +delete(id: int): void
}

class MysqlUserRepository

UserService <|.. UserServiceImpl
UserServiceImpl --> UserRepository
UserRepository <|.. MysqlUserRepository
@enduml
```

### 关系类型
```plantuml
@startuml
class A
class B
class C
class D
class E
class F

' 继承
B --|> A : extends

' 实现
C ..|> A : implements

' 组合（强依赖，生命周期绑定）
D *-- A : composition

' 聚合（弱依赖，可独立存在）
E o-- A : aggregation

' 关联
F -- A : association

' 依赖（最弱）
F ..> A : depends on
@enduml
```

### 抽象类和枚举
```plantuml
@startuml
abstract class Shape {
    +{abstract} draw(): void
    +getArea(): double
}

class Circle {
    -radius: double
    +draw(): void
    +getArea(): double
}

class Rectangle {
    -width: double
    -height: double
    +draw(): void
    +getArea(): double
}

enum Color {
    RED
    GREEN
    BLUE
}

Shape <|-- Circle
Shape <|-- Rectangle
Shape --> Color
@enduml
```

---

## 4. 活动图 / 流程图（Activity Diagram）

### 基础活动图
```plantuml
@startuml
start
:接收请求;
if (参数合法?) then (是)
    :处理业务逻辑;
    :写入数据库;
    :返回成功;
else (否)
    :返回错误信息;
endif
stop
@enduml
```

### 泳道图
```plantuml
@startuml
|用户|
start
:提交订单;

|平台|
:创建订单记录;
:处理支付;

|商家|
:接收订单通知;
:准备商品;
:发货;

|用户|
:确认收货;
stop
@enduml
```

### 并行执行
```plantuml
@startuml
start
:开始任务;

fork
    :任务A;
    :任务A完成;
fork again
    :任务B;
    :任务B完成;
fork again
    :任务C;
    :任务C完成;
end fork

:汇总结果;
stop
@enduml
```

### 循环和条件
```plantuml
@startuml
start
while (还有数据?) is (是)
    :处理一条数据;
    if (处理成功?) then (是)
        :记录成功;
    else (否)
        :记录失败;
        :发送告警;
    endif
endwhile (否)
:输出统计报告;
stop
@enduml
```

---

## 5. 状态图（State Diagram）

### 基础状态图
```plantuml
@startuml
[*] --> 待支付 : 创建订单
待支付 --> 已支付 : 支付成功
待支付 --> 已取消 : 超时30分钟
已支付 --> 待发货 : 商家确认
待发货 --> 运输中 : 快递揽收
运输中 --> 已完成 : 用户签收
已完成 --> [*]
已取消 --> [*]
@enduml
```

### 复合状态
```plantuml
@startuml
[*] --> 订单创建

state "订单处理" as OrderProcess {
    [*] --> 待支付
    待支付 --> 已支付 : 支付
    已支付 --> 待发货 : 确认
    待发货 --> 已发货 : 发货
}

OrderProcess --> 已完成 : 签收
OrderProcess --> 已取消 : 取消/退款
已完成 --> [*]
已取消 --> [*]
@enduml
```

### 带动作和守卫条件
```plantuml
@startuml
[*] --> 空闲
空闲 --> 处理中 : 收到请求 [请求数>0]
处理中 --> 处理中 : 继续处理 / 处理下一条
处理中 --> 完成 : 全部处理完毕 / 记录日志
完成 --> 空闲 : 重置状态 / 清空缓存
@enduml
```

---

## 6. 组件图（Component Diagram）

```plantuml
@startuml
package "前端" {
    [Web App] as web
    [Mobile App] as mobile
}

package "后端" {
    [API Gateway] as gw
    [用户服务] as user_svc
    [订单服务] as order_svc
    [支付服务] as pay_svc
}

package "数据层" {
    database "MySQL" as db
    database "Redis" as cache
    queue "RabbitMQ" as mq
}

web --> gw
mobile --> gw
gw --> user_svc
gw --> order_svc
gw --> pay_svc
user_svc --> db
order_svc --> db
order_svc --> cache
pay_svc --> mq
@enduml
```

---

## 7. 部署图（Deployment Diagram）

```plantuml
@startuml
node "CDN" {
    artifact [静态资源]
}

node "负载均衡 (SLB)" {
}

node "K8s Cluster" {
    node "Pod-1" {
        artifact [API Server]
    }
    node "Pod-2" {
        artifact [API Server]
    }
    node "Pod-3" {
        artifact [API Server]
    }
}

node "数据库集群" {
    database "MySQL Master"
    database "MySQL Slave"
    "MySQL Master" --> "MySQL Slave" : 主从同步
}

[CDN] --> [负载均衡]
[负载均衡] --> [Pod-1]
[负载均衡] --> [Pod-2]
[负载均衡] --> [Pod-3]
[Pod-1] --> [数据库集群]
[Pod-2] --> [数据库集群]
[Pod-3] --> [数据库集群]
@enduml
```

---

## 8. 对象图（Object Diagram）

```plantuml
@startuml
object user1 : User {
    id = 1
    name = "张三"
    email = "zhangsan@example.com"
}

object order1 : Order {
    id = 1001
    amount = 299.00
    status = "PAID"
}

object item1 : OrderItem {
    product_id = 55
    quantity = 2
    price = 149.50
}

user1 --> "1..*" order1
order1 --> "1..*" item1
@enduml
```

---

## 9. 通用样式设置

### 皮肤参数
```plantuml
@startuml
skinparam backgroundColor #FEFEFE
skinparam componentStyle rectangle
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 12
skinparam shadowing false
skinparam roundcorner 10
skinparam maxMessageSize 100

' 颜色主题
skinparam sequence {
    ArrowColor #666
    ActorBorderColor #333
    LifeLineBorderColor #999
    ParticipantBackgroundColor #E3F2FD
    ParticipantBorderColor #1565C0
}
@enduml
```

### 常用皮肤参数
| 参数 | 说明 | 示例值 |
|------|------|--------|
| `backgroundColor` | 背景色 | `#FEFEFE` |
| `defaultFontName` | 默认字体 | `"Microsoft YaHei"` |
| `defaultFontSize` | 默认字号 | `12` |
| `shadowing` | 是否显示阴影 | `false` |
| `roundcorner` | 圆角大小 | `10` |
| `linetype` | 线条类型 | `ortho` / `polyline` |

### 颜色定义
```plantuml
' 命名颜色
skinparam componentBackgroundColor LightBlue

' HEX 颜色
skinparam componentBackgroundColor #E3F2FD

' 渐变
skinparam componentBackgroundColor #E3F2FD-#BBDEFB
```

---

## 10. 中文显示注意事项

### 字体设置
```plantuml
@startuml
!define NOTE_FONTNAME "Microsoft YaHei"
skinparam defaultFontName "Microsoft YaHei"
' Windows: "Microsoft YaHei", "SimHei"
' macOS: "PingFang SC", "Heiti SC"
' Linux: "WenQuanYi Micro Hei", "Noto Sans CJK SC"
@enduml
```

### 编码
- PlantUML 文件应保存为 UTF-8 编码
- 在文件开头添加 `@startuml` 和 `@enduml`

---

## Agent 使用建议

1. **PlantUML vs Mermaid 选择**：
   - 需要完整 UML 支持 → PlantUML
   - 需要 Markdown 内嵌 → Mermaid
   - 需要复杂样式控制 → PlantUML
   - 需要 git 友好 → 两者都可以（都是文本）

2. **图表命名规范**：
   - 文件命名：`{文档类型}-{图表类型}.puml`
   - 示例：`arch-sequence-login.puml`、`db-er-order.puml`

3. **图片导出**：
   - 命令行：`plantuml -tpng file.puml`
   - 支持格式：PNG、SVG、PDF、EPS
   - SVG 推荐用于 Web 文档（矢量、可搜索）

4. **与 Mermaid 对照**：

| 图表类型 | Mermaid 关键字 | PlantUML 关键字 |
|---------|---------------|----------------|
| 流程图 | `graph TD/LR` | `start/stop` (活动图) |
| 时序图 | `sequenceDiagram` | `participant/->` |
| ER图 | `erDiagram` | `entity` 或无专用(用类图替代) |
| 状态图 | `stateDiagram-v2` | `[*] -->` |
| 类图 | `classDiagram` | `class/interface` |
| 部署图 | 无原生支持 | `node/artifact` |
| 组件图 | 无原生支持 | `package/component` |
