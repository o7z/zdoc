# `_meta.yaml`

每个想出现在[侧边栏](/glossary.md#侧边栏)的目录都要放一个 `_meta.yaml`。它声明这个目录自己的标题和排序，以及目录下要被收录到侧边栏的文档列表。

## 最小例子

```yaml
title: 简介
order: 1

pages:
  install:
    title: 安装
```

只有列在 [`pages`](/glossary.md#pages) 里的 `.md` 文件才能被路由访问。**没列出来 = 404 + 不出现在侧边栏。**

## 字段

### 目录级

| 字段    | 必填 | 说明                                  |
|---------|------|---------------------------------------|
| `title` | 是   | 目录在[侧边栏](/glossary.md#侧边栏)里显示的名字              |
| `order` | 否   | 排序权重，越小越靠前，默认 999        |
| `env`   | 否   | 设为 `prod` 表示开发模式下隐藏（[env: prod](/glossary.md#env-prod)）        |

> **只有这三个字段是目录级有效字段。** 在目录级写 `description`、`version`、`password` 等其他字段会被静默忽略，不会报错也不会生效。`description` 和 `version` 是 [**`pages` 里单文档的字段**](/glossary.md#单文档字段)，不是目录级的。

### [pages](/glossary.md#pages) 里的 key

- 普通 Markdown 用文件名去掉 `.md` —— 例如 `install.md` 的 key 是 `install`
- PDF 用完整文件名 —— 例如 `report.pdf` 的 key 就是 `report.pdf`

## 注意

- 目录节点本身**不可点击**，只能折叠/展开。如果想给某个分组弄一个入口页，请在 [`pages`](/glossary.md#pages) 里加一条目即可。
- 没有 `_meta.yaml` 的目录会被整体忽略 —— 这是隐藏一组草稿文档最快的方式。
