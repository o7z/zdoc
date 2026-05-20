# `_meta.yaml`

每个想出现在[侧边栏](/glossary.md#侧边栏)的目录都要放一个 `_meta.yaml`。它声明这个目录自己的标题和排序,以及目录下要被收录到侧边栏的文档列表。

## 最小例子

```yaml
title: 简介
order: 1

children:
  - name: install
    title: 安装
```

只有列在 [`children`](/glossary.md#children) 里的 `.md` 文件才能被路由访问。**没列出来 = 404 + 不出现在侧边栏。**

## 字段

### 目录级

| 字段         | 必填 | 说明                                                |
|--------------|------|---------------------------------------------------|
| `title`      | 是   | 目录在[侧边栏](/glossary.md#侧边栏)里显示的名字       |
| `order`      | 否   | 排序权重,越小越靠前,默认 999                       |
| `visibility` | 否   | 设为 `prod-only` 表示开发模式下隐藏                  |

> 在目录级写其他字段(`description`、`version` 等)会被静默忽略 —— 它们是 [`children` 项的单文档字段](/glossary.md#单文档字段),不是目录级的。

### `children` 列表项

每个 list item 必须有 `name`,其他字段都是可选:

```yaml
children:
  - name: install
    title: 安装与运行
    description: 5 分钟跑起来。
    order: 10
  - name: choose-a-structure         # 子目录 —— 只写 name,title 来自子目录自身的 _meta.yaml
```

- `name` 普通 Markdown 用文件名去掉 `.md` —— 例如 `install.md` 的 name 是 `install`
- `name` 是 PDF 用完整文件名 —— 例如 `report.pdf` 的 name 就是 `report.pdf`
- `name` 是子目录时只填 `name`,该子目录自己的 `_meta.yaml` 提供 title 等元数据

### 数组位置即顺序

`children` 是有序列表 —— 第 1 项在侧边栏最上面,第 2 项次之,以此类推。**显式写 `order:` 优先**;不写 order 则用数组位置作为隐式 order((idx+1)*10),所以顺序符合直觉。

## 注意

- 目录节点本身**不可点击**,只能折叠/展开。如果想给某个分组弄一个入口页:在那个**子目录自己的** [`_meta.yaml`](/glossary.md#_meta-yaml).children 里把 `index` 排在第一项;v2 把目录 URL `/<dir>/` 解析为 `children[0]` 指向的页面。
- 没有 `_meta.yaml` 的目录会被整体忽略 —— 这是隐藏一组草稿文档最快的方式。
- 子目录有 `_meta.yaml` 时必须在父级 `children:` 里**显式登记**(只写 `- name: <dir>` 即可),否则 v2 不会渲染它。如果忘了登记,跑 `zdoc fix --apply` 会自动补上。

## v1 → v2 迁移

老项目用 `pages:` map + `env:` 字段的写法在 2.0 lint 是 **error**。从任何 v1.x 升上来跑一次:

```bash
zdoc fix --apply
```

即可机械迁移到 v2 schema。`zdoc serve` 启动时若检测到 v1 写法会显示醒目 banner 引导。
