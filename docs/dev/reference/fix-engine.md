# `zdoc fix` 引擎设计

v1.15 已实现初版，本文记录设计与实现现状。`pages-to-children` 因 schema 迁移延后到 v2，详见 [v2 迁移时间线](#v2-迁移时间线)。

> **实现状态**：
> - Q1（lint↔fix 耦合）：**已确认** —— fix 只对 lint 已报的 finding 动手，v1.15 一并扩了 lint 规则
> - Q2（`pages-to-children` 启用时机）：**延后到 v2 开发期** —— v1.15 fix 引擎不含此 recipe，保持 v2-schema-neutral
> - Q3（默认行为）：**已确认** —— 默认 dry-run，`--apply` 才写盘
> - CLI vs MCP：**CLI 已在 v1.15 落地**，MCP 包装仍延后
> - YAML 保留策略：**已决定** —— 不保留注释和空行，dumper 以固定 schema 字段顺序确定性输出；CLI 打印一次性提示

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

| Recipe id | 状态 | 检测 | 修复动作 | 可逆 | 对应 lint 规则 |
|---|---|---|---|---|---|
| `register-orphan` | ✅ v1.15 | `.md` 存在但父级 `_meta.yaml` 未登记 | 追加到父级 `pages:`，title 取首 H1 否则文件名去后缀 | ✅ 仅追加 | `meta-orphan-md`（lint 已有，warning） |
| `remove-subdir-as-file` | ✅ v1.15 | 父级 `pages:` 列了 key，对应名字其实是子目录 | 删该 key（子目录走自发现，title 由子目录自己 `_meta.yaml` 提供） | ✅ 删法明确 | `meta-subdir-as-file`（v1.15 新增，warning） |
| `derive-missing-title` | ✅ v1.15 | `pages:` 下某 key 缺 `title:` | 从该 `.md` 首个 H1 推导 | ✅ 单字段补写 | `meta-missing-title`（v1.15 新增，warning） |
| `scaffold-meta-yaml` | ✅ v1.15 | 目录里有 `.md` 但缺 `_meta.yaml` | 用目录名作 title，按文件名字典序生成 `pages:` | ✅ 新建文件 | `meta-yaml-missing`（v1.15 新增，warning） |
| `prune-missing-page` | ✅ v1.15 | `pages:` 列了 key 但对应 `.md`/`.pdf` 都不存在 | **不自动修**（`autoFix: false`），作为 finding 暴露，提示用户人工裁决 | — | `meta-page-target-missing`（lint 已有，error） |
| `pages-to-children` | v2 待加 | `_meta.yaml` 仍用 `pages:` map（v2 schema 迁移） | 机械翻译成 `children:` 列表，保留 `order:` 决定的相对顺序 | ✅ 完全机械 | `meta-legacy-schema`（v2 开发期随 dual-parser 一起落地） |

`prune-missing-page` 是模糊 recipe 的代表 —— `zdoc fix --apply` 默认会**跳过**它，并在输出里提示"请人工裁决"。

### Recipe id 命名约定

`kebab-case-verb-noun`：动词在前，名词在后。例：`register-orphan`、`derive-missing-title`、`prune-missing-page`。例外：`pages-to-children` 这类"X to Y"格式的 schema 迁移保留 `noun-to-noun`。

## Lint 规则新增清单

v1.15 fix 引擎落地时 lint 同时新增以下规则（warning 级别为主）：

| Lint 规则 id | 严重度 | 检测 | 对应 recipe |
|---|---|---|---|
| `meta-subdir-as-file` | warning | 父级 `pages:` 的 key 实际指向子目录 | `remove-subdir-as-file` |
| `meta-missing-title` | warning | `pages:` 下 key 缺 `title:` | `derive-missing-title` |
| `meta-yaml-missing` | warning | 目录有 `.md` 但无 `_meta.yaml` | `scaffold-meta-yaml` |

`meta-legacy-schema` 随 `pages-to-children` 一起延后到 v2 开发期落地。

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

末尾汇总行：

```
汇总：3 个文件待修改，5 项自动修复，1 项需人工裁决。
```

需人工裁决的 `prune-missing-page` finding 在 dry-run 中单独列出，供用户审阅。

### apply 模式

每个写盘成功的文件输出一行：

```
✓ docs/guide/_meta.yaml      (register-orphan)
✓ docs/api/_meta.yaml        (derive-missing-title, scaffold-meta-yaml)
✗ docs/legacy/_meta.yaml     SHA mismatch — file changed since scan, aborted
```

末尾汇总行与 dry-run 格式相同。

## 安全模型

### SHA 校验

- lint scan 时记录每个 `_meta.yaml` 的 sha256
- `fix --apply` 写盘前重新读取文件并校验 sha
- 不匹配 → 跳过该文件、报错，建议用户重新跑 dry-run

防止的并发场景：用户跑了 `zdoc fix`（看到 diff）→ 手动改了 `_meta.yaml` → 再跑 `--apply`，避免直接覆盖手改。

### 原子性

- **逐文件原子写**：用临时文件 + rename，单个文件要么全写要么不写
- **不做跨文件回滚**：如果跑 10 个文件，第 7 个 sha 校验失败，前 6 个**保留写入**。理由：rollback 在 docs 场景成本高（实时 serve）、收益低，多次 apply 是幂等的（recipe 在已修复的文件上是 no-op）

### YAML 保留策略

**已决定：不保留注释和空行。** 理由：

- 零新依赖：dumper 直接用内置逻辑，不引入额外 YAML AST 库
- 确定性输出：字段顺序固定（`title` → `order` → `pages`），每次 apply 产生相同结果，利于 diff 审查

CLI 在 apply 前打印一次性提示：

```
提示：zdoc fix 会重新格式化 _meta.yaml — 注释和空行将丢失。
```

用户预期：`_meta.yaml` 经 `--apply` 后会被规整为干净格式，注释应移到独立说明文档或 commit message。

## v2 迁移时间线

```
1.15             1.x 维护期          v2 开发期开始      2.0
─────────────────────────────────────────────────────────
↑ fix 引擎落地    继续 1.x            ↑ dual-parser      ↑ pages: 移除
5 条 v2-neutral  5 recipe 可用       启用               lint 报 error
recipe 可用      pages: 仍正常        pages-to-children  parser 不再接受 map
                serve               recipe 落地         meta-legacy-schema
                                    lint 出 warning     升为 error
                                    (meta-legacy-schema)
```

**v1.15 fix 引擎**是 v2-schema-neutral 的：它只处理 `pages:` map 格式内部的配置错误（孤儿登记、缺 title、缺 `_meta.yaml`），不涉及 `pages:` → `children:` 的 schema 转换。

**v2 开发期**：`pages-to-children` recipe 与 dual-parser 一同落地。届时：
- `pages:` 和 `children:` 两种 schema 都能正常 serve（过渡期）
- lint 出 `meta-legacy-schema` warning 鼓励迁移，不强制
- 跑一次 `zdoc fix --recipe=pages-to-children --apply` 即可切到 `children:`

用户的迁移窗口从 v2 开发期开始，一直到 2.0 正式发布。

## 代码组织

```
bin/fix.ts                              # CLI 入口（256 行）
bin/fix/types.ts                        # Recipe、Finding、ScanResult、ApplyResult 接口
bin/fix/engine.ts                       # scan、apply、applyToString；RECIPES compile-time array
bin/fix/yaml-io.ts                      # readDirMetaWithSha、parseDirMetaFromString、dumpDirMeta、sha256Hex
bin/fix/diff.ts                         # unifiedDiff — LCS-based
bin/fix/recipes/register-orphan.ts
bin/fix/recipes/remove-subdir-as-file.ts
bin/fix/recipes/derive-missing-title.ts
bin/fix/recipes/scaffold-meta-yaml.ts
bin/fix/recipes/prune-missing-page.ts
bin/fix.test.ts                         # CLI 集成测试
bin/fix.e2e.test.ts                     # 端到端 fixture 测试
bin/fix/engine.test.ts                  # engine 单元测试
bin/fix/yaml-io.test.ts                 # dumper roundtrip + 幂等性测试
bin/fix/diff.test.ts                    # diff 生成器测试
bin/fix/recipes/*.test.ts               # 每个 recipe 的单元测试
```

`Recipe<P>` 接口（`bin/fix/types.ts`）：`id`、`description`、`autoFix`、`detect(scan)`、可选 `apply(finding, before): string`。`apply` 是纯函数 —— SHA 校验和写盘由 engine 统一处理。

## 开放设计问题

v1.15 实现期已解决的问题（存档）：

1. **YAML 保留策略** — 已决定：不保留，见 [YAML 保留策略](#yaml-保留策略)
2. **多 recipe 之间的顺序依赖** — 已确认：compile-time array 顺序确定，recipe 幂等，不存在跨 recipe 冲突
3. **国际化文案** — 已确认：混合 zh-CN/en，与 `bin/lint.ts` 风格一致
4. **Recipe 注册机制** — 已确认：编译期 array，`bin/fix/engine.ts` 中写死，无插件机制
5. **`pages-to-children` 启用时机** — 已确认：延后到 v2 开发期，v1.15 不含此 recipe

尚未决定：

- **MCP 包装**：将来若需要，`diagnose_meta` + `apply_fix` 两个 tool 的分离设计仍适用，见 [MCP 接口](#mcp-接口)
- **`--recipe` 多选**：当前单值只，逗号分隔多选延后

## 参考

- [`zdoc lint` CLI](/dev/reference/cli.md)
- [Mermaid lint](/dev/reference/mermaid-lint.md) —— 另一类不在 fix scope 的检查
- [2.0 规划](/dev/next-major.md) —— v2 breaking changes 全景
- [`_meta.yaml` 文档](/guide/authoring/meta-yaml.md) —— 当前 schema
