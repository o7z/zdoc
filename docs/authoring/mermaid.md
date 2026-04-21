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
    Z-->>U: Set-Cookie docs_session; 303
    U->>Z: GET /intro/install (Cookie)
    Z->>Z: sessions.get(sha256(token+secret))
    Z-->>U: 200 HTML
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
