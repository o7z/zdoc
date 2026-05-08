本文档登记 zdoc **下一个 major 版本(目标 2.0)**的设计变更与迁移计划。按 [semver](/dev/release.md#版本递增规则) 约定,所有破坏性变更只能在 major 一起释放;集中攒起来一次切换,降低用户的迁移成本。

> 文件名 `next-major` 是稳定指代 —— 2.0 发布并归档后,本文件可直接接 3.0 的内容,不需要 rename。

## 状态总览

| 项目 | 状态 |
|------|------|
| 当前版本 | 1.12.x |
| 目标版本 | 2.0(无具体日期) |
| 触发条件 | 已决定项积累到值得发布的程度 |
| 维护方式 | 决定一项加一条;放弃的提议挪到「明确不做」并保留记录 |

## 已决定

### `_meta.yaml` schema:`pages:` map → `children:` list

把当前的 `pages:` 关键字映射改成 `children:` 有序列表。`order:` 字段从 schema 中**全部删除** —— 数组位置即渲染顺序。

设计原则:**identity 归自身、arrangement 归容器**。title 跟着 thing 走(子目录 title 仍由子目录自己的 [`_meta.yaml`](/guide/authoring/meta-yaml.md) 提供),sibling 顺序只由父级一处声明。

#### 当前

```yaml
title: 编写文档
order: 20

pages:
  meta-yaml:
    title: _meta.yaml
    order: 10
  page-fields:
    title: 单文档字段
    order: 20
```

子目录通过自身存在 `_meta.yaml` 自动出现在侧边栏,顺序由子目录内 `order:` 字段决定。

#### 之后

```yaml
title: 编写文档

children:
  - name: meta-yaml
    title: _meta.yaml
  - name: page-fields
    title: 单文档字段
    description: title / order / description / version / author / modified / env
  - name: choose-a-structure   # 子目录,只写 name,title 落到自身 _meta.yaml
  - name: lifecycle
    title: 文档生命周期
```

`children:` 中的子目录条目**只允许 `name:`**,title 仍由该子目录自己的 `_meta.yaml` 提供。父级不允许覆盖子目录 title。

#### 迁移策略

- **过渡期**(1.x 末发一个 minor):parser 同时接受 `pages:` (map) 和 `children:` (list);[lint](/dev/reference/cli.md) 对继续用 `pages:` 出 warning,提示迁移。
- **2.0**:`pages:` 字段移除,parser 不再接受 map 形式,lint 报 error。
- **工具**:发布 `zdoc migrate` 子命令做机械翻译(map → list),保持现有 `order:` 数值的相对顺序。

#### 边界确认

- `children:` **不允许 string shorthand**(`- meta-yaml`):统一 map 形式,避免多解析路径多类 bug。
- 父级**不允许**覆盖子目录 title:identity 归自身原则不松动。
- 同级 `.md` 与子目录的渲染顺序由 `children:` 列表中的位置直接决定,不再有"file 优先"的 tie-breaker。

## 待评估候选

> 以下条目尚未做决定,先记录,等讨论。每条挂 ⚠️ 表示**上层依赖待补**,不是当前状态。

### `env:` 字段命名/语义

**问题**:目前 `env: prod` 字面读起来像"在 production 显示",但实际语义是"production-only 显示,**dev 模式下隐藏**"。看到 `prod` 容易反向理解。

**候选方向**:
- `visibility: prod-only` —— 直白点出"可见性"维度
- `hidden_in: dev` —— 反向描述,直接说"在哪隐藏"
- `dev: hidden` —— 同义,更短

⚠️ 未决:候选间的取舍、是否同时打开 `staging` 等可扩展空间、迁移路径。

### 目录入口页约定

**问题**:目前 `<dir>/sub/index.md` 是 lint 白名单,且 [`_meta.yaml` 文档](/guide/authoring/meta-yaml.md)与 SKILL.md 都专门写一段警告"不要在父级 pages 写 `sub:`,会被错误解析为 `<dir>/sub.md`"。是长期已知的 footgun。

**`children:` 改造后的天然解法**:dir 条目就是 `{name: sub}`,parser 知道这是子目录(不会去找 `sub.md`),footgun 消失。

⚠️ 未决:是否要求 `<dir>/sub/index.md` 也在子目录自己的 `children:` 里**显式登记**(去掉自发现豁免),还是延续白名单。前者更"显式即可见",后者更零配置。

### 未在父级 `children:` 登记的子目录

**问题**:子目录有 `_meta.yaml` 但父级 `children:` 没列出它,该不该出现?

**两种方向**:
- 保留自发现:出现在末尾(已登记项之后,按目录名字典序),保留 zdoc 零配置基调
- 严格登记:不出现,跟 file 必须登记的语义一致

⚠️ 未决,跟上一条相关联。

## 明确不做

> 这一节登记**讨论过但决定不做**的提议,避免反复回锅。

- **`children:` 列表里的 string shorthand**(`- meta-yaml`):多一种解析路径多一类 bug,固定 map 形式。
- **父级覆盖子目录 title**:破坏 identity-self 原则,会滑坡到其他元数据覆盖。

## 迁移清单

切换到 2.0 时需要做的事(随条目增加而扩充):

### zdoc 自身

- [ ] `docs/` 下所有 `_meta.yaml` 改成 `children:` 形式(用 `zdoc migrate`)
- [ ] [`docs/guide/authoring/meta-yaml.md`](/guide/authoring/meta-yaml.md) 重写,反映新 schema
- [ ] `skills/zdoc/SKILL.md` 更新规则段(目录入口页 footgun 段落,如 schema 改造后失效则整段删)
- [ ] CHANGELOG / release notes 列出 breaking changes 与迁移步骤
- [ ] `README.md` / `README.zh-CN.md` 升级示例片段

### 用户侧

- [ ] [发布规范](/dev/release.md)增加"major 版本升级指引"段
- [ ] `zdoc migrate` 子命令的使用文档
- [ ] 1.x → 2.0 cookbook(常见 `_meta.yaml` 形态前后对照)

⚠️ **上层依赖缺失**:具体发布时间、是否合并其他大动作、各候选的最终决定 —— 待「待评估候选」积累到一定数量后再做发布决定。
