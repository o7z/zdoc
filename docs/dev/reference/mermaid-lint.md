# Mermaid 语法 lint

`zdoc lint` 会校验 Markdown 中所有 ` ```mermaid ` 围栏代码块的语法。错误以 **error** 严重度报告（exit 1），覆盖 mermaid 支持的全部图类型。

## 为什么用 `mermaid.parse()`，而不是其他方案

| 方案 | 取舍 |
|---|---|
| **`mermaid.parse(text)`** ✅ 选定 | 与站点渲染共用同一套 parser，零漂移；mermaid 已是 runtime 依赖；一个调用覆盖所有图类型 |
| 手写正则 / 启发式 | 假阴性多（语法复杂、变体多），维护成本高 |
| 单独引入 `@mermaid-js/parser` | 只覆盖 Langium 那批新图（gitGraph、architecture-beta 等），漏掉所有 Jison 老图（flowchart、sequence 等绝大多数） |
| 跑 headless 浏览器 | 包体重、启动慢，需要 jsdom 或 playwright；与目标（一次纯 Node 校验）严重失配 |

关键事实：`mermaid.parse()` 在内部根据图类型路由到对应 parser，调用方零感知。

## DOM 依赖：为什么 lint 需要 jsdom

最初推断纯 Node 即可，实测发现：flowchart / sequence / pie / gitGraph / er 这几类不需要 DOM 就能解析；但 **classDiagram / stateDiagram-v2 / gantt / mindmap / journey** 等几种图，mermaid 在解析阶段会调用 `sanitizeText()`，而该函数依赖 `DOMPurify`，DOMPurify 在 Node 下需要一个 `window` 才能初始化。无 DOM 时直接抛 `DOMPurify.addHook is not a function`。

因此 zdoc lint 在调用 `mermaid.parse()` 之前会用 **jsdom** 建立一个最小化的 `globalThis.window`：

```ts
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// ...其他必要全局
```

jsdom 是运行期依赖（`dependencies`），只有当被 lint 的项目存在 mermaid 围栏代码块时才会被加载（懒导入）。无 mermaid 的项目零成本。

## mermaid 解析器调研结论

mermaid **不自研解析引擎**。它在源码仓库里写语法文件，构建时用第三方解析器生成器产出 parser，分发产物里只剩生成出的 JS 代码。

### 依赖证据

`node_modules/mermaid/package.json`（v11.14.0）：

```json
"dependencies": {
  "@mermaid-js/parser": "^1.1.0"
},
"devDependencies": {
  "jison": "^0.4.18"
}
```

- **Jison** —— YACC 风格的 LALR(1) 解析器生成器（zaach/jison，独立开源）。mermaid 仓库里 `.jison` 文件构建时生成 parser，运行时不再需要 jison 本体（所以挂在 devDep）。
- **`@mermaid-js/parser`** —— mermaid 团队自家维护的 NPM 包，内容 = Langium grammar + 构建产物。本质是对 **Langium** 的封装；Langium 底层用 **Chevrotain** 做词法/语法分析。

### 每种图类型的 parser 归属

通过 grep `node_modules/mermaid/dist/chunks/mermaid.core/*.mjs` 实测：

| Parser | 图类型 |
|---|---|
| **Jison** | flowchart、sequenceDiagram、classDiagram（老）、stateDiagram（老）、erDiagram、gantt、pie（老）、C4、mindmap、journey、requirement、sankey、timeline、venn、xychart、quadrantChart、kanban、ishikawa、block |
| **Langium**（经 `@mermaid-js/parser`） | gitGraph、architecture-beta、packet-beta、radar-beta、info、classDiagram-v2、stateDiagram-v2、treeView、treemap、pie（v2）|

两套 parser 共存的过渡期会持续较长时间；mermaid 团队正在把老图逐步迁到 Langium。`mermaid.parse()` 是统一入口，自动路由。

## 错误信息格式

两套 parser 抛错格式不同，lint 的行号映射需要兼容：

**Jison 风格**（绝大多数图）：

```
Parse error on line 3:
graph TD  A --!! B
------------------^
Expecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT', got '1'
```

`Parse error on line N` 中的 N 是 mermaid 内部从 1 开始的相对行号（不是 .md 文件的绝对行号）。lint 抽出 N，加上 ` ```mermaid ` 围栏起始行偏移，得到 .md 中的绝对行号。

**Langium 风格**（gitGraph 等）：消息结构不同，常见 `Expecting token '…' but found '…'`，行号可能没有，也可能以另一种格式给出。当抽取失败时，lint 回退到围栏起始行，并把原始错误信息附在消息里。

## 实现位置

- 函数：`bin/lint.ts` 的 `lintMermaidBlocks(scan)`
- 入口：`lintDocs(docsDir)` 异步聚合（含本检查在内的 5 类检查）
- 懒加载：扫描时如果没有任何 ` ```mermaid ` 围栏，跳过 `import('mermaid')`，避免无 mermaid 的项目付出加载成本

## 例：失败示例

````markdown
# 我的文档

```mermaid
graph TD
  A --!! B
```
````

lint 输出：

```
✗ my-doc.md:5  Mermaid 语法错误: Parse error on line 3: graph TD  A --!! B ...
```

`my-doc.md:5` 指向 .md 中的错误行（围栏起始行 + parser 报的相对行 - 1）。
