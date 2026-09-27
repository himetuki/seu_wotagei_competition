# Y.Stage3 文档索引

《手册》聚合页：**[handbook.html](./handbook.html)**（深色静态页，双击即看，含全部章节）。

## 分章文档

| 文档 | 内容 | 读者 |
|------|------|------|
| [getting-started.md](./getting-started.md) | 项目简介、便携包运行、开发者环境 | 所有人 |
| [usage.md](./usage.md) | 数据导入、比赛流程、备份恢复 | 现场使用者 |
| [plugin-manager.md](./plugin-manager.md) | 插件管理页：启停 / 热重载 / config | 管理员 |
| [tutorial.md](./tutorial.md) | 插件开发教程（上手导览，13 节，含组件与共享库） | 开发者 |
| [plugin-development.md](./plugin-development.md) | 插件开发技术参考（API / 参数 / 结构 / 生命周期） | 开发者 |
| [packaging.md](./packaging.md) | 打包、便携布局、插件热替换、自动发布 | 出包同学 |
| [../AGENTS.md](../AGENTS.md) | 开发者权威指南（与实现逐字核对） | 开发者 |
| [../README.md](../README.md) | 项目总览与用户手册 | 所有人 |

## 维护约定

- 各 `.md` 为**唯一事实源**；`handbook.html` 是自包含静态聚合页（内嵌各章内容，可离线双击打开）——修改 md 后请同步 handbook 对应章节
- 开发者契约以 `AGENTS.md` 为最高权威；docs 与其冲突时以 AGENTS.md 为准
