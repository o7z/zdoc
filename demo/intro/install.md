# 安装与运行

## 一次性运行

```bash
npx @o7z/zdoc
```

会用当前目录作为文档目录，监听 8888 端口。

## 全局安装

```bash
npm i -g @o7z/zdoc
zdoc -d ./docs -p 3000
```

## 跑这个 demo

仓库里自带了一个 `demo/` 目录，可以这样起：

```bash
bun install
bun run dev:demo
```

然后浏览器打开 `http://localhost:5173`，看到的就是你现在看到的这一坨。

## 启用密码保护

```bash
zdoc -w hunter2
```

会话用 SQLite 持久化，重启后已登录的 cookie 仍然有效，TTL 7 天。
