# @o7z/zdoc

[English](./README.md) · [简体中文](./README.zh-CN.md)

零配置的 Markdown 文档站。把 `zdoc` 指向一个存放 `.md` 的目录，立刻获得一个带完整功能的文档站：

- 依据目录结构自动生成侧边栏（`_meta.md` + HTML 注释元数据）
- 服务端密码保护，浏览器中可直接修改密码
- Mermaid 图表
- 暗色模式 + `Ctrl+K` 搜索
- 响应式布局
- 自动渲染 PDF（作为侧边栏条目）

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
  -h, --help             显示帮助信息
  -v, --version          显示版本号
```

示例：

```bash
zdoc                                # 当前目录，端口 8888，无密码（公开）
zdoc -d ./docs -p 3000              # 自定义目录和端口
zdoc -w hunter2                     # 启用密码保护
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
  "port": 8888
}
```

优先级：**CLI 参数 > `config.json` > 默认值**。

如果 `config.json` 存在，浏览器里的 **修改密码** 也会持久化写回这个文件；否则只存内存，重启后重置。

## 撰写文档

### 文件元数据

每个 `.md` 文件顶部放一行 `<!-- zdoc: {...} -->` 注释。大括号里是 **YAML flow** 语法——紧凑、解析严格，但套在 HTML 注释里，GitHub / Gitee / 任何 Markdown 渲染器都不会显示出来。

```markdown
<!-- zdoc: {title: 快速上手, order: 1, modified: 2026-04-18, env: prod} -->

# 快速上手

正文内容…
```

字段说明：

| 字段       | 必填 | 说明                                                                       |
|------------|------|---------------------------------------------------------------------------|
| `title`    | 是   | 侧边栏显示名。没有 `title` 的文件不会出现在侧边栏，也无法通过 URL 访问（404）。     |
| `order`    | 否   | 排序权重，数字越小越靠前。默认 `999`。                                         |
| `modified` | 否   | 信息性字段，最后修改时间字符串。                                                |
| `env`      | 否   | 设为 `prod` 表示仅生产环境显示（开发模式下 `NODE_ENV !== 'production'` 时隐藏）。 |

字符串含空格不需要引号；如果值中包含 `,` `:` `{` `}` 等特殊字符，用引号包起来：`{title: "前端, 后端"}`。

> **向后兼容：** 老格式 `<!-- title: 快速上手 -->` / `<!-- order: 1 -->`（每个注释一个字段）仍然支持。两种格式并存时，`zdoc:` 优先。

### 目录元数据 + 引导页（`_meta.md`）

每个想出现在侧边栏的目录都需要一个 `_meta.md`。其中的元数据注释控制侧边栏条目；**注释之后的 Markdown 正文会被渲染为该目录的引导页**（点击侧边栏目录标题时展示的落地页）。

```markdown
<!-- zdoc: {title: 使用指南, order: 2} -->

# 使用指南

欢迎。建议从 [基础](./basics) 开始。
```

- 若 `_meta.md` 有非空正文 → 该正文就是引导页；此时该目录下的文档不需要再各自声明 `title` 就能作为默认落地页（不过每个文件要想单独出现在侧边栏，仍需要自己的 `title`）。
- 若 `_meta.md` 只有元数据、没有正文 → 回退到同目录下的 `index.md`（若存在），保留老版布局。
- 没有 `_meta.md` 的目录完全隐藏。磁盘上的目录名**从不**影响 UI，标题完全由 `_meta.md` 决定。

### 根目录 `_meta.md` = 站点首页

docs 根目录本身也可以放 `_meta.md`。其正文会成为整个站点的首页（替代传统的顶层 `index.md`）：

```markdown
<!-- zdoc: {title: 我的文档} -->

# 我的文档

欢迎，从左侧挑一个话题开始。
```

如果你需要完整的 hero 区块（`name` / `text` / `tagline` / `features` / `actions`），继续用 `index.md` + YAML frontmatter——老路径仍然有效。

### 目录结构示例

```
docs/
├── _meta.md                # 站点首页：<!-- zdoc: {title: 我的文档} --> + 正文
├── getting-started/
│   ├── _meta.md            # 目录引导页：<!-- zdoc: {title: 快速开始, order: 1} --> + 正文
│   ├── install.md          # <!-- zdoc: {title: 安装, order: 1} -->
│   └── config.md           # <!-- zdoc: {title: 配置, order: 2} -->
├── guide/
│   ├── _meta.md            # <!-- zdoc: {title: 指南, order: 2} -->（无正文 → 回退到 index.md）
│   ├── index.md            # 老式落地页
│   └── basics.md           # <!-- zdoc: {title: 基础用法} -->
├── internal.md             # 没有 zdoc 注释 → 侧边栏不显示
└── api/
    └── reference.md        # 这个目录没有 _meta.md → 整个目录隐藏
```

### 首页 hero 区块（可选）

`index.md` 支持 YAML frontmatter 形式的 hero：

```markdown
---
name: 我的项目
text: 最快的文档站方案
tagline: 零配置，暗色模式，Mermaid，搜索。
actions:
  - theme: brand
    text: 快速开始
    link: /getting-started/install
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

### PDF 文档

把任意 `.pdf` 文件放进文档目录，侧边栏会自动出现对应条目——标题默认用文件名（去掉后缀），点击后在 iframe 里用浏览器原生 PDF 查看器打开。

要覆盖标题或排序，放一个同名的 `<文件名>.pdf.meta.md`：

```markdown
<!-- zdoc: {title: 第四季度报告, order: 3} -->
```

## 功能细节

- **Mermaid**：围栏代码块 ```` ```mermaid ```` 会渲染成 SVG。
- **语法高亮**：`rehype-highlight`，自动识别语言。
- **搜索**：按 `Ctrl+K`（Mac：`Cmd+K`）模糊匹配侧边栏条目。
- **暗色模式**：自动检测系统偏好 + 手动切换，状态持久化到 `localStorage`。
- **密码保护**：服务端 HttpOnly 会话 cookie；传空密码（`-w ""`）或不传 `-w` 即禁用鉴权。

## 开发（贡献者）

```bash
bun install
bun run dev     # vite 开发服务器
bun run build   # 生成 build/ 和 bin/cli.js
node bin/cli.js -d ./some/docs
```

## 许可证

MIT © o7z
