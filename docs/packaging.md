# 打包与发布

> 《Y.Stage3 手册》章节 · 面向负责出包与分发的同学。

## 1. 一键打包

```bat
build.bat
```

等价于：构建内核产物（`npm run build`）→ `node scripts/make-portable.js --zip` → 产出 `YStage3-Portable/` 目录与同名 zip。解压即用，无需安装 Node。

`make-portable.js` 支持 `--out <目录>`（自定义输出位置）、`--zip`（打压缩包）、`--no-resource`（不带数据目录）。

## 2. 便携包布局（三层分离）

```
YStage3-Portable/
├── node/       # Node 运行时（复制构建机的 node.exe，可与应用分别升级）
├── app/        # 应用核心（bundle 形态：server.bundle.cjs + sql-wasm.wasm + web/ 整树；整体替换即升级）
├── plugins/    # ★ 插件组件层：两份清单 + 全部模块代码（可写、可热替换）
├── resource/   # 数据层：sqlite/、musics/、json/、images/
├── 启动YStage.bat
└── 说明.txt
```

- `plugins/` 与 `resource/` 在升级应用时**原地保留**——选手数据、比赛进度、自定义配置不丢失
- 启动脚本通过 `Y_STAGE_PLUGINS_DIR` / `Y_STAGE_RESOURCE_DIR` 环境变量把插件层与数据层指向外置目录，**清单与 config 的改动即时落盘、重启保持**
- `app/web/` 是**整树复制**（含 `dist/` 内核产物与 `icons.mjs` 等共享前端资产，排除 `*.test.js` 与 `front.json`），而不是只带 `dist/`——保证便携包内 `/web/icons.mjs` 等共享资产可达

## 3. 插件热替换（无需重新出包）

1. 直接修改 `plugins/` 下的文件（改 `modules/<id>/plugin.js` 逻辑、增删模块目录）
2. 打开 `/m/plugin-manager/` 对该插件**热重载**——改盘即生效
3. 新增模块：在 `plugins/plugins.json` 追加条目后重启；前端插件在 `plugins/front.json` 加条目

## 4. GitHub Actions 自动发布

`.github/workflows/package.yml`：推送 `v*` 标签或手动触发即可自动构建，产出 `YStage3-Portable.zip` 工件并随 Release 发布。

> 跨平台提示：便携包内的 node.exe 取自构建机，Windows 包需在 Windows 上构建；如需 macOS/Linux 分发，在对应系统上执行 `node scripts/make-portable.js` 即可。
