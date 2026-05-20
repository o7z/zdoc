本文档登记 zdoc **下一个 major 版本(目标 2.0)**的设计变更与迁移计划。按 [semver](/dev/release.md#版本递增规则) 约定,所有破坏性变更只能在 major 一起释放;集中攒起来一次切换,降低用户的迁移成本。

> 文件名 `next-major` 是稳定指代 —— 2.0 发布并归档后,本文件可直接接 3.0 的内容,不需要 rename。

## 状态总览

| 项目 | 状态 |
|------|------|
| 当前版本 | 1.15.x |
| 目标版本 | 2.0(无具体日期) |
| 触发条件 | 已决定项积累到值得发布的程度 |
| 维护方式 | 决定一项加一条;放弃的提议挪到「明确不做」并保留记录 |

## 1.x 配套工作(为 2.0 迁移铺路)

> 这一节登记**在 1.x 释放、目的是支撑 2.0 平滑迁移**的工作。它们本身不是 v2 breaking change,但要在 2.0 之前稳定下来,以免迁移日需要现场造轮子。

### `zdoc fix` 引擎(v1.15 已落地)

`zdoc fix` 子命令已在 v1.15 发布，处理 `_meta.yaml` 配置错误。详细设计见 [`zdoc fix` 引擎](/dev/reference/fix-engine.md)。

v1.15 落地的 5 条 recipe（均 v2-schema-neutral，不涉及 `pages:` → `children:` 转换）：
- `register-orphan`：孤儿 `.md` 自动登记到父级
- `remove-subdir-as-file`：删除把子目录误写成 page key 的条目
- `derive-missing-title`：从首个 H1 推导缺失的 title
- `scaffold-meta-yaml`：为缺 `_meta.yaml` 的目录生成脚手架
- `prune-missing-page`：列出指向不存在文件的条目（仅提示，不自动修）

`pages-to-children` recipe 与 dual-parser 一起在 v2 开发期落地，不在 1.x 范围内。

其他核心点：
- 与 lint 耦合：fix 只对 lint 已报出的 finding 动手；v1.15 同时新增 3 条 warning 规则（`meta-subdir-as-file`、`meta-missing-title`、`meta-yaml-missing`）
- 默认 dry-run：`zdoc fix` 只打印 unified diff，需 `--apply` 才写盘，`-y` 给 CI
- MCP 侧暂不暴露 fix tool（zdoc MCP server 当前是纯只读，加写盘 tool 是 trust model 变化，延后做）

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

- **v1.15**：fix 引擎落地，5 条 v2-neutral recipe 可用；`pages:` map 格式继续正常 serve，无 schema 变动。
- **v2 开发期**：dual-parser 启用，同时接受 `pages:` (map) 和 `children:` (list)；lint 新增 `meta-legacy-schema` warning 鼓励迁移；`pages-to-children` recipe 在此时落地，用户可提前迁移。
- **2.0**：`pages:` 字段移除，parser 不再接受 map 形式，lint 报 error。
- **工具**：由 [`zdoc fix` 引擎](/dev/reference/fix-engine.md) 的 `pages-to-children` recipe 做机械翻译（map → list），保持现有 `order:` 数值的相对顺序。该 recipe 在 v2 开发期引入，2.0 切换时已是用户用熟的工具。

#### 边界确认

- `children:` **不允许 string shorthand**(`- meta-yaml`):统一 map 形式,避免多解析路径多类 bug。
- 父级**不允许**覆盖子目录 title:identity 归自身原则不松动。
- 同级 `.md` 与子目录的渲染顺序由 `children:` 列表中的位置直接决定,不再有"file 优先"的 tie-breaker。

#### 自发现规则:未登记 = 不显示

v1 行为"子目录有 `_meta.yaml` 就自动出现在侧边栏末尾"在 v2 取消。子目录与 `.md` 文件一样必须在父级 `children:` 显式登记,否则不显示。

设计延伸:**arrangement 归容器**贯穿 file 和 dir,父级 `children:` 是侧边栏顺序的唯一声明。

**配套工具**:[`zdoc fix`](/dev/reference/fix-engine.md) 的 `register-orphan` recipe 在 v2 开发期从只管 `.md` 扩展到也管子目录 —— 子目录存在 `_meta.yaml` 但父级 `children:` 未列出 → 自动追加。新建子目录的体验仍是"扔进去 → `zdoc fix` → 齐",零配置体感由工具层承接。

`pages-to-children` recipe 切换时同步把现有自发现的子目录登记到父级,避免迁移后从侧边栏消失。

#### 目录入口由 `children[0]` 决定

`<dir>/sub/index.md` 在 v2 取消特殊地位:

- 跟其他 `.md` 一样必须在子目录自己的 `children:` 里显式登记;v1 的 lint 白名单豁免取消。
- 直接访问目录 URL(例如 `/guide/authoring/choose-a-structure/`)时,parser 显示 `children:` 列表的**第一项**,而非按文件名 `index` fallback。
- 若 `children[0]` 是子目录,parser **递归**进入该子目录继续找 `children[0]`,直到落到一个 `.md`。`children:` 为空或递归到底仍无 `.md` → lint error("目录无可显示的入口页")。

设计延伸:文件名不承载特殊语义,arrangement 完全由 `children:` 顺序决定。"想让 X 作目录封面" → 把 X 排到首位,文件名是 `index` / `overview` / `intro` 都一样。

附带:v1 在父级 pages 写 `sub:` 错把子目录当文件的 footgun 在 `children:` schema 下天然消失,[`_meta.yaml` 文档](/guide/authoring/meta-yaml.md) 与 `skills/zdoc/SKILL.md` 中对应警告段落可在 v2 文档更新时整段删。

### `env:` → `visibility:` 字段重命名

v1 的 `env: prod` 字面读起来像"声明归属",但实际语义是"production-only 显示, dev 模式隐藏",反向理解高发。v2 改字段名 + 改值表达,让字面对齐语义。

#### 当前

```yaml
pages:
  marketing-page:
    title: 营销页
    env: prod              # 实际: 只在 prod 显示, dev 隐藏
```

#### 之后

```yaml
children:
  - name: marketing-page
    title: 营销页
    visibility: prod-only  # 字面直白
```

#### 设计选择

- **字段名 `visibility:`** —— 维度对位,从"环境归属"换到"可见性"
- **值 `prod-only`** —— 字面无需脑补 dev 行为
- **扩展空间** —— 未来可无 schema 改动支持 `dev-only`、`hidden`(完全不显示)、需要时再加 staging 形式;不引入"每个环境一个键"的散落 schema

#### 迁移策略

- **v2 开发期**:dual-key parser,`env: prod` 和 `visibility: prod-only` 都接受;lint 出 `meta-legacy-env-key` warning 鼓励迁移
- **2.0**:`env:` 字段移除,parser 只认 `visibility:`,lint 报 error
- **工具**:[`zdoc fix`](/dev/reference/fix-engine.md) 新增 `env-to-visibility` recipe(机械翻译、可逆),在 v2 开发期与 `pages-to-children` 同期落地

#### 边界确认

- v2 首发只引入 `visibility: prod-only` 一个值(对应 v1 `env: prod`);其他值(`dev-only` / `hidden`)等真有需求再加,避免一次性引入未验证语义。
- 不引入快捷写法(例如 `visibility: prod` 简写):统一 `<scope>-only` 后缀,避免歧义。

## 待评估候选

> _目前无待评估条目。新加条目挂 ⚠️ 表示上层依赖待补。_

## 明确不做

> 这一节登记**讨论过但决定不做**的提议,避免反复回锅。

- **`children:` 列表里的 string shorthand**(`- meta-yaml`):多一种解析路径多一类 bug,固定 map 形式。
- **父级覆盖子目录 title**:破坏 identity-self 原则,会滑坡到其他元数据覆盖。

## 迁移清单

切换到 2.0 时需要做的事(随条目增加而扩充):

### zdoc 自身

- [ ] `docs/` 下所有 `_meta.yaml` 改成 `children:` 形式（`zdoc fix --recipe=pages-to-children --apply`，待 v2 开发期实现 recipe）
- [ ] `docs/` 下所有 `env: prod` 改成 `visibility: prod-only`（`zdoc fix --recipe=env-to-visibility --apply`，待 v2 开发期实现 recipe）
- [ ] [`docs/guide/authoring/meta-yaml.md`](/guide/authoring/meta-yaml.md) 重写,反映新 schema
- [ ] [`docs/guide/authoring/page-fields.md`](/guide/authoring/page-fields.md) 的 `env` 字段说明改成 `visibility`
- [ ] [`docs/glossary.md`](/glossary.md) 中 `env: prod` 词条改成 `visibility: prod-only`(或加重定向)
- [ ] `skills/zdoc/SKILL.md` 更新规则段(目录入口页 footgun 段落,如 schema 改造后失效则整段删)
- [ ] CHANGELOG / release notes 列出 breaking changes 与迁移步骤
- [ ] `README.md` / `README.zh-CN.md` 升级示例片段

### 用户侧

- [ ] [发布规范](/dev/release.md)增加"major 版本升级指引"段
- [ ] [`zdoc fix` 引擎](/dev/reference/fix-engine.md)的使用文档已就位
- [ ] 1.x → 2.0 cookbook(常见 `_meta.yaml` 形态前后对照)

⚠️ **上层依赖缺失**:具体发布时间、是否合并其他大动作、各候选的最终决定 —— 待「待评估候选」积累到一定数量后再做发布决定。
