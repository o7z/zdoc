# 术语表

zdoc 文档和代码中使用的专有术语与约定。

## 核心概念

| 术语 | 英文 | 含义 |
|------|------|------|
| 零配置 | Zero-config | zdoc 的核心设计：无需静态站点生成器、无需配置文件、无需构建步骤，`npx @o7z/zdoc` 即可运行。 |
| 文档目录 | docsDir | 存放 Markdown 文件的目录，默认为当前工作目录。可通过 `-d`、`ZDOC_DIR` 或 `zdoc.config.json` 设置。 |
| 自渲染官网 | Dogfood | zdoc 的官方文档站就是 zdoc 自身渲染自己的 `docs/` 目录。 |

## 元数据与导航

| 术语 | 英文 | 含义 |
|------|------|------|
| `_meta.yaml` | — | 每个目录的元数据文件，控制该目录在侧边栏中的呈现。无此文件的目录完全隐藏。 |
| pages | pages | `_meta.yaml` 中声明可路由页面的映射表。未列入的 `.md` 文件返回 404。 |
| page key | page key | pages 中的条目标识符。`.md` 文件取去掉扩展名的文件名（如 `install` 对应 `install.md`），PDF 取完整文件名。 |
| 单文档字段 | Per-page fields | pages 中每个条目可设置的元数据：`title`、`order`、`description`、`version`、`author`、`modified`、`env`。 |
| 侧边栏 | Sidebar | 由 `_meta.yaml` 驱动自动生成的导航树。目录节点仅展开/折叠，页面节点跳转内容。 |
| 右侧目录 | Right-side TOC | 从 h1-h3 标题自动生成的页内目录，固定在视口右侧（≥1280px），当前可见标题高亮。 |
| 滚动侦测 | Scroll spy | 追踪当前可见标题并高亮对应右侧目录条目的机制。 |
| 元数据条 | Metadata bar | 当页面设置了 `description`、`version`、`author` 或 `modified` 时，在正文上方渲染的信息区域。 |
| chip | chip | 元数据条中的小标签，显示 `version`、`author`、`modified` 的值，以 `·` 分隔。 |

## 路由与链接

| 术语 | 英文 | 含义 |
|------|------|------|
| `.md` 后缀路由 | `.md` suffix routing | zdoc 路由包含 `.md` 扩展名，内部链接必须带 `.md` 后缀（如 `/intro/install.md`），省略则 404。 |
| SPA 路由 | SPA routing | zdoc 是单页应用，所有路由由前端处理，URL 必须与文件路径精确匹配。 |
| 站点首页 | Site home | 根目录的 `index.md`，支持可选的 hero frontmatter，渲染为落地页。 |
| hero frontmatter | hero frontmatter | 根 `index.md` 顶部的可选 YAML 块，渲染落地页的 `name`、`text`、`tagline`、`actions`（CTA 按钮）和 `features`（特性卡片）。 |
| 链接预览 | Link preview | 鼠标悬停在文档正文中的站内 `.md` 链接时弹出的预览浮窗，通过 `/api/preview` 端点获取内容。仅对 `.doc-content` 区域内的链接生效。 |

## 搜索

| 术语 | 英文 | 含义 |
|------|------|------|
| `Ctrl+K` 搜索 | `Ctrl+K` search | 对侧边栏标题和路径的模糊搜索，不索引正文内容。 |

## 鉴权与会话

| 术语 | 英文 | 含义 |
|------|------|------|
| 密码保护 | Password protection | 通过 `-w` 或配置启用服务端鉴权，所有页面需 HttpOnly 会话 cookie 认证。 |
| 会话 | Session | 存储在进程内存中的认证会话（`Map<tokenHash, expiresAt>`），不持久化，重启后丢失。 |
| 会话 TTL | Session TTL | 会话有效期，默认 7 天（604800 秒）。 |
| 每次启动的盐 | Per-boot secret | 每次启动时 `crypto.randomBytes(32)` 生成的密钥，仅存于内存，重启后所有会话失效。 |

## Markdown 渲染管线

| 术语 | 英文 | 含义 |
|------|------|------|
| `renderMarkdown` | — | 核心函数，将 Markdown 转为 HTML + 标题数组。管线：remark-parse → remark-gfm → remark-rehype → rehype-slug → collectHeadings → rehype-highlight → rehypeMermaid → rehypeExternalLinks → rehypeCodeCopy → rehype-stringify。 |
| `collectHeadings` | — | 自定义 rehype 插件，提取 h1-h3 标题（文本 + slug）供右侧目录使用。 |
| `rehypeMermaid` | — | 自定义 rehype 插件，将 `language-mermaid` 代码块转为 `<pre class="mermaid">` 供客户端渲染。 |
| `rehypeExternalLinks` | — | 自定义 rehype 插件，为外部 HTTP/HTTPS 链接添加 `target="_blank"` 和 `rel="noopener noreferrer"`。 |
| `rehypeCodeCopy` | — | 自定义 rehype 插件，为代码块添加复制按钮。 |
| frontmatter 剥离 | Frontmatter stripping | `renderMarkdown` 在处理前先移除 YAML frontmatter（`---\n...\n---`），根 `index.md` 的 hero frontmatter 在 `+page.server.ts` 中单独解析。 |

## 文档结构方案

| 术语 | 英文 | 含义 |
|------|------|------|
| 方案 A：5 层建设者视角 | Scheme A: 5-layer builder | 按系统被构建的自然顺序分层：`0-glossary/` → `1-vision/` → `2-architecture/` → `3-contract/` → `4-design/` → `5-ops/`，适合开发团队和 AI 协作。 |
| 方案 B：Diátaxis 四象限 | Scheme B: Diátaxis quadrants | 按读者意图分类：`tutorials/`（学习）、`how-to/`（任务）、`reference/`（事实）、`explanation/`（背景），适合已稳定的产品文档。 |
| 方案 C：扁平 + 搜索 | Scheme C: Flat + search | 不分层，靠搜索和标签导航，适合零散知识。 |
| 旁路资产 | Bypass asset | 方案 A 中不参与编号依赖链的目录，如 `references/`、`testing/`。 |
| 层级腐烂 | Layer rot | 深层目录随内容增长而"腐烂"——每篇新文档都逼迫分类决策，重构代价高。方案 C 的核心论据。 |

## 可见性与环境

| 术语 | 英文 | 含义 |
|------|------|------|
| `env: prod` | `env: prod` | 目录或页面的可见性标记。设为 `prod` 时，在非生产环境（`NODE_ENV !== 'production'`）中隐藏。 |
| `visible()` | `visible()` | 内部函数，判断页面是否应显示：必须有 `title` 且不在非生产环境隐藏。 |

## 配置优先级

| 术语 | 英文 | 含义 |
|------|------|------|
| 优先级链 | Priority chain | 配置值的解析顺序：CLI 参数 > 环境变量 > `zdoc.config.json` > 内置默认值。 |
| 端口自动递增 | Auto-increment port | 指定端口被占用时，zdoc 自动尝试下一个可用端口，不报错。 |

## 设计原则

| 术语 | 英文 | 含义 |
|------|------|------|
| 约定优先 | Convention over configuration | `_meta.yaml` 决定侧边栏和元数据，其余遵循约定，无需配置文件。 |
| 五分钟从零跑起来 | Five minutes from zero | zdoc 的设计目标：最短启动时间 + 长期可维护。 |
