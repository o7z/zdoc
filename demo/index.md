---
layout: home
hero:
  name: zdoc regression samples
  text: 故意畸形的文档库，用来压测 UI
  tagline: 这里**不是 zdoc 的官方文档**。真文档请看 ../docs/ 或部署后的官方站点。
features:
  - title: 只为回归而活
    details: 超长单页、多级嵌套、边界 `_meta.yaml` —— 故意让 zdoc 渲染器处于不舒服的地方。
  - title: 对人类不友好
    details: 读起来会很奇怪。这是预期行为，不是 bug。
  - title: 用法
    details: bun run dev:demo 启动这个站；正常开发请用 bun run dev（渲染 docs/）。
---

# 这是 zdoc 的回归样本库

不是给人阅读的文档。它的存在是为了：

- 在 UI 变更前后跑一遍 `bun run dev:demo`，肉眼对比是否回归
- 让 TOC / 侧边栏 / 滚动高亮在极端情况（65KB 单页、多级嵌套）下被验证
- 留一个"这里能改坏什么"的清单

**想看 zdoc 的真文档**：切回到仓库根目录跑 `bun run dev`，那会渲染 `docs/` 目录 —— 那才是 zdoc 正儿八经的文档。
