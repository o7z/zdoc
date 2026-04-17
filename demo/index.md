---
name: zdoc demo
text: 给 zdoc 自己用的开发演示站
tagline: 用最少的文件，演示侧边栏、元数据条、右侧 TOC、Mermaid、暗色模式。
actions:
  - theme: brand
    text: 立即上手
    link: /intro/what-is-zdoc.md
  - theme: alt
    text: 编写文档
    link: /authoring/meta-yaml.md
features:
  - title: 三层目录
    details: 根 / 一级目录 / 二级子目录，演示嵌套侧边栏。
  - title: 元数据条
    details: description、version、author、modified 全部展示。
  - title: 右侧 TOC
    details: 内置 long-page 含有大量 h1–h3 标题，用于演示自动目录与高亮。
  - title: Mermaid + 高亮
    details: 流程图和代码块都开箱即用。
---

# 欢迎

这是一个故意做得很小的样例文档库，用来：

- 在贡献者本机上跑 `bun run dev:demo`，立刻看到所有功能；
- 测试 `_meta.yaml` 的解析、侧边栏构建、TOC 抽取这些链路是否正常；
- 给新功能上线前留一份"这里能改坏什么"的回归参考。

侧边栏左上的标题点击会回到这里。每个目录的标题只折叠/展开，不跳转。
