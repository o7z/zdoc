# 命令行参数

## 概览

```
zdoc [options]
```

默认行为：把[**当前工作目录**](/glossary.md#文档目录)当作文档目录，监听 **8888** 端口，**无密码**（文档公开）。

## 选项

| 短 | 长             | 参数       | 默认      | 作用                                           |
|----|----------------|------------|-----------|------------------------------------------------|
| `-d` | `--dir`      | `<path>`   | 当前目录  | Markdown [文档目录](/glossary.md#文档目录)                              |
| `-p` | `--port`     | `<number>` | `8888`    | 监听端口，被占用时**[自动递增](/glossary.md#端口自动递增)**到下一个可用端口 |
| `-t` | `--title`    | `<string>` | `Docs`    | 站点标题（浏览器标签、[侧边栏](/glossary.md#侧边栏)顶部）             |
| `-w` | `--password` | `<pwd>`    | *（无）*  | 访问密码，不传或传空串即关闭鉴权               |
| `-D` | `--download` | —          | 关闭      | 启用文档打包下载：开放 `/api/download.zip` 端点并在站点 header 显示下载按钮。开启密码保护时下载也会被同一鉴权拦截 |
| `-h` | `--help`     | —          | —         | 显示帮助                                        |
| `-v` | `--version`  | —          | —         | 显示版本号                                      |

## 常用例子

```bash
# 当前目录 + 默认端口 + 无密码
zdoc

# 自定义目录与端口
zdoc -d ./docs -p 3000

# 自定义站点标题
zdoc -t "我的文档"

# 启用[密码保护](/glossary.md#密码保护)
zdoc -w hunter2

# 启用打包下载（关闭密码时文档可被任何人打包下载，注意场景）
zdoc -D

# 全参数覆盖
zdoc -w hunter2 -p 8080 -d ./site -t "My Docs" -D
```

## 端口占用

若 `-p` 指定的端口（或默认 8888）被占用，zdoc **不会报错退出**，而是尝试下一个可用端口并在终端打印实际绑定的地址。若希望端口固定，确保它在启动前空闲。

## 优先级链

CLI 参数优先于 `zdoc.config.json`，后者优先于默认值。细节见「参考 / zdoc.config.json 配置」。

## zdoc lint

对文档目录做静态检查，报告 `_meta.yaml` 配置错误、内部链接断裂、生命周期目标缺失、mermaid/EJS 语法错误等问题。

### 用法

```bash
zdoc lint                 # 检查当前目录
zdoc lint -d ./docs       # 指定文档目录
```

### 选项

| 短 | 长        | 参数     | 作用                              |
|----|-----------|----------|-----------------------------------|
| `-d` | `--dir` | `<path>` | 文档目录（默认：当前目录）        |
| `-h` | `--help`| —        | 显示帮助                          |

### 检查项

- `_meta.yaml` 一致性：pages key 与磁盘文件对照
- `meta-subdir-as-file`：pages key 实际指向子目录而非 `.md`
- `meta-missing-title`：pages key 缺少 `title:` 字段
- `meta-yaml-missing`：目录有 `.md` 但无 `_meta.yaml`
- 内部 Markdown 链接存在性
- 生命周期目标存在性（`superseded_by` / `folded_to`）
- 折叠 blockquote 格式约定
- Mermaid 代码块语法（所有图类型）
- EJS 代码块语法与变量类型冲突

### 退出码

- `0` — 检查通过（warning 不影响退出码）
- `1` — 报告了至少一个 error

## zdoc fix

自动修复 `_meta.yaml` 配置错误。fix 只对 lint 已报出的 finding 动手 —— lint 是问题的单一来源，fix 是其逆操作。

> **注意**：`zdoc fix` 会重新格式化 `_meta.yaml` —— 注释和空行将丢失。dumper 以固定字段顺序输出，结果是确定性的。

### 用法

```bash
zdoc fix                              # dry-run：打印 unified diff，不写盘
zdoc fix --apply                      # 实际写入磁盘
zdoc fix -y                           # 同 --apply，适合 CI
zdoc fix -d ./docs                    # 指定文档目录
zdoc fix --recipe=register-orphan     # 只跑指定 recipe
zdoc fix --recipe=register-orphan --apply
```

### 选项

| 短 | 长              | 参数     | 默认      | 作用                                        |
|----|-----------------|----------|-----------|---------------------------------------------|
| `-d` | `--dir`       | `<path>` | `./docs` 若存在，否则当前目录 | 文档目录       |
|    | `--apply`       | —        | 关闭      | 实际写入磁盘（默认仅 dry-run）              |
| `-y` | —             | —        | 关闭      | 同 `--apply`，给 CI 使用                    |
|    | `--dry-run`     | —        | 开启      | 显式 dry-run（默认行为，便于脚本可读）      |
|    | `--recipe <id>` | `<id>`   | *（全部）* | 只运行指定 recipe（单个值）                |
| `-h` | `--help`      | —        | —         | 显示帮助，列出所有 recipe id               |

### Recipe 列表

| Recipe id | autoFix | 说明 |
|---|---|---|
| `register-orphan` | ✅ | 把孤儿 `.md` 自动登记到父级 `_meta.yaml` |
| `remove-subdir-as-file` | ✅ | 删除把子目录误写成 page key 的条目 |
| `derive-missing-title` | ✅ | 从首个 H1 推导缺失的 `title:` 字段 |
| `scaffold-meta-yaml` | ✅ | 为只有 `.md` 但缺 `_meta.yaml` 的目录生成脚手架 |
| `prune-missing-page` | — | 列出 pages 指向的不存在文件（仅提示，不自动修） |

`prune-missing-page` 的 `autoFix` 为 false：`--apply` 时跳过，dry-run 时在"需人工裁决"段单独列出。

### 退出码

- `0` — dry-run 完成（无论是否有 finding），或 `--apply` 时所有写入成功
- `1` — `--apply` 时至少一个文件写入失败（例如 SHA 校验不符）
- `2` — 参数错误、docs 目录不存在，或指定了未知的 `--recipe` id

dry-run 有 finding 也返回 0 —— 这是预览模式。如需"有 finding 就失败"，用 `zdoc lint`。
