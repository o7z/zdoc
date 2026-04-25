# 会话与持久化

## 在哪里

[会话](/glossary.md#会话)完全存在**进程内存**里，不落盘。zdoc 是[零配置](/glossary.md#零配置) docs 工具，session 量极小，重启后让用户重新登录是可接受的折衷。

## 数据结构

```ts
const sessions = new Map<string, number>(); // tokenHash -> expiresAt (秒)
```

盐（secret）每次进程启动时通过 `crypto.randomBytes(32)` 生成，只在内存里。

## 为什么不直接存 token 明文

Map 的 key 是 `sha256(token + secret)`。哪怕堆 dump 被拿到，也没法直接拿 token 跨用户登录。

## 失效条件

- 7 天 TTL 到期 —— 自然过期（写入时和校验时都会做 lazy 清理）
- 进程重启 —— secret 重新生成，旧 cookie 全部失效
- 改密码并重启 —— 同上，无旧 session 残留

## 为什么去掉了 SQLite

v1.0.2 曾用 `better-sqlite3` 存 sessions，但它是 native 依赖，pnpm / npm 全局安装在 Windows 上 prebuilt 下载不稳定，导致登录 500。v1.0.3 改为纯内存方案，零 native 依赖，任何平台 `npm i -g @o7z/zdoc` 直接可用。
