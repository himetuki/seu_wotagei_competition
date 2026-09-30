# Y.Stage X 比赛系统

**来自 Yukari，为东南大学异度沸腾动漫社 WOTA 艺团而写。**

本项目由 AI 辅助编写，专用于团内 WOTA 艺赛事：管理选手、技能、音乐，支持一年加组、一年内组、团体赛、对阵树等赛制。作者水平有限，请多包涵。

如果你是比赛现场的使用者，请看"快速开始"与"使用说明"；如果你是开发者，请看"项目文件结构"与"技术架构"——技术部分的内容是经过核对的。

***

## 快速开始（普通用户）

### Release 里的文件怎么选

每个版本的 Release 会发布便携包，解压即用：

| 文件                     | 内容                                                     | 给谁用              |
| ---------------------- | ------------------------------------------------------ | ---------------- |
| `YStage3-Portable.zip` | **便携运行包**：`node/` 运行时 + `app/` 应用核心 + `plugins/` 插件组件层 + `resource/` 数据目录 | 普通用户，**唯一分发形态**  |

> 没有 `resource/` 文件夹也没关系：首次运行会**自动创建**所需的目录结构（见"使用说明"）。便携包只是把这些目录提前帮你带齐了。

### 方式一：直接运行（推荐）

1. 下载 `YStage3-Portable.zip`，解压到一个**专用文件夹**里
2. 双击 `启动YStage.bat`
3. 首次运行会自动生成缺失的 `resource/` 目录结构，几秒后即可在浏览器访问 <http://localhost:3000>
4. 用完后关闭窗口即可

> 若端口 3000 被占用，程序会自动改用 3001、3002……，并在窗口打印 `服务器运行在 http://localhost:xxxx`，访问打印出的地址即可。

### 方式二：从终端启动（开发者）

从源码运行。**首次（或 fresh clone 后）需要先安装依赖并构建内核产物**（产物在 `.gitignore` 中，不随仓库分发）：

```bash
npm install       # 安装依赖
npm run build     # 生成 server/cordis/kernel.cjs 与 web/dist/kernel.js
node server.js    # 或 npm start；开发热重启用 npm run dev（nodemon）
```

看到 `服务器运行在 http://localhost:3000` 即表示启动成功（端口被占用自动顺延）；启动日志出现 `[cordis] 装配完成` 且错误为 0 即插件装配正常。

日常改动是否需要重新构建：

- 只改模块文件（`modules/<id>/` 的 `plugin.js`、`front/`、页面）：**无需构建**，重启服务即生效（前端插件刷新页面即可）
- 改 `web/` 内核源码：`npm run build:web`
- 改 `server/cordis/` 装配层：`npm run build:kernel`

### 停止与自检

- 正常退出：`Ctrl+C`，或在终端输入 `q` / `exit`

- 数据自检：输入 `t` / `test`，可确认本机能否正常读写数据库（比赛前建议跑一遍）

***

## ⚠ 赛前准备清单（必读：下载 ≠ 能直接上场）

**便携包解压后得到的是一个"空舞台"**——程序能启动，但没有任何选手、音乐和技能数据；操作流程也需要提前熟悉。请务必**至少提前 1~2 天**完成以下准备，不要等到比赛当天。

### 1. 上手演练（最重要）

在非比赛环境下**完整跑一遍比赛流程**，确认每个环节都会操作：

1. 设置中心导入几名测试选手、几条测试技能
2. 放几首测试音乐进音乐目录，刷新页面确认列表出现
3. 进任意赛制页面：分组 → 编排 → 抽音乐 → 开始比赛 → 判定胜者 → 推进轮次
4. 到排名/排行榜页确认成绩出现
5. 重置数据，再完整走一遍——第二次通常会发现第一次没搞懂的按钮

现场节奏很快，**当天才第一次点开页面是最大的风险**。

### 2. 准备音乐文件（赛前必须就位）

音乐按"组别"分目录存放，**放好后刷新页面（或点音乐管理页的更新按钮）即自动扫描登记**：

| 组别 | 目录（`resource/musics/` 下） | 对应赛制 |
| --- | --- | --- |
| 一年加组第一章节 | `1yearplus` | 一年加组 Prof |
| 一年加组第二章节 | `1yearplus_ex` | 一年加组第二章 |
| 一年内组 | `1yearminus` | Rookies（一年内组） |
| 团体赛游戏音乐 | `games_musics` | 团体赛 |
| 回收站（暂存下架曲目） | `musics_free` | — |

- 格式：mp3 / wav（也支持 flac / ogg）；建议 50MB 以内
- 文件名避免特殊字符（中文可用）
- 也可以不碰文件系统：直接用"音乐导入"页面上传，效果相同

### 3. 准备参赛人员列表

- 推荐方式：把名单写进 **txt 文件（一行一个选手名，UTF-8 编码）**，在 设置中心 → 选手管理 批量导入
- 也可以在 设置中心 → 选手管理 里逐个手工录入
- 一年加组与一年内组是**两份独立名单**（player1 / player2），别只导了一份
- 技能、奖项数据同理在设置中心维护（用于抽取与颁奖页面）

### 4. 赛前检查（当天出门前）

- 终端输入 `t` 跑数据自检
- 确认音乐能正常播放（抽一首点播放，别等现场才发现音频设备问题）
- **备份整个 `resource/` 文件夹**，并建议在备用电脑上恢复演练一遍
- 确认比赛现场用**局域网**访问（系统按本地比赛设计，不建议跨公网使用，见下方 FAQ）

***

## 使用说明

### 首次启动后的数据导入

程序自带空数据启动后，选手、技能、音乐等全部在**网页界面**里导入，通常不需要直接编辑文件：

- **导入选手**：主页 → 设置中心 → 选手管理。支持 txt 批量导入：文件一行一个选手名字，后缀 `.txt`，无需分隔符

- **导入技能**：设置中心 → 技能管理

- **导入奖励**：设置中心 → 奖励管理

- **导入音乐**：设置中心 → 音乐管理，或"音乐导入"页面批量导入；也可以直接把音乐文件放进 `resource/musics/<组别目录>`（如 `1yearplus`、`1yearminus`、`1yearplus_ex`、`games_musics`、`musics_free`），再刷新页面

> 音乐文件格式建议 mp3 / wav，文件名尽量避免特殊字符。

### 一场比赛怎么跑

1. **赛前准备**：在设置中心导入选手、技能、音乐；打开各赛制页面确认数据正确
2. **抽签/编排**：在赛制页面（一年加组 / 一年内组 / 团体赛 / Drag 式）完成分组与对阵
3. **抽取音乐**：点击"抽取音乐"，随机滚动结束后确认曲目
4. **开始比赛**：点击"开始比赛"播放音乐，进入比赛模式；双击任意位置可停止播放
5. **判定胜负**：比赛结束后点击胜者，系统自动计分并推进轮次
6. **查看结果**：比赛结束后到排名、排行榜、团体排名页面查看成绩
7. **备份数据**：比赛结束后复制整个 `resource/` 文件夹保存

### 备份与恢复

- 全部数据都在 `resource/` 文件夹里（选手、赛程、SQLite 数据库、音乐）

- **备份**：复制整个 `resource/` 文件夹即可

- **恢复**：把备份的 `resource/` 放回程序同目录，覆盖同名文件即可

- **重要比赛前**：请备份，并在备用电脑上跑一遍 `t` 自检

***

## 功能一览

- **一年加组（Prof）**：第一章节、第二章节

- **一年内组（Rookies II / Rookies I）**：上半场、下半场

- **团体赛（Team）**：3 人团体、多轮淘汰

- **Drag 式比赛**：对阵树拖拽晋级，可开启四强双败

- **音乐抽取**：三个曲库直接抽

- **小游戏**：定时搬化棒、体态传技（不用手演绎技，考验对技的理解）

- **排名**：选手排名、排行榜、团体排名

- **设置中心**：选手 / 技能 / 奖励 / 音乐统一管理

- **音乐导入**：批量把音乐文件加入对应曲库

- **插件管理**（`/m/plugin-manager/`，面向管理员）：不修改代码即可启用/停用功能模块、编辑插件配置、热重载；改动即时落盘，重启后保持。「主题插件」标签按插件组整组启停主题，并可一键设为系统主题

- **主题系统**（`/m/theme-manager/`）：一键切换系统级主题——默认皮肤（各页面自带的传统外观，稳定优先）或「霓虹」主题（WOTA live 会场 × 电竞 HUD：荧光棒人浪、舞台光束、扫描线、跑马灯等氛围演出）；比赛演出（battle-mode）期间氛围自动退场只留背景图；切换后全场屏幕刷新生效

另有一些玩法建议（如"抢棒敲猜技"小游戏）保存在社团内部，需要时可由开发同学添加到系统中。

***

## 项目文件结构

```
Y.Stage3/
├── modules/                  # ★ 功能模块：每个功能 = 一对插件 + 三份清单条目
│   ├── modules.json          # 页面元数据清单（导航页/管理页的显示名单）
│   └── <模块id>/             # 如 home、select、drag、group-battle、plugin-manager …
│       ├── plugin.js         # 后端插件（CJS）：数据库定义 + 路由 + 页面元数据注册
│       ├── index.html        # 页面：静态骨架 + #plugin-root 装载点 + /web/kernel.js 内核标签
│       ├── style.css
│       └── front/            # 前端插件（原生 ESM）
│           ├── plugin.js     # 插件入口：ctx.ui.register({ key, component })
│           └── view*.js      # 组件实现（可拆多文件）
├── web/                      # 前端内核
│   ├── kernel.mjs            # 内核入口（esbuild → dist/kernel.js，浏览器 ESM bundle）
│   ├── icons.mjs             # 共享图标基座（Tabler Icons 内置子集，icon / iconEl / ICON_NAMES）
│   ├── front.json            # 前端装配清单（enabled:false 的插件代码不下载）
│   └── dist/kernel.js        # 构建产物（gitignored，npm run build:web 生成）
├── resource/                 # ★ 运行数据（首次运行自动生成骨架）
│   ├── json/                 # 纯数据文件（音乐列表快照等）
│   ├── sqlite/               # SQLite 数据库（y-stage.sqlite，业务数据落盘处）
│   ├── images/               # 背景图等静态资源
│   └── musics/               # 音乐库（按组别分子目录，启动时自动扫描）
├── server/                   # ★ 服务端
│   ├── http/                 # y-router：自研路由器（替代 Express），路由表项可运行时热插拔
│   ├── cordis/               # cordis 插件内核：装配器 loader、内置服务、装配自检
│   ├── plugins.json          # 后端装配清单（enabled 开关；禁用即路由/页面 404，数据保留）
│   ├── module-loader.js      # 清单读取器 + 投影器
│   ├── paths.cjs             # 路径解析中枢（开发/便携双模式）
│   ├── sqlite-store.js       # SQLite 文档存储引擎（lowdb 兼容）
│   ├── database.js           # 数据库管理器（dbManager）
│   ├── music-scanner.js      # 音乐文件扫描
│   └── routes/               # 共享路由（模块页面 / 共享 API / 静态资源）
├── scripts/
│   ├── new-module.js         # 新模块脚手架（自动生成一对插件骨架并追加三份清单）
│   ├── make-portable.js      # 便携式打包（组装 YStage3-Portable/，可选 --zip）
│   └── endpoint-diff.js      # HTTP 行为基线录制/回放（重构回归关口）
├── server.js                 # 服务端主入口（npm start / node server.js）
├── build.bat                 # Windows 一键打包（构建 → 便携包 + zip）
├── install-deps.bat          # Windows 一键安装依赖
├── package.json              # 项目配置与依赖清单
└── .gitignore
```

需要了解的部分：

- **模块**：`modules/<id>/` 是一个自包含功能单元（一对插件：后端 `plugin.js` + 前端 `front/plugin.js`），配合三份清单（`modules/modules.json`、`server/plugins.json`、`web/front.json`）生效；新增功能无需改动共享代码

- **数据**：`resource/` 是全部运行数据所在，`resource/musics/` 下的各组目录即各曲库；首次运行由程序自动创建

- **自动生成的文件**（无需手动管理）：`server/cordis/kernel.cjs`（cordis 内核，`npm run build:kernel`）、`web/dist/kernel.js`（前端内核，`npm run build:web`）、`YStage3-Portable/`（打包产物）、`resource/sqlite/`（数据库）；均在 `.gitignore` 中

- **构建脚本**：开发者修改代码后运行 `npm run build` → `node scripts/make-portable.js`（或直接 `build.bat`）即可重新出包

***

## 技术架构

### 整体结构

服务端为**无框架的 Node 原生 http + 自研 y-router**（`server/http/`），入口 `server.js`；所有功能模块由 **cordis 插件内核**（`server/cordis/`）装配，启停/热重载即时生效：

- `server/http/`：y-router 路由器（路由表项运行时增删，插件卸载即物理移除其路由）+ Express 风格兼容垫片（`(req, res, next)` 中间件生态沿用：cors / body-parser / multer）

- `server/cordis/`：cordis@4.0.0-rc.9 插件内核（esbuild 打包为 CJS 内核），loader 按 `server/plugins.json` 装配各模块插件；`ctx.server / ctx.db / ctx.modules` 为内置服务

- `server/paths.cjs`：路径解析中枢，开发模式与便携模式（`Y_STAGE_PLUGINS_DIR` / `Y_STAGE_RESOURCE_DIR` 环境变量）共用一套代码

- `server/sqlite-store.js`：SQLite 文档存储引擎（sql.js WASM），对外暴露与 lowdb 兼容的读写接口

- `server/database.js`：`dbManager`，统一管理全部业务数据库，落盘 `resource/sqlite/y-stage.sqlite`

- `server/music-scanner.js`：启动时扫描 `resource/musics/` 并更新音乐列表

- `server/routes/`：共享路由分层（模块页面 `/m/:id`、共享 API、静态资源）

- 前端：每页加载 `/web/kernel.js`（cordis 浏览器内核 + `ctx.ui/api/state` 服务），页面内容由该模块的前端插件装配进 `#plugin-root`；`web/front.json` 控制前端插件启停（禁用的插件代码不下载）

### 模块化设计

每个功能 = `modules/` 下的**一对插件**，称为一个"模块"：

```
modules/<模块id>/
├── plugin.js           # 后端插件（CJS）
│                       #   ctx.db.define([...])                      数据库定义
│                       #   ctx.server.route((app, {dbManager,...})=>{}) 路由
│                       #   ctx.modules.registerPage({...})            页面元数据
├── index.html          # 页面：静态骨架 + #plugin-root + /web/kernel.js
├── style.css
└── front/              # 前端插件（原生 ESM，不经打包直接加载）
    ├── plugin.js       #   ctx.ui.register({ key, component })
    └── view*.js        #   组件实现（事件监听传 { signal }，组件返回 cleanup）
```

- 模块元数据声明在后端插件的 `registerPage`（与 `modules/modules.json` 条目逐字段一致）；`nav` 字段决定模块出现在哪个导航页（`index` / `select` / `games`）；导航由 `GET /api/modules` 动态渲染，新增模块无需改动共享代码

- 三份装配清单（`modules/modules.json` + `server/plugins.json` + `web/front.json`）是模块生效的唯一依据；`enabled:false` 即不挂载——后端路由与页面 404、前端代码不下载，SQLite 数据保留

- 模块后端路由被注入共享设施（`dbManager`、`serverLog`、`dataDir`），接口前缀建议包含模块 id（如 `/api/drag-...`），避免模块间冲突

- 页面地址统一为 `/m/<id>/`（唯一例外：`/` 与 `/m/home/` 同为首页）

- 生成脚手架：`node scripts/new-module.js my-feature "我的功能" [--server]`（自动追加三份清单条目）

- 插件管理页 `/m/plugin-manager/`（本身也是插件）：启停后端插件（即时热重载，请求排空保证在途请求安全完成）、编辑 config、前端插件开关（刷新后生效）；「主题插件」标签提供主题插件组视图（整组启停 / 设为系统主题）

- 主题以**主题插件组**交付：主题核心 = `modules/component-theme-<id>/` 组件类插件（`apply` 内注册 `theme:<id>` 组件，主题管理页按该前缀自动发现并渲染预览卡），成员组件按 `component-<id>-` 前缀自动归组（也可由核心条目 `group.members` 显式声明）；激活 = 注入样式 + 给 `<html>` 挂主题类，主题选择经 `PUT /api/theme/active`（id 经格式校验）与 localStorage 双写持久化；停用主题插件即回落默认皮肤，既有页面文件零改动

### 数据存储

- 业务数据保存在 **SQLite**：`resource/sqlite/y-stage.sqlite`（由 sql.js WASM 读写，服务端自动管理，无需安装数据库）

- `resource/json/` 仅存放纯数据文件（如音乐列表快照），`resource/musics/` 存放音乐文件（启动时自动扫描生成索引）

- 前端保存采用"本地 + 服务器"双写，单次请求失败也有兜底

### 运行机制细节

- **端口自动回退**：3000 被占用时自动尝试 3001、3002……（最多 10 次），实际端口打印在控制台

- **路径解码**：静态资源路由对请求路径做百分号解码，支持中文/日文文件名（如音乐文件）

- **音频分片**：支持 HTTP Range 分片响应，可流式播放与拖动进度

- **keep-alive 调优**：空闲超时调至 65 秒，避免页面长时间无操作后的保存请求被中止

- **API 相对路径**：前端统一使用 `/api/...`、`/resource/...`，部署到任意端口或环境无需修改代码

- **请求排空**：热重载插件时先停止接收该插件的新请求（短暂 503，带 Retry-After），等在途请求全部完成后才切换；比赛进行中的保存不会因热重载丢失

### 打包与发布

- **便携式打包**（bundle 形态，唯一分发形态）：`node scripts/make-portable.js`（`build.bat` = `npm run build` + 此脚本 `--zip`）组装 `YStage3-Portable/`——`node/`（复制构建机 Node 运行时）、`app/`（esbuild 单文件 `server.bundle.cjs` 含全部生产依赖 + 外置 `sql-wasm.wasm` + `web/` 整树静态（含 `icons.mjs` 等共享资产），**无 node_modules**）、`plugins/`（plugins.json / front.json / 全部模块代码，**可写、可热替换**）、`resource/`（现状数据）；目录内附 `说明.txt`；`--loose` 可产出源码调试形态

- 插件路径经 `Y_STAGE_PLUGINS_DIR`、数据路径经 `Y_STAGE_RESOURCE_DIR`、app 根经 `Y_STAGE_APP_ROOT` 环境变量注入：插件层与应用层分离，**清单与 config 的改动即时落盘、重启保持**；bundle 形态下外置插件参与真实模块缓存，管理页热重载改盘即生效

- 插件热替换：改 `plugins/` 下的文件 → `/m/plugin-manager/` 对该插件热重载（改盘即生效，无需重启）；新模块在 `plugins/plugins.json` 追加条目后重启

- GitHub Actions（`.github/workflows/package.yml`）：推送 `v*` 标签或手动触发即可自动构建，产出 `YStage3-Portable.zip` 工件并随 Release 发布

### 说明

- 前端统一使用 origin 相对路径（`/api/...`、`/resource/...`），未在代码中写死端口

- 音频走 HTTP Range 分片，支持流式播放与进度拖动

- 许可证：**AGPL-3.0**（详见 LICENSE；核心义务：若将修改后的版本作为网络服务提供，须向使用该服务的用户提供源码）

- 第三方资产：内置图标来自 **Tabler Icons**（MIT），来源、版本与许可全文见 `THIRD-PARTY-NOTICES.md`

***

## 常见问题

**问：双击 `启动YStage.bat` 后没有自动打开浏览器？**
答：手动访问终端里打印的地址（默认 <http://localhost:3000）。窗口是服务进程，关闭即停止服务。>

**问：没有** **`resource/`** **文件夹，程序能运行吗？**
答：能。首次运行会自动创建 `resource/` 及所需子目录，之后在网页界面导入选手、技能、音乐即可开始使用。

**问：报"端口被占用"怎么办？**
答：程序会自动改用下一空闲端口并在终端打印新地址，直接访问新地址即可。若连续多个端口均被占用，请关闭部分占用端口的程序后重试。

**问：数据存在哪里？如何备份？**
答：全部在 `resource/` 目录（SQLite 在 `resource/sqlite/`，音乐在 `resource/musics/`）。比赛前复制整个 `resource/` 文件夹即为完整备份。**重要比赛前请备份，并在备用电脑上跑一遍** **`t`** **自检。**

**问：音乐无法播放？**
答：将音乐放入 `resource/musics/` 对应组别目录（`1yearplus`、`1yearminus`、`1yearplus_ex`、`games_musics` 等），再到"音乐导入"页面导入，最后刷新页面。文件名建议避免特殊字符，格式建议 mp3 / wav。

**问：如何新增功能模块？**
答：运行 `node scripts/new-module.js <id> "名称"` 生成一对插件脚手架并自动追加三份清单条目；目录约定与插件规范详见 `AGENTS.md`。

**问：某个功能页面 404 了？**
答：可能该插件被停用了。到 `/m/plugin-manager/` 查看状态并重新启用即可；停用不影响已保存的数据。

**问：想换个界面风格？**
答：打开 `/m/theme-manager/` 选择主题（默认 / 霓虹），点「设为系统主题」后全场屏幕刷新生效；也可以在 `/m/plugin-manager/` 的「主题插件」标签整组启停主题。随时选回「默认主题」即恢复原生外观。

**问：可以部署到公网远程使用吗？**
答：不建议。系统面向本地比赛现场设计，远程访问可能导致数据保存异常，请仅在现场局域网使用。

***

## 联系方式

问题或建议请联系 2025 Y.Stage-X YUKAORI：

- QQ: 3664518772

- WOTA 艺 wiki: <https://wotagei.huijiwiki.com/>

> 如果遇到问题，请先备份 `resource/` 文件夹，再与我们联系。祝比赛顺利，享受音乐和荧光棒。

来自 team 异度沸腾【姬月由佳莉 / 姫月ユカリ】
