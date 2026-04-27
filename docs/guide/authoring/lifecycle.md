# 文档生命周期：lifecycle / superseded_by / folded_to

zdoc 的 `_meta.yaml` 单文档元数据除了 `title / order / description / version / author / modified / env` 之外，还支持三个**生命周期**字段。它们都是可选的——不写则行为和不加这套之前完全一致。

这三个字段的设计目标是：让长期项目的文档在「**变多 → 变旧 → 被取代**」的过程中保持可读、可搜索、对 AI agent 友好。

## 字段一览

```yaml
# docs/guide/intro/_meta.yaml
title: Intro
pages:
  legacy-design:
    title: 旧版方案
    lifecycle: archived
    superseded_by: /docs/guide/intro/v2-design.md
  draft-spec:
    title: 草案
    lifecycle: draft
  manifest-research:
    title: Manifest 研究
    folded_to: /docs/04-implementation/02-data-model/01-schema.md#manifest
```

| 字段 | 类型 | 取值 | 作用 |
|---|---|---|---|
| `lifecycle` | string | `draft` / `stable` / `archived` | 标记文档当前所处的演进阶段 |
| `superseded_by` | string | 内部链接路径 | 指向取代本文的新文档 |
| `folded_to` | string | 内部链接（可带 `#anchor`） | 指向"事实"已被搬走后的权威位置 |

非法值（如 `lifecycle: frozen`、`superseded_by: ['a', 'b']`）会被忽略并降级为 undefined，不影响 zdoc 启动。

## 渲染效果

| 场景 | 侧边栏 | 文档顶部 | 搜索 |
|---|---|---|---|
| `lifecycle: archived` | 文件名后追加 🗄 + 整行灰显 | 无提示条 | **完全从搜索索引剔除** |
| `superseded_by: …` | 文件名后追加 ↗ | 顶部出现 ⚠ 提示条 + 跳转链接 | 不变 |
| `folded_to: …` | 不影响 | 顶部出现 📦 提示条 + 跳转链接 | 不变 |
| `lifecycle: draft` / `stable` | 不影响 | 不影响 | 不变（值会被解析保留，为后续视觉留口子） |

`archived` 和 `superseded_by` 可以并存——一个被取代的旧文档同时也是 archived 的常见情况。

## 三种典型用法

### 1. 旧方案被新方案完全取代

```yaml
pages:
  v1-architecture:
    title: v1 架构（已弃用）
    lifecycle: archived
    superseded_by: /docs/architecture/v2.md
```

旧文档原地保留（保留历史脉络），但从搜索消失、侧边栏灰显，访问时顶部明显提示用户去新文档。

### 2. 研究文档的部分内容已折叠到权威文档

研究文档常常一边讲"为什么"（背景 / 选项对比 / 决策记录）、一边讲"是什么"（schema / 字段清单 / 接口）。当后者稳定下来后，把"是什么"那部分**搬到**权威实现文档，研究文档原位置保留指针：

```yaml
pages:
  data-source-manifest-design:
    title: 数据源 Manifest 设计研究
    folded_to: /docs/04-implementation/02-data-model/01-schema.md#manifest
```

研究文档保留 § 背景 / § 决策记录，删除 § Schema / § DDL / § 字段约束（这些已经搬走）。AI agent 查 schema 时直接看权威文档；想知道"为什么不允许 protocol_v2"才回研究文档。

### 3. 还在草稿阶段的预留位

```yaml
pages:
  api-spec:
    title: API 规范
    lifecycle: draft
    description: v0.1 计划 8 个端点，目前仅大纲。
```

`draft` 当前不渲染特殊视觉，但语义上明确告诉协作者（人 + agent）此文档尚未稳定。将来 zdoc 可能给 draft 加 ⏳ 角标，现在先把字段标好。

## 段级折叠：用 markdown 原生写法

zdoc **故意不引入**段级折叠的特殊语法（如 `> [!folded]`），以保持 `.md` 文件作为纯内容的承诺——同一份 markdown 离开 zdoc 也应该能正常渲染。

推荐的段级折叠写法是普通 markdown blockquote：

```markdown
## 字段约束

> 已折叠到 [/docs/04-implementation/02-data-model/01-schema.md#字段约束](/docs/04-implementation/02-data-model/01-schema.md#字段约束) — 2026-04-27
> 此处仅保留设计动机。

…保留的设计动机正文…
```

- 普通 markdown，离开 zdoc 也能正常渲染
- AI agent 通过 pattern（`> 已折叠到 [...]`）自然识别"这段已迁移"
- 后续 `zdoc lint` 子命令会校验这种 blockquote 里的链接是否有效

## 设计取舍

zdoc 的核心承诺是**零配置 + 文件即纯内容**。生命周期元数据全部住在 `_meta.yaml`（已有的元数据层）而非 frontmatter，理由是：

- `.md` 文件保持纯内容，git diff / 复制粘贴 / 在其它工具里渲染都不变样
- 同一目录下整批文档的状态统一管理（一个 `_meta.yaml` 就能看到该目录所有文档的状态）
- 字段全部可选，不写就是不写，没有"必须迁移"的负担

不在 zdoc 范围内的相邻概念（如 `role` / `owner` / `review_interval`）属于文档治理层，由项目自己用其它工具或文档约定承担。
