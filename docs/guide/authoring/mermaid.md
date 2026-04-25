# Mermaid 图表全集

zdoc 原生支持 Mermaid：用 ` ```mermaid ` 代码块即可渲染 SVG 图表。以下是 Mermaid 支持的所有主要图表类型。

## 流程图（Flowchart）

最常用的图表类型，适合展示流程、算法、决策树。

```mermaid
flowchart TD
    Start([用户访问]) --> Auth{已登录?}
    Auth -->|否| Login[显示登录页]
    Auth -->|是| Dashboard[显示仪表盘]
    Login --> Creds[输入凭据]
    Creds --> Validate{有效?}
    Validate -->|是| Dashboard
    Validate -->|否| Error[显示错误]
    Error --> Login
```

### 节点形状速查

```mermaid
flowchart LR
    A[矩形] --> B([圆角矩形])
    B --> C(体育场形)
    C --> D[[子程序]]
    D --> E[(数据库)]
    E --> F((圆形))
    F --> G{菱形判断}
    G --> H{{六边形}}
    H --> I[/平行四边形/]
```

### 子图与方向

```mermaid
flowchart TB
    subgraph Frontend
        direction LR
        A[Web App] --> B[Mobile App]
    end
    subgraph Backend
        direction TB
        C[API Gateway] --> D[Auth Service]
        C --> E[Business Service]
    end
    B --> C
    A --> C
    D --> F[(Database)]
    E --> F
```

## 时序图（Sequence Diagram）

展示参与者之间的消息交互，适合 API 流程、认证过程。

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Frontend
    participant API
    participant DB

    User->>+Frontend: 点击登录
    Frontend->>+API: POST /auth/login
    API->>+DB: 查询用户
    DB-->>-API: 用户记录

    alt 密码正确
        API-->>Frontend: 200 + JWT
        Frontend-->>-User: 跳转仪表盘
    else 密码错误
        API-->>Frontend: 401
        Frontend-->>-User: 显示错误
    end
```

### 并行与循环

```mermaid
sequenceDiagram
    participant Order
    participant Payment
    participant Inventory
    participant Notify

    Order->>Payment: 扣款
    Payment-->>Order: 扣款成功

    par 并行处理
        Order->>Inventory: 扣减库存
    and
        Order->>Notify: 发送确认邮件
    end

    loop 每 30 秒轮询
        Order->>Payment: 查询状态
        Payment-->>Order: 处理中
    end
```

## 类图（Class Diagram）

面向对象设计、领域建模，展示类、属性、方法和关系。

```mermaid
classDiagram
    class User {
        +UUID id
        +String email
        +String name
        +login(password) bool
        +getOrders() List~Order~
    }

    class Order {
        +UUID id
        +DateTime createdAt
        +OrderStatus status
        +calculateTotal() Decimal
        +cancel()
    }

    class LineItem {
        +int quantity
        +Decimal pricePerUnit
        +getSubtotal() Decimal
    }

    class Product {
        +UUID id
        +String name
        +Decimal price
        +isAvailable() bool
    }

    class OrderStatus {
        <<enumeration>>
        PENDING
        PAID
        SHIPPED
        CANCELLED
    }

    User "1" --> "0..*" Order : places
    Order "1" *-- "1..*" LineItem : contains
    LineItem "1" --> "1" Product : references
    Order --> OrderStatus
```

### 设计模式示例

```mermaid
classDiagram
    class PaymentStrategy {
        <<interface>>
        +pay(amount: Decimal)*
    }

    class CreditCardPayment {
        +pay(amount: Decimal)
    }

    class PayPalPayment {
        +pay(amount: Decimal)
    }

    class PaymentProcessor {
        -PaymentStrategy strategy
        +setStrategy(s: PaymentStrategy)
        +processPayment(amount: Decimal)
    }

    PaymentStrategy <|.. CreditCardPayment
    PaymentStrategy <|.. PayPalPayment
    PaymentProcessor --> PaymentStrategy
```

## ER 图（Entity Relationship Diagram）

数据库建模，展示表、字段和关系。

```mermaid
erDiagram
    USER ||--o{ POST : creates
    USER ||--o{ COMMENT : writes
    POST ||--o{ COMMENT : receives
    POST }o--o{ TAG : tagged_with
    POST }o--|| CATEGORY : "belongs to"

    USER {
        uuid id PK
        varchar email UK "NOT NULL"
        varchar name "NOT NULL"
        timestamp created_at "DEFAULT NOW()"
    }

    POST {
        uuid id PK
        uuid user_id FK "NOT NULL"
        varchar title "NOT NULL"
        text content "NOT NULL"
        varchar status "DEFAULT draft"
        timestamp published_at
    }

    COMMENT {
        uuid id PK
        uuid user_id FK "NOT NULL"
        uuid post_id FK "NOT NULL"
        text content "NOT NULL"
    }

    CATEGORY {
        uuid id PK
        varchar name UK "NOT NULL"
    }

    TAG {
        uuid id PK
        varchar name UK "NOT NULL"
    }
```

## 状态图（State Diagram）

状态机、生命周期、订单状态流转。

```mermaid
stateDiagram-v2
    [*] --> Draft: 创建订单

    Draft --> Pending: 提交
    Pending --> Paid: 支付成功
    Pending --> Cancelled: 支付超时

    Paid --> Shipped: 发货
    Shipped --> Delivered: 签收
    Delivered --> Completed: 确认收货
    Delivered --> Returning: 申请退货

    Returning --> Refunded: 退款成功
    Returning --> Delivered: 退货驳回

    Completed --> [*]
    Cancelled --> [*]
    Refunded --> [*]
```

### 复合状态

```mermaid
stateDiagram-v2
    [*] --> Idle

    state Processing {
        [*] --> Validating
        Validating --> Computing: 输入合法
        Validating --> [*]: 输入非法
        Computing --> Saving
        Saving --> [*]: 保存完成
    }

    Idle --> Processing: 开始处理
    Processing --> Idle: 处理结束
```

## 甘特图（Gantt Chart）

项目排期、里程碑、任务依赖。

```mermaid
gantt
    title 项目开发计划
    dateFormat  YYYY-MM-DD
    axisFormat  %m/%d

    section 需求
    需求分析       :done, req, 2026-01-01, 14d
    需求评审       :milestone, 2026-01-15, 0d

    section 设计
    架构设计       :active, arch, after req, 10d
    详细设计       :detail, after arch, 7d

    section 开发
    前端开发       :fe, after detail, 20d
    后端开发       :be, after detail, 18d

    section 测试
    集成测试       :it, after fe, 10d
    用户验收       :uat, after it, 7d
    上线           :milestone, 2026-04-10, 0d
```

## 饼图（Pie Chart）

数据占比可视化。

```mermaid
pie title 技术栈使用分布
    "TypeScript" : 40
    "Python" : 25
    "Go" : 15
    "Rust" : 12
    "其他" : 8
```

## Git 图（Git Graph）

分支策略、版本管理流程。

```mermaid
gitGraph
    commit id: "init"
    commit id: "feat: 基础框架"
    branch develop
    checkout develop
    commit id: "feat: 用户模块"
    commit id: "feat: 订单模块"
    branch feature/payment
    checkout feature/payment
    commit id: "feat: 支付集成"
    commit id: "fix: 金额精度"
    checkout develop
    merge feature/payment id: "merge: 支付功能"
    checkout main
    merge develop id: "release: v1.0"
    branch hotfix
    checkout hotfix
    commit id: "fix: 紧急修复"
    checkout main
    merge hotfix id: "release: v1.0.1"
```

## 用户旅程图（User Journey）

用户体验地图，展示情绪变化。

```mermaid
journey
    title 用户购物体验
    section 浏览
      打开首页: 5: 用户
      搜索商品: 4: 用户
      查看详情: 4: 用户
    section 下单
      加入购物车: 4: 用户
      填写地址: 3: 用户
      选择支付: 3: 用户
      支付失败: 1: 用户, 系统
      换卡重试: 2: 用户
      支付成功: 5: 用户
    section 收货
      查看物流: 3: 用户
      确认收货: 5: 用户
      评价商品: 4: 用户
```

## 思维导图（Mindmap）

知识梳理、头脑风暴、层级结构。

```mermaid
mindmap
  root((zdoc))
    核心特性
      零配置
      Markdown 驱动
      Mermaid 图表
    文档结构
      建设者视角
      使用者视角
      知识库视角
    技术栈
      SvelteKit
      rehype/unified
      Mermaid.js
    部署
      Docker
      Node.js
      静态导出
```

## 时间线（Timeline）

项目里程碑、事件演进。

```mermaid
timeline
    title zdoc 发展历程
    section 2025 Q1
        项目启动 : 确定技术栈
        核心功能 : Markdown 渲染
    section 2025 Q2
        搜索功能 : 全文检索
        主题系统 : 暗色模式
    section 2025 Q3
        Mermaid 支持 : 图表渲染
        国际化 : 中英双语
    section 2025 Q4
        性能优化 : 按需加载
        v1.0 发布 : 正式上线
```

## 架构图（Architecture Diagram）

云服务、基础设施、部署架构（Mermaid v11.1+）。

```mermaid
architecture-beta
    group public(cloud)[公网]
    group private(cloud)[私有网络]

    service lb(load_balancer)[负载均衡] in public
    service api1(server)[API 服务 1] in private
    service api2(server)[API 服务 2] in private
    service db(database)[主数据库] in private
    service replica(database)[只读副本] in private

    lb:R --> L:api1
    lb:R --> L:api2
    api1:R --> L:db
    api2:R --> L:db
    db:R --> L:replica
```

## C4 模型（C4 Diagram）

分层架构可视化：系统上下文 → 容器 → 组件。

### 系统上下文

```mermaid
C4Context
    title 系统上下文 - 电商平台

    Person(customer, "顾客", "在线购物")
    Person(admin, "管理员", "管理商品和订单")

    System(shop, "电商平台", "在线购物系统")
    System_Ext(payment, "支付网关", "处理支付")
    System_Ext(email, "邮件服务", "发送通知")

    Rel(customer, shop, "浏览商品、下单")
    Rel(admin, shop, "管理后台")
    Rel(shop, payment, "处理支付", "HTTPS/REST")
    Rel(shop, email, "发送邮件", "SMTP")
```

### 容器图

```mermaid
C4Container
    title 容器图 - 电商平台

    Person(customer, "顾客")
    System_Ext(payment, "支付网关")

    Container_Boundary(frontend, "前端") {
        Container(web, "Web 应用", "React", "浏览器端 UI")
        Container(mobile, "移动端", "React Native", "原生体验")
    }

    Container_Boundary(backend, "后端服务") {
        Container(api, "API 网关", "Node.js", "路由与鉴权")
        Container(order, "订单服务", "Java", "订单处理")
        Container(catalog, "商品服务", "Python", "商品管理")
    }

    Container_Boundary(data, "数据层") {
        ContainerDb(pg, "主数据库", "PostgreSQL", "核心数据")
        ContainerDb(redis, "缓存", "Redis", "会话与缓存")
    }

    Rel(customer, web, "使用", "HTTPS")
    Rel(customer, mobile, "使用", "HTTPS")
    Rel(web, api, "调用", "HTTPS/JSON")
    Rel(mobile, api, "调用", "HTTPS/JSON")
    Rel(api, order, "路由", "REST")
    Rel(api, catalog, "路由", "REST")
    Rel(order, pg, "读写", "SQL")
    Rel(catalog, pg, "读写", "SQL")
    Rel(api, redis, "缓存", "Redis")
    Rel(order, payment, "支付", "HTTPS/REST")
```

## 代码高亮

除了 Mermaid，zdoc 也支持常规代码高亮：

```ts
const sessions = new Map<string, number>();
const hash = sha256(token + secret);
sessions.set(hash, Date.now() + 7 * 24 * 3600 * 1000);
```

```bash
bun run dev
# Local:   http://localhost:5173
```

```json
{
  "title": "我的文档",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

## 行内 `code`

正文里一样能 `inline code`，比如 `_meta.yaml` 或者 `const x = 1`。
