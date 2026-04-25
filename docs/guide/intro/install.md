# 安装与运行

## 一次性运行

```bash
npx @o7z/zdoc
```

会用当前目录作为[文档目录](/glossary.md#文档目录)，监听 8888 端口。

## 全局安装

```bash
npm i -g @o7z/zdoc
zdoc -d ./docs -p 3000
```

## 在本仓库中开发

克隆仓库后，可以这样启动 zdoc 的官方文档站（你现在看到的就是它的[自渲染官网](/glossary.md#自渲染官网)）：

```bash
bun install
bun run dev
```

然后浏览器打开 `http://localhost:20000`。这个 dev server 渲染的就是 `docs/` 目录 —— zdoc 用自己渲染自己。

另一个脚本指向故意畸形的回归样本（超长页、边界 [`_meta.yaml`](/glossary.md#_meta-yaml)），仅用于 UI 压测：

```bash
bun run dev:demo
```

## 启用密码保护

```bash
zdoc -w hunter2
```

[会话](/glossary.md#会话)存在进程内存中（`Map<tokenHash, expiresAt>`），[TTL](/glossary.md#会话-ttl) 7 天。进程重启会清空所有 session —— 取舍见「进阶 / 会话与持久化」。
