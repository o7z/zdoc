# 单文档字段

每条 `pages.<key>` 都可以带一组元数据。**只有写了这些字段的文档**才会在正文上方渲染那条灰色[元数据条](/glossary.md#元数据条)。

## 完整字段表

| 字段          | 必填 | 渲染位置                                |
|---------------|------|-----------------------------------------|
| `title`       | 是   | [侧边栏](/glossary.md#侧边栏)显示名（不写就隐藏）              |
| `order`       | 否   | 排序，默认 999                          |
| `description` | 否   | [元数据条](/glossary.md#元数据条)上的描述段落                    |
| `version`     | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip)：`v1.0.1`             |
| `author`      | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip)：作者名               |
| `modified`    | 否   | [元数据条](/glossary.md#元数据条)上的 [chip](/glossary.md#chip)：修改日期             |
| `env`         | 否   | 设 `prod` 隐藏开发版（[env: prod](/glossary.md#env-prod)）                    |

## 演示

本页就有 `description` —— 看正文上方那条灰色的方框就能看到。"什么是 zdoc"那一页则把 description / version / author / modified 全部带上了，可以一起对照。

## 渲染规则

- 任意一个字段为空 → 那一项不出现
- 全部为空 → [元数据条](/glossary.md#元数据条)整条不渲染（页面看起来跟没加元数据时一致）
- description 单独一行段落，version/modified/author 用 `·` 串成一行 [chip](/glossary.md#chip)
