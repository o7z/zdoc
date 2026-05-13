# 代码块全家桶

zdoc 在 Markdown 的代码语法上提供了 **4 种渲染模式**，作者只需要写不同的语言标识符就能切换。本页是导览，每种模式的深入用法在各自的子文档里。

## 1. 语法高亮 —— 任意编程语言

```` ```ts ``` ` / ` ``` ```bash ``` ` / ` ``` ```json ``` ` 等。基于 [highlight.js](https://highlightjs.org/) 自动检测语种，渲染成等宽代码块、暗色模式自动跟随、右上角悬浮"复制"按钮。

```ts
const sessions = new Map<string, number>();
const hash = sha256(token + secret);
sessions.set(hash, Date.now() + 7 * 24 * 3600 * 1000);
```

```bash
pnpm run dev
# Local:   http://localhost:20000
```

```json
{
  "title": "我的文档",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

支持的语言以 highlight.js 的默认包为准（涵盖 TS / JS / Python / Go / Rust / Java / C# / C++ / Ruby / PHP / SQL / Shell / YAML / TOML / Dockerfile 等主流语言）。

## 2. 行内 code —— 反引号

写在正文里的小段标识符，用单反引号包起来即可：

```markdown
一样能 `inline code`，比如 `_meta.yaml` 或者 `const x = 1`。
```

渲染效果：一样能 `inline code`，比如 `_meta.yaml` 或者 `const x = 1`。

行内 code 适合标识符、文件名、命令片段，正文阅读时一眼就能区分。

## 3. Mermaid 图表 —— ` ```mermaid `

zdoc 原生集成 [Mermaid](https://mermaid.js.org/) v11，` ```mermaid ` 围栏块直接渲染成 SVG 图表，带交互工具栏（缩放、平移、复制源码、复制为图片）。

```mermaid
flowchart LR
    Author[作者] -->|写 .md| zdoc
    zdoc -->|渲染| Reader[读者]
```

支持 13 种图表：流程图、时序图、类图、ER 图、状态图、甘特图、饼图、Git 图、用户旅程、思维导图、时间线、架构图、C4 模型。完整示例见 → [Mermaid 图表全集](/guide/authoring/mermaid.md)。

**lint 联动**：`zdoc lint` 会调用 `mermaid.parse()` 校验每个 mermaid 块的语法，错误会标出具体行号。

## 4. EJS 模板预览 —— ` ```ejs `

` ```ejs ` 围栏块会被升级成**可交互预览面板** —— 作者只写模板，zdoc 自动扫出模板用到的变量、生成表单、读者填表 + 实时看渲染结果。

```ejs
<h1>Hello <%= name %></h1>
<% if (admin) { %><p>管理员</p><% } %>
```

含函数调用的模板会静默回落成普通代码块（保留语法高亮 + 复制按钮，但不出预览面板）。完整规则与示例见 → [EJS 代码块预览](/guide/authoring/ejs-preview.md)。

**lint 联动**：`zdoc lint` 会检查 ejs 语法错误（error 级别）和变量类型冲突（warning 级别）。

## 选哪一种？

| 你想要展示什么 | 用哪种 |
|---|---|
| 代码示例（任何语言） | ` ```语言 ` |
| 一两个标识符或文件名 | `` `inline` `` |
| 流程 / 架构 / 状态机 / 序列等图示 | ` ```mermaid ` |
| 让读者**改输入看输出**的模板演示 | ` ```ejs ` |
| 普通文本 / 配置不需要高亮 | ` ```text ` 或 ` ```（无标识符） |

## 共有的行为约定

- 所有代码块右上角默认有"复制"按钮（hover 时显示），点一下复制完整源码到剪贴板。
- 暗色模式下自动切换 highlight.js 的配色（`hljs` 主题随 `.dark` 切换）。
- Mermaid 与 EJS 预览都用 **lazy import**：页面里没有相应块时不会拉取额外的 JS bundle。
- 4 倍及以上反引号围栏可以**嵌套**其他围栏作为纯文本展示（写文档介绍 Markdown 自身时很有用）。
