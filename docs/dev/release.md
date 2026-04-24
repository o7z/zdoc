# 发布流程与版本规范

## 发布命令

```
npm run release           # patch 递增（默认，不建议手动用）
npm run release minor     # minor 递增
npm run release major     # major 递增
npm run release 1.2.3     # 指定版本号
```

发布脚本会自动：
1. 检查是否在 main 分支
2. 检查 npm 登录状态
3. 执行构建（构建失败则中断）
4. `npm version <bump>` — 更新 package.json、创建 commit + tag
5. `npm publish --access public`
6. `git push --follow-tags`

## 版本递增规则

| 级别 | 递增条件 |
|------|---------|
| **MAJOR** | 破坏性变更：删除/重命名公开 CLI 选项；配置文件格式不兼容升级；移除已发布的 API 端点；侧边栏渲染发生破坏性结构变更；需要用户必须修改配置/文档才能工作 |
| **MINOR** | 新功能：新增 CLI 选项/命令；新增文档渲染能力；新增 UI 功能；向后兼容的架构改进（如文档结构重组、更新机制重写）；向后兼容的性能优化 |
| **PATCH** | 修复：Bug 修复；样式/排版微调；文档内容修正；依赖安全更新；不改变用户可见行为的代码改进 |

## 判断方法

问自己两个问题：
1. **用户升级后是否需要改自己的东西才能跑？** 是 → MAJOR
2. **用户能看到新的东西吗？** 是 → MINOR，否 → PATCH

## 注意事项

- 发布前确保工作树干净（无未提交变更）
- 发布成功后 tag 和 commit 已推送，撤回方式：`git tag -d v<ver> && git reset --hard HEAD~1`
- npm publish 失败时 tag 已创建，可手动 `npm publish --access public` 重试
