# 会话与持久化

## 在哪里

会话信息存在 `<docsDir>/.zdoc/zdoc.db` —— 一个 SQLite 文件。`.zdoc/` 是点文件目录，侧边栏会自动忽略它。

## 表

```sql
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  epoch       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

`kv` 里只存两个键：

- `session_secret` —— 用于哈希 cookie token 的盐，**首次启动**生成
- `session_epoch` —— 一个递增整数，会话有效性靠它判断

## 为什么不直接存 token 明文

存的是 token 的 SHA-256 哈希，secret 是盐。哪怕 SQLite 文件被偷走，也没法直接拿 token 跨用户登录。

## 失效条件

- 7 天 TTL 到期 —— 自然过期
- 手动删除 `<docsDir>/.zdoc/` —— 全员下线
- 改源头密码并重启 —— 因为目前没有运行时改密码功能，新密码会让旧 cookie 失效需要靠重启过程中的 epoch 判断（已废弃 setPassword 之后，这条简化为：换密码 = 仍然要重启 + 删 .zdoc/ 才彻底踢人）

## 适配 Bun

`src/lib/db.ts` 在 Bun 下走 `bun:sqlite`，在 Node 下走 `better-sqlite3`。两者 API 兼容程度足够覆盖本项目所有调用。
