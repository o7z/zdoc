# `zdoc.config.json` 配置

在运行 `zdoc` 的目录下创建一个 `zdoc.config.json`，可以为这个文档站设置默认值。

## 最小例子

```json
{
  "title": "我的文档",
  "docsDir": "./docs",
  "password": "hunter2",
  "port": 8888
}
```

## 字段

| 字段       | 类型     | 说明                                                     |
|------------|----------|----------------------------------------------------------|
| `title`    | `string` | 站点标题（浏览器标签、侧边栏顶部），默认 `Docs`          |
| `docsDir`  | `string` | 文档目录，默认当前工作目录                               |
| `password` | `string` | 访问密码，传空串即关闭鉴权                               |
| `port`     | `number` | 监听端口，默认 8888                                      |

## 优先级

```
CLI 参数  >  环境变量  >  zdoc.config.json  >  默认值
```

具体：

| 项目      | CLI             | 环境变量          | zdoc.config.json | 默认              |
|-----------|-----------------|-------------------|------------------|-------------------|
| 文档目录  | `-d / --dir`    | `ZDOC_DIR`        | `docsDir`        | `process.cwd()`   |
| 标题      | `-t / --title`  | `ZDOC_TITLE`      | `title`          | `Docs`            |
| 密码      | `-w / --password` | `ZDOC_PASSWORD` | `password`       | *（无密码）*      |
| 端口      | `-p / --port`   | `PORT`            | `port`           | `8888`            |

`ZDOC_PASSWORD` 允许显式传空串 `""` 来**强制关闭**鉴权，哪怕 `zdoc.config.json` 里写了密码。

## 什么时候该用 `zdoc.config.json`

- 文档目录下启动参数固定时（一组开发人员共用一份配置）
- 想让 `npx @o7z/zdoc` 直接在项目根目录起得来时（`zdoc.config.json` 放仓库根）

## 不会去做的事

- 不支持热重载：改 `zdoc.config.json` 必须重启 zdoc 生效
- 不支持变量插值：字段值是纯字符串/数字
- 不会自动生成 —— 没有 `zdoc.config.json` 时 zdoc 用默认值静默启动
