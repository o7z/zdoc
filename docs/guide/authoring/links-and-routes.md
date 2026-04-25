# 链接与路由

zdoc 的路由系统有两条简单规则，理解之后就不会踩坑。

## 路由格式

zdoc 为每个 [`_meta.yaml`](/glossary.md#_meta-yaml) [pages](/glossary.md#pages) 里声明的 `.md` 文件生成一条路由，格式为：

```
/<目录>/<文件名>
```

例如：

| 文件路径                           | 路由                       |
|------------------------------------|----------------------------|
| `docs/getting-started/install.md`  | `/getting-started/install.md` |
| `docs/getting-started/index.md`    | `/getting-started/index.md`   |
| `docs/api/rest.md`                 | `/api/rest.md`             |

**关键：路由必须包含 `.md` 后缀。**

## Markdown 内的链接写法

在 `.md` 文件里写内部链接时：

- **必须带 `.md` 后缀**：`[安装](/getting-started/install.md)`
- **不要省略 `.md`**：`[安装](/getting-started/install)` ← 这会 404

```markdown
<!-- ✅ 正确 -->
[安装指南](/getting-started/install.md)
[API 参考](/api/rest.md)

<!-- ❌ 错误 —— 会 404 -->
[安装指南](/getting-started/install)
[API 参考](./rest)
```

### 为什么？

zdoc 是单页应用（SPA），路由由前端处理。URL 必须与文件路径精确匹配，省略 `.md` 后缀的 URL 不会匹配任何路由规则，浏览器会直接返回 404。

## `index.md` 的路由

子目录下的 `index.md` 路由为 `/<目录>/index.md`，不是 `/<目录>/`。链接时写：

```markdown
[模块总览](/02-modules/index.md)
```

## [`hero frontmatter`](/glossary.md#hero-frontmatter)里的链接

`index.md` 的 hero `actions.link` 同样遵循以上规则：

```yaml
actions:
  - theme: brand
    text: 开始
    link: /intro/what-is-zdoc.md    # ✅ 必须带 .md
```

## 外部链接

外部 URL（`https://...`）照常写，不受以上规则影响：

```markdown
[Supabase](https://supabase.com)
```

## `index.md` 的两种用法

文档根目录的 `index.md` 是[站点首页](/glossary.md#站点首页)，支持两种写法：

### 1. hero frontmatter（推荐用于[站点首页](/glossary.md#站点首页)）

在 `index.md` 顶部加 [hero frontmatter](/glossary.md#hero-frontmatter)，zdoc 会自动渲染 hero 区域：

```markdown
---
name: My Project
text: 一句话描述
tagline: 补充说明
actions:
  - theme: brand
    text: 开始
    link: /intro/getting-started.md
features:
  - title: 特性一
    details: 描述
---

# 欢迎

[hero frontmatter](/glossary.md#hero-frontmatter) 下方可以继续写普通 Markdown。
```

### 2. 纯 Markdown（适合项目文档首页）

不[加 hero frontmatter](/glossary.md#hero-frontmatter)，直接写 Markdown 内容。适合内部文档、决策记录等不需要花哨首页的场景。

```markdown
# 项目名称

> 一句话描述

## 目录

1. [愿景](/01-vision/index.md)
2. [架构](/02-architecture/index.md)
```

> **注意：** 无论哪种写法，内部链接都必须带 `.md` 后缀。详见上文"Markdown 内的链接写法"。
