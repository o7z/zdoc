# Mermaid 与代码块

## Mermaid 流程图

```mermaid
flowchart LR
    A[浏览器] -->|GET /intro/install| B(SvelteKit)
    B --> C{hasPassword?}
    C -->|no| D[直接渲染]
    C -->|yes| E[查 sessions Map]
    E -->|有效| D
    E -->|无效/过期| F[跳 /login]
```

## 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant Z as zdoc
    U->>Z: POST /login (password)
    Z->>Z: sessions.set(sha256(token+secret), expiresAt)
    Z-->>U: Set-Cookie docs_session, 303
    U->>Z: GET /intro/install (Cookie)
    Z->>Z: sessions.get(sha256(token+secret))
    Z-->>U: 200 HTML
```

## 多行标签测试

```mermaid
flowchart LR
    A[这是一个非常长的节点文字<br/>用来测试多行文字显示<br/>看看容器能不能被撑大] --> B{这是一个判断条件<br/>需要显示多行文字}
    B -->|如果条件满足<br/>就执行这个操作| C[结果节点]
    B -->|如果条件不满足<br/>就跳过这个步骤| D[另一个结果]
```

## 代码高亮

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
