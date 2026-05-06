# @o7z/zdoc

[English](./README.md) · **简体中文**

零配置的 Markdown 文档站。把 `zdoc` 指向一个存放 `.md` 的目录，立刻获得一个带完整功能的文档站：

- 由每个目录的 `_meta.yaml` 自动生成侧边栏
- 右侧自动生成的目录树（h1–h3）+ 当前节自动高亮
- 服务端密码保护，会话跨进程重启保持
- Mermaid 图表 + 代码高亮
- 暗色模式 + `Ctrl+K` 搜索
- 响应式布局
- 自动渲染 PDF
- 可选的整站文档打包下载（默认关闭，见 `--download`）

## 快速开始

```bash
# 在任意包含 Markdown 文件的目录：
npx @o7z/zdoc
# 或全局安装：
npm i -g @o7z/zdoc
zdoc
```

默认 `zdoc` 监听端口 8888、文档目录为当前目录、**无密码**（文档公开）。若要启用密码保护，加 `-w <密码>`。

## 命令行参数

```
zdoc [options]

Options:
  -d, --dir <path>       Markdown 文档目录（默认：当前工作目录）
  -p, --port <number>    监听端口（默认：8888；被占用时自动递增）
  -w, --password <pwd>   访问密码（默认：无密码，文档公开；设置后启用密码保护）
  -D, --download         启用文档打包下载端点 + header 下载按钮（默认：关闭）
  -h, --help             显示帮助信息
  -v, --version          显示版本号
```

示例：

```bash
zdoc                                # 当前目录，端口 8888，无密码（公开）
zdoc -d ./docs -p 3000              # 自定义目录和端口
zdoc -w hunter2                     # 启用密码保护
zdoc -D                             # 开放 /api/download.zip 并在 header 显示下载按钮
zdoc -w hunter2 -p 8080 -d ./site   # 全参数覆盖
```

若指定端口被占用，`zdoc` 会自动尝试下一个可用端口。

## 配置文件（`config.json`）

在运行 `zdoc` 的目录下创建 `config.json` 可以设置默认值：

```json
{
  "title": "我的文档",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888,
  "downloadEnabled": false
}
```

优先级：**CLI 参数 > `config.json` > 默认值**。

密码在启动时由 CLI / `config.json` / `ZDOC_PASSWORD` 决定。浏览器里没有改密码界面 —— 如要换密码，请改源头并重启。

`downloadEnabled` **默认关闭**。开启后（CLI `-D`、环境变量 `ZDOC_DOWNLOAD=1`，或 `zdoc.config.json` 里写 `"downloadEnabled": true`）`/api/download.zip` 会把整个文档目录流式打包为 zip，header 也会出现下载按钮。开启密码保护时，下载端点会被同一套登录流程拦截。

## 撰写文档

`zdoc` 每个目录用一个元数据文件：**`_meta.yaml`**。所有 `.md` 文件都是纯内容——没有 frontmatter、没有 HTML 注释。

### `_meta.yaml`

每个想出现在侧边栏的目录都需要一个 `_meta.yaml`。它声明目录自身的标题/排序，并列出该目录下要出现在侧边栏的文档（`.md` 和 `.pdf`）：

```yaml
title: 快速开始              # 必填 —— 侧边栏显示的目录名
order: 1                    # 可选 —— 排序权重（越小越靠前），默认 999
env: prod                   # 可选 —— 设为 "prod" 表示仅生产环境显示

pages:
  install:                  # key = 去掉 .md 的文件名
    title: 安装             # 必填，没有则该文件隐藏
    order: 1
    modified: 2026-04-18
    version: 1.0.1
    description: npm、bun 以及全局安装的分步指南。
    author: o7z
  config:
    title: 配置
    order: 2
  report.pdf:               # PDF 文件：key 保留完整文件名（含扩展名）
    title: 第四季度报告
    order: 3
```

没有 `_meta.yaml` 的目录**不会显示**。没有列在 `pages` 里的 `.md` 文件既不能被路由访问（404），也不出现在侧边栏。

### 单文档字段

| 字段          | 必填 | 说明                                                                          |
|---------------|------|------------------------------------------------------------------------------|
| `title`       | 是   | 侧边栏显示名。没有 `title` 的文件隐藏。                                           |
| `order`       | 否   | 排序权重，默认 `999`。                                                            |
| `modified`    | 否   | 最后修改时间字符串，会出现在文档顶部的元数据条上。                                    |
| `description` | 否   | 简短描述，渲染在正文上方。                                                         |
| `version`     | 否   | 文档版本（如 `1.0.1`），作为 chip 出现在元数据条上。                                  |
| `author`      | 否   | 作者名，作为 chip 出现在元数据条上。                                                |
| `env`         | 否   | 设为 `prod` 表示仅生产环境显示（开发模式下 `NODE_ENV !== 'production'` 时隐藏）。      |

`description`、`version`、`author`、`modified` 对 `.md` 和 `.pdf` 都生效；只要其中任意一个有值，页面顶部就会渲染一个小型元数据条。

### 站点首页

根目录 `<docsDir>/index.md` 会被渲染为站点首页：

- `<docsDir>/_meta.yaml` 声明站点标题
- `<docsDir>/index.md` 即站点首页（纯 Markdown，另支持下文可选的 hero frontmatter）

侧边栏上的目录节点只负责折叠/展开，不会跳转。如果你想让某个目录下有一个单独的入口页面，请在该目录的 `_meta.yaml` 的 `pages` 里加一个条目。

### 目录结构示例

```
docs/
├── _meta.yaml              # title: 我的文档
├── index.md                # 站点首页（纯 Markdown）
├── getting-started/
│   ├── _meta.yaml          # title: 快速开始; order: 1; pages: {install:…, config:…}
│   ├── install.md          # 纯内容，在 _meta.yaml 里列出
│   └── config.md
├── guide/
│   ├── _meta.yaml          # title: 指南; order: 2; pages: {basics:…, advanced:…}
│   ├── basics.md
│   └── advanced.md
└── reports/
    ├── _meta.yaml          # title: 报告; order: 3; pages: {Q4.pdf: {title: Q4 报告}}
    └── Q4.pdf
```

### 首页 hero 块（可选）

根目录 `index.md` 支持 YAML frontmatter 形式的 hero：

```markdown
---
name: 我的项目
text: 最快的文档站方案
tagline: 零配置，暗色模式，Mermaid，搜索。
actions:
  - theme: brand
    text: 快速开始
    link: /getting-started/install.md
  - theme: alt
    text: GitHub
    link: https://github.com/…
features:
  - title: 零配置
    details: 丢到任意 Markdown 目录就能跑。
  - title: 密码保护
    details: 服务端会话鉴权，运行时可改密码。
---

# 欢迎

frontmatter 之后的 Markdown 正常渲染。
```

## 功能细节

- **右侧目录**：每个 Markdown 页面会在视口宽度 ≥ 1280px 时，在右侧固定区域自动生成一棵 h1–h3 目录树。滚动时自动高亮当前章节，点击条目平滑滚动到对应位置。
- **Mermaid**：围栏代码块 ```` ```mermaid ```` 会渲染成 SVG。
- **语法高亮**：`rehype-highlight`，自动识别语言。
- **搜索**：按 `Ctrl+K`（Mac：`Cmd+K`）模糊匹配侧边栏条目。
- **暗色模式**：自动检测系统偏好 + 手动切换，状态持久化到 `localStorage`。
- **密码保护**：服务端 HttpOnly 会话 cookie；传空密码（`-w ""`）或不传 `-w` 即禁用鉴权。会话信息持久化在 `<docsDir>/.zdoc/zdoc.db` 这个小型 SQLite 文件里，所以重启 `zdoc` 后已登录的 cookie 仍然有效。会话在 7 天 TTL 到期时失效；删除 `<docsDir>/.zdoc/` 即可让所有人下线。
- **图片资源**：Markdown 中的相对路径（如 `![](./img/screenshot.png)`）会从文档目录直接服务出去。支持 `.png`、`.jpg`/`.jpeg`、`.gif`、`.svg`、`.webp`、`.avif`、`.ico`。启用密码保护时，资源请求与页面共用同一会话校验门。
- **PDF**：在 `_meta.yaml` 的 `pages` 里列出后，会通过浏览器原生 PDF 查看器嵌入 iframe。

## 开发（贡献者）

本仓库 **dogfood zdoc**：`docs/` 目录就是官方文档，直接由 zdoc 自己渲染。
另一个 `demo/` 目录是故意畸形的回归样本（超长页、边界 `_meta.yaml` 等），
仅用于压测渲染器，**不是给人读的文档**。

```bash
bun install
bun run dev        # zdoc 渲染自己的 docs/（官方站点）
bun run dev:demo   # zdoc 渲染 demo/（只是回归样本）
bun run dev:vite   # 裸跑 vite，不预设 ZDOC_DIR
bun run build      # 生成 build/ 和 bin/cli.js
node bin/cli.js -d ./some/docs
```

## 许可证

MIT © o7z
