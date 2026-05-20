# 单文档字段

`children` 列表里每个 item 都可以带一组元数据。**只有写了这些字段的文档**才会在正文上方渲染那条灰色[元数据条](/glossary.md#元数据条)。

## 完整字段表

| 字段          | 必填 | 渲染位置                                       |
|---------------|------|--------------------------------------------|
| `name`        | 是   | 文件名去掉 `.md`(或完整 PDF 文件名)              |
| `title`       | 否   | [侧边栏](/glossary.md#侧边栏)显示名(不写就隐藏)    |
| `order`       | 否   | 显式排序,不写则用数组位置                       |
| `description` | 否   | [元数据条](/glossary.md#元数据条)上的描述段落    |
| `version`     | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip):`v1.0.1`         |
| `author`      | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip):作者名           |
| `modified`    | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip):修改日期         |
| `visibility`  | 否   | 设 `prod-only` 隐藏开发版                       |
| `lifecycle`   | 否   | `draft` / `stable` / `archived`              |
| `superseded_by` | 否 | 指向继任者的路径(渲染顶部 banner)               |
| `folded_to`   | 否   | 内容已折叠到的目标路径                          |

## 演示

本页就有 `description` —— 看正文上方那条灰色的方框就能看到。"什么是 zdoc"那一页则把 description / version / author / modified 全部带上了,可以一起对照。

## 渲染规则

- 任意一个字段为空 → 那一项不出现
- 全部为空 → [元数据条](/glossary.md#元数据条)整条不渲染(页面看起来跟没加元数据时一致)
- description 单独一行段落,version/modified/author 用 `·` 串成一行 [chip](/glossary.md#chip)
