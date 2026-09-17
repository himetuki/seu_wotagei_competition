# 快速上手

> 《Y.Stage3 手册》章节 · 读者：现场使用者与开发者
> 插件开发请进阶阅读 [插件开发教程](./tutorial.md) 与 [插件开发技术参考](./plugin-development.md)。

## 1. 项目是什么

Y.Stage3 是 WOTA 艺（荧光棒舞蹈）对战平台：管理选手、技能、音乐，支持一年加组、一年内组、团体赛、Drag 对阵树等赛制。

架构一句话：**万物皆插件**。每个功能模块 = 一对插件（后端 `plugin.js` + 前端 `front/plugin.js`）+ 三份清单条目；页面仍是独立页面 `/m/<id>/`，由服务端（Node 内置 http + 自研 y-router + cordis 插件内核）与前端内核（`/web/kernel.js`）分别装配。**新增功能不需要修改任何共享代码。**

## 2. 现场使用者（便携包）

1. 从 Release 下载 `YStage3-Portable.zip`，解压到一个**专用文件夹**
2. 双击 `启动YStage.bat`，浏览器访问 <http://localhost:3000>
3. 首次运行会自动生成缺失的 `resource/` 目录结构
4. 用完关闭窗口即可

> 端口 3000 被占用时自动改用 3001、3002……，并在窗口打印实际地址，访问打印出的地址即可。

**停止与自检**：

- 正常退出：`Ctrl+C`，或在终端输入 `q` / `exit`
- 数据自检：输入 `t` / `test`，确认本机能否正常读写数据库（**重要比赛前建议在备用电脑也跑一遍**）

## 3. 开发者环境（源码运行）

```bash
npm install          # 安装依赖
npm run build        # 构建内核产物（server/cordis/kernel.cjs + web/dist/kernel.js，均 gitignored）
node server.js       # 启动，控制台出现 [cordis] 装配完成 即成功
```

- 克隆或换新环境后**必须先 `npm run build`**——内核产物不入库，缺它启动会快速失败并给出修复指引
- 数据自检：启动后终端输入 `t`；开发测试入口 `node server.js --test`（跑完自动退出，exit 0）
- 装配自检：`node server.js --test-cordis`（插件装配断言 A1-A6）
- 单元测试：`node server/run-unit-tests.js`

## 4. 数据在哪

全部运行数据都在 `resource/` 文件夹（SQLite 数据库、音乐库、json 快照、图片）。**备份 = 复制整个 `resource/` 文件夹**，详见[日常使用](./usage.md)。
