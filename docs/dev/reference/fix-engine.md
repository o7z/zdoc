# `zdoc fix` 引擎设计

`zdoc fix` 是 1.x 末计划引入的 CLI 子命令，负责修复 `_meta.yaml` 配置错误 —— 包含旧版 schema 自动迁移与常用使用错误修复。本文是设计草案，**未实现**。

> ⚠️ **上层依赖**：本文档基于以下用户决策起草，若改动请回扫本文：
> - Q1（lint↔fix 耦合）：**方案 A 已确认** —— fix 只对 lint 已报的 finding 动手，本轮一并扩 lint 规则
> - Q2（`pages-to-children` 启用时机）：**默认假设 B 待用户确认** —— 1.x minor 一上线就启用，配合 dual-parser 过渡期（详见 [v2 迁移时间线](#v2-迁移时间线)）
> - Q3（默认行为）：**默认 dry-run** 已确认，`--apply` 才写盘
> - CLI vs MCP：**CLI 优先**已确认，MCP 包装延后

## 它做什么

修复 `_meta.yaml` 中的配置错误：
- 老版本 schema 的机械翻译（例如 `pages:` → `children:` 在 v2 切换前）
- 孤儿 `.md` 自动登记到父级
- 已知 footgun 修正（如 `_meta.yaml` 中的 `sub:` 误指子目录）
- 缺失字段的自动派生（title 取首个 H1）
- 缺失 `_meta.yaml` 的目录脚手架

## 它**不做**什么

明确划出 scope 边界，避免 feature creep：

- ❌ **链接断裂**修复 —— 意图未知（typo？重命名？删除？），需 LLM 介入
- ❌ **mermaid 语法**修复 —— 内容错误不是配置错误
- ❌ **lifecycle 目标缺失**修复 —— 同上，需人裁决
- ❌ **frontmatter** 操作 —— zdoc 当前约定 `.md` 不带 frontmatter
- ❌ 任何 `docsDir` 之外的文件
- ❌ Git 操作（不 commit、不要求 clean tree、不读 .gitignore）

## 与 lint 的关系（Q1 = A）

**fix 只对 lint 已报出的 finding 动手**。这条规则的后果：

1. 每条 fix recipe 必须有对应的 lint 规则 —— 这是"什么算配置错误"的单一来源
2. 想加新修复能力 = 先加 lint 检测，再加对应 recipe
3. 本轮设计要同时扩 lint 出几条新 warning 规则（见 [Lint 规则新增清单](#lint-规则新增清单)）
4. 不存在"lint 不报但 fix 能改"的能力

心智上：**lint 报告问题，fix 是 lint 的逆操作**。

## CLI 接口

```bash
zdoc fix                              # 默认 dry-run：打印所有可逆 recipe 的 unified diff
zdoc fix --apply                      # 写盘
zdoc fix -y                           # 短开关，等同 --apply（给 CI）
zdoc fix --recipe=pages-to-children   # 只跑指定 recipe
zdoc fix --recipe=register-orphan --apply
zdoc fix -d ./docs                    # 指定 docs 目录，与 lint -d 一致
zdoc fix --dry-run                    # 显式 dry-run（默认行为，写明便于 CI 脚本可读）
```

### 退出码

- `0` —— dry-run 成功（无论是否有 finding），或 `--apply` 全部成功
- `1` —— `--apply` 过程中至少一个 recipe 写盘失败
- `2` —— 参数错误 / 找不到 docs 目录

`dry-run` 模式即使有 finding 也返回 0 —— 这是预览。如果想"有 finding 就失败"，用 `zdoc lint`（已有此语义）。

## MCP 接口

**初版不在 MCP 暴露 fix tool。** 理由：

1. 主要消费者（Claude Code / Cursor / Codex agents）都能跑 shell，`zdoc fix` 它们用得很顺
2. Claude Desktop 这类只能调 MCP 的 host 是少数用例，等真有用户提需求再补
3. zdoc MCP server 当前是**纯只读**（list_docs / get_doc / search_docs / get_lifecycle / get_changelog），加 fix 会让 trust model 从"读"变成"读+写"。这个变化不可逆，推迟做不亏
4. Engine 是 CLI / MCP 共用的，未来加 MCP 包装零边际成本

未来加 MCP 时，预期拆成两个 tool 而不是一个：

```
diagnose_meta(path?: string, recipe_id?: string)
  → { findings: [...] }

apply_fix(finding_id: string, confirm: true)
  → { changed_files: [...], diff: "..." }
```

分离 diagnose 和 apply 让 agent 能"先看 → 让用户拍板 → 再写"。

## Recipe registry

每条 recipe 是一个独立模块，描述：检测谓词、修复动作、可逆性、对应 lint 规则。

| Recipe id | 检测 | 修复动作 | 可逆 | 对应 lint 规则 |
|---|---|---|---|---|
| `pages-to-children` | `_meta.yaml` 用 `pages:` map（v2 迁移） | 机械翻译成 `children:` 列表，保留 `order:` 决定的相对顺序 | ✅ 完全机械 | `meta-legacy-schema`（新增，warning） |
| `register-orphan` | `.md` 存在但父级 `_meta.yaml` 未登记 | 追加到父级 `pages:`（或 `children:`），title 取首 H1 否则文件名去后缀 | ✅ 仅追加 | `meta-orphan-md`（lint 已有，warning） |
| `remove-subdir-as-file` | 父级 `pages:` 列了 key，对应名字其实是子目录 | 删该 key（子目录走自发现，title 由子目录自己 `_meta.yaml` 提供） | ✅ 删法明确 | `meta-subdir-as-file`（新增，warning） |
| `derive-missing-title` | `pages:` 下某 key 缺 `title:` | 从该 `.md` 首个 H1 推导 | ✅ 单字段补写 | `meta-missing-title`（新增，warning） |
| `scaffold-meta-yaml` | 目录里有 `.md` 但缺 `_meta.yaml` | 用目录名作 title，按文件名字典序生成 `pages:` | ✅ 新建文件 | `meta-yaml-missing`（新增，warning） |
| `prune-missing-page` | `pages:` 列了 key 但对应 `.md`/`.pdf` 都不存在 | **不自动修**，作为 finding 暴露，提示用户选：建空文件 / 删 key | ⚠️ 模糊 | `meta-page-target-missing`（lint 已有，error） |

`prune-missing-page` 是模糊 recipe 的代表 —— `zdoc fix --apply` 默认会**跳过**它，并在输出里降级为 warning 提示"请人工裁决"。

### Recipe id 命名约定

`kebab-case-verb-noun`：动词在前，名词在后。例：`register-orphan`、`derive-missing-title`、`prune-missing-page`。例外：`pages-to-children` 这类"X to Y"格式的 schema 迁移保留 `noun-to-noun`。

## Lint 规则新增清单

为了 Q1=A 的对称承诺，本轮 fix 引擎落地时 lint 同时新增以下规则（warning 级别为主）：

| Lint 规则 id | 严重度 | 检测 | 对应 recipe |
|---|---|---|---|
| `meta-legacy-schema` | warning | `_meta.yaml` 仍用 `pages:` map（2.0 前为 warning，2.0 升级为 error） | `pages-to-children` |
| `meta-subdir-as-file` | warning | 父级 `pages:` 的 key 实际指向子目录 | `remove-subdir-as-file` |
| `meta-missing-title` | warning | `pages:` 下 key 缺 `title:` | `derive-missing-title` |
| `meta-yaml-missing` | warning | 目录有 `.md` 但无 `_meta.yaml` | `scaffold-meta-yaml` |

现有 lint 规则不变：`meta-orphan-md`、`meta-page-target-missing`、internal-link 等保持原语义；fix 新接其中的 `meta-orphan-md` 和 `meta-page-target-missing`。

## 输出格式

### dry-run（默认）

git-style unified diff，每个文件一段：

```diff
--- a/docs/guide/_meta.yaml
+++ b/docs/guide/_meta.yaml
@@ -1,5 +1,8 @@
 title: 使用指南

 pages:
   intro:
     title: 介绍
+  troubleshooting:
+    title: 常见问题
```

末尾汇总：

```
3 files would be modified, 5 fixes ready to apply, 1 skipped (ambiguous: prune-missing-page).
Re-run with --apply to write changes.
```

### apply 模式

每个写盘成功的文件输出一行：

```
✓ docs/guide/_meta.yaml      register-orphan (1 fix)
✓ docs/api/_meta.yaml        pages-to-children, derive-missing-title (2 fixes)
✗ docs/legacy/_meta.yaml     SHA mismatch — file changed since scan, aborted
```

## 安全模型

### SHA 校验

- lint scan 时记录每个 `_meta.yaml` 的 sha256
- `fix --apply` 写盘前重新读取文件并校验 sha
- 不匹配 → 跳过该文件、报错，建议用户重新跑 dry-run

防止的并发场景：用户跑了 `zdoc fix`（看到 diff）→ 手动改了 `_meta.yaml` → 再跑 `--apply`，避免直接覆盖手改。

### 原子性

- **逐文件原子写**：用临时文件 + rename，单个文件要么全写要么不写
- **不做跨文件回滚**：如果跑 10 个文件，第 7 个 sha 校验失败，前 6 个**保留写入**。理由：rollback 在 docs 场景成本高（实时 serve）、收益低，多次 apply 是幂等的（recipe 在已修复的文件上是 no-op）

### YAML 保留策略 ⚠️ 未决

⚠️ **上层依赖待补**：写 `_meta.yaml` 时如何保留注释、空行、key 顺序？

候选：
- 用 [`yaml`](https://github.com/eemeli/yaml) 库的 AST API（能保留注释和顺序，复杂度高）
- 用 `js-yaml` parse + dump（丢失注释和顺序，简单）
- 介于两者：parse 后手工字符串拼接，最小改动写回

实际跑起来才知道哪种代价合理。本文先标 ⚠️，等实现期决定。

## v2 迁移时间线

> ⚠️ **默认假设 B 待用户确认**

```
1.x.N            1.x.N+1            …              2.0
─────────────────────────────────────────────────────
现状             ↑ fix 引擎落地       继续 1.x         ↑ pages: 移除
pages: only      pages-to-children   维护期           lint 报 error
                 recipe 启用                          parser 不再接受 map
                 dual-parser 开始
                 lint 出 warning
                 (meta-legacy-schema)
```

用户的迁移窗口是从 fix 引擎落地的那个 1.x minor 一直到 2.0 发布。在此期间：
- `pages:` 和 `children:` 两种 schema 都能正常 serve
- lint 出 warning 鼓励迁移，不强制
- 跑一次 `zdoc fix --recipe=pages-to-children --apply` 就能切到 `children:`

**替代方案（如果用户拒绝默认 B）**：1.x 注册 recipe 但禁用，2.0 才打开。强制顺序：升 2.0 → fix 报错或失败 → 用户必须手动迁移 → 再升级一次。失去"提前迁移"的便利。如选此方案，把本节和 [next-major.md 的迁移策略](/dev/next-major.md#迁移策略) 同步改掉。

## 代码组织（规划）

```
bin/
  fix.ts              # CLI 入口，参数解析、子命令分发
  fix.test.ts         # CLI 行为测试
  fix/
    engine.ts         # 统一 scan + apply 流程
    recipes/
      pages-to-children.ts
      register-orphan.ts
      remove-subdir-as-file.ts
      derive-missing-title.ts
      scaffold-meta-yaml.ts
      prune-missing-page.ts
    yaml-io.ts        # YAML 读写 + 保留策略
    diff.ts           # unified diff 生成
    types.ts          # Recipe、Finding、Patch 等接口
```

`bin/lint.ts` 的现有检查复用现成的 `_meta.yaml` 解析（`bin/meta-mini.ts`）；fix 新增的 lint 规则可以放在 `bin/lint.ts` 或拆出 `bin/lint/rules/*.ts`，留待实现期再决定。

## 开放设计问题

⚠️ **以下条目尚未定，实现前需要回答**：

1. **YAML 保留策略**：见 [上一节](#yaml-保留策略)
2. **多 recipe 之间的顺序依赖**：如果同一文件被多个 recipe 命中（例如先 `derive-missing-title` 再 `register-orphan`），是否有冲突？目前假设 recipe 都是幂等且可任意顺序，需实现期验证
3. **国际化文案**：lint 现在的消息是中英混排（`'pages 列出 "X" 但 ... 不存在'`），fix 输出延续这个风格还是统一？暂定延续
4. **Recipe 注册机制**：编译期写死 array vs 运行期插件？暂定编译期，需求出现再扩
5. **Q2 默认假设**：等用户确认

## 参考

- [`zdoc lint` CLI](/dev/reference/cli.md)
- [Mermaid lint](/dev/reference/mermaid-lint.md) —— 另一类不在 fix scope 的检查
- [2.0 规划](/dev/next-major.md) —— v2 breaking changes 全景
- [`_meta.yaml` 文档](/guide/authoring/meta-yaml.md) —— 当前 schema
