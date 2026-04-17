# 长页面（演示 TOC）

这一页故意做得很长，用来演示**右侧目录树**：

- 在 ≥ 1280px 的视口下，右侧会自动出现一棵 h1 / h2 / h3 树
- 滚动时当前节会自动高亮
- 点击条目会平滑滚动到对应位置（且不会被 sticky header 盖住）

向下滚动试试看。

## 第一节：背景

工程团队经常需要一个内部文档站。常见选择有 Confluence、Notion、Outline、VitePress、Docusaurus、MkDocs。各自有各自的痛点。

### 1.1 痛点：搭建成本

VitePress / Docusaurus 都需要写配置、跑构建、部署。对一个 50 页的内部文档来说性价比不高。

### 1.2 痛点：访问控制

公开站点不需要鉴权；内部站点又往往要"先问下密码"。直接套 nginx basic auth 体验差，sso 又是另一个工程。

### 1.3 痛点：编写门槛

非工程同事不愿意改 frontmatter、不愿意学侧边栏配置 DSL。Markdown 文件越纯越好。

## 第二节：zdoc 的取舍

zdoc 的设计是"承认局限":

### 2.1 不做的事

- 不做 i18n 路由
- 不做 RSS / sitemap / SEO 优化
- 不做插件系统
- 不做主题市场

### 2.2 做的事

- Markdown → HTML，加一点 Mermaid 与代码高亮
- 自动侧边栏（来自 `_meta.yaml`）
- 右侧 TOC（来自 h1–h3）
- 单密码鉴权 + 持久化会话

### 2.3 假设

- 文档量在 200 页以内
- 团队规模 < 50 人
- 不需要"按角色"细粒度权限

## 第三节：使用流程

### 3.1 起步

```bash
npx @o7z/zdoc -d ./docs
```

就能在 8888 端口看到文档站。

### 3.2 加密码

```bash
npx @o7z/zdoc -d ./docs -w hunter2
```

### 3.3 配置文件

如果嫌 CLI 参数难记，写一份 `config.json`：

```json
{
  "title": "我的团队文档",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

## 第四节：FAQ

### 4.1 数据库会变多大

只存会话和两个键，单文件几十 KB 量级，几乎可以忽略。

### 4.2 会话能否手动清空

直接删 `.zdoc/zdoc.db` 即可。重启后会重建。

### 4.3 能改密码吗

启动时改源头，重启即可。运行时改密码 UI 已被移除（避免内嵌"半成品"安全 surface）。

### 4.4 支持 PDF 吗

支持。把 `report.pdf` 加进 `_meta.yaml.pages`，会用浏览器原生 PDF 查看器嵌入。

## 第五节：扩展点

### 5.1 主题色

改 `src/app.css` 的 CSS variable 即可。

### 5.2 替换搜索

`+layout.svelte` 里 `flattenSidebar` 改成接全文索引（比如 fuse.js 或 minisearch）即可。

### 5.3 自定义 markdown 插件

`src/lib/markdown.ts` 是 unified pipeline，加 remark/rehype 插件随便上。

## 第六节：总结

如果你 pa 在选静态文档站，zdoc 的位置很明确：**比 VitePress 简单一个数量级，比 README.md 漂亮一个数量级**。

它既不"未来很大"，也不"无所不能"。它是一个让你十分钟内有文档站、之后再也不用碰它的工具。

到这里你已经滑到底了。看看右侧目录条目是不是高亮在了"第六节：总结"。
