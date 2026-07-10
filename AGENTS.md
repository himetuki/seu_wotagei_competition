# AGENTS.md — Y.Stage3 项目指南

## 0. 项目概述

WOTA艺（荧光棒舞蹈）对战平台。基于 **HTML + CSS + JS + Node.js(Express) + lowdb** 的多页面应用 (MPA)。

**核心原则：每个新功能 = 独立的 HTML 文件 + 对应的复数 JS 模块 + 对应的 CSS 文件，即插即用。**

---

## 1. 项目目录结构

```
Y.Stage3/
├── html/                    # 所有 HTML 页面
│   ├── index.html           # 主页
│   ├── select.html          # 赛制选择页（导航枢纽）
│   ├── setting.html         # 全局设置（选手/技能/奖励管理）
│   └── games/               # 小游戏子目录
├── css/                     # 所有 CSS 样式（与 HTML 一一对应）
├── js/                      # 所有 JS 逻辑
│   ├── gb_common.js         # 3人团体赛共用工具（纯函数、Toast、动画）
│   └── bg1/                 # battle-group1 子模块目录
├── resource/
│   ├── json/                # 数据文件（选手、音乐、赛程状态）
│   └── images/              # 背景图等静态资源
├── server/                  # Node.js 后端
│   ├── server.js            # Express 主入口
│   ├── database.js          # lowdb 数据库定义
│   ├── music-scanner.js     # 音乐文件扫描
│   └── routes/
│       └── game-routes.js   # 所有 API 路由（POST/GET 进度、设置）
├── node_modules/
├── package.json
├── build.bat                # 构建脚本
├── install-deps.bat         # 依赖安装脚本
└── .gitignore
```

---

## 2. 添加新模式 / 新功能的完整步骤

### 2.1 创建 HTML 页面

在 `html/` 下新建 `新功能名.html`。

标准 HTML 骨架：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>新功能名称</title>
    <link rel="stylesheet" href="../css/新功能.css" />
  </head>
  <body>
    <!-- 错误状态条 -->
    <div id="error-bar" class="error-bar hidden">
      <span id="error-msg"></span>
    </div>

    <div class="app-wrapper">
      <!-- 顶部控制栏 -->
      <header class="control-bar">
        <h1>新功能名称</h1>
        <div class="header-right">
          <!-- 选手组切换按钮（如需） -->
          <div class="source-switch">
            <button id="switch-player1-btn" class="source-btn active">加组</button>
            <button id="switch-player2-btn" class="source-btn">内组</button>
          </div>
          <!-- 曲库切换 -->
          <div class="source-switch">
            <button id="switch-music-old-btn" class="source-btn active">1year+</button>
            <button id="switch-music-new-btn" class="source-btn">1year-</button>
            <button id="switch-music-ex-btn" class="source-btn">1year+EX</button>
          </div>
          <span class="round-label" id="round-label">第1轮</span>
          <button id="shuffle-btn" class="ctrl-btn">随机</button>
          <button id="reset-game-btn" class="ctrl-btn">重置</button>
          <button id="setting-btn" class="ctrl-btn">设置</button>
          <button id="home-btn" class="ctrl-btn">主页</button>
        </div>
      </header>

      <!-- 主内容区域（根据功能自定义） -->
      <div id="main-area" class="main-area">
        <!-- 你的核心 UI 在这里 -->
      </div>

      <!-- 音乐控制栏 -->
      <div class="music-bar">
        <div class="music-info">
          <span class="music-label">当前音乐</span>
          <span id="music-display" class="music-display">—</span>
        </div>
        <div class="music-actions">
          <button id="draw-music-btn" class="draw-music-btn">抽取音乐</button>
          <button id="start-battle-btn" class="start-battle-btn" disabled>开始比赛</button>
        </div>
      </div>

      <!-- 底部状态栏 -->
      <footer class="status-bar">
        <span id="status-hint">就绪</span>
      </footer>
    </div>

    <!-- 隐藏音乐播放器 -->
    <audio id="music-player" preload="none"></audio>

    <!-- JS 模块（按依赖顺序加载） -->
    <script src="../js/新功能_main.js"></script>
    <script src="../js/新功能_data.js"></script>
    <script src="../js/新功能_battle.js"></script>
    <script src="../js/新功能_render.js"></script>
    <script src="../js/新功能_persist.js"></script>
  </body>
</html>
```

### 2.2 创建 JS 模块（模块化拆分方案）

按功能拆分为多个文件，**按依赖顺序**在 HTML 中加载：

| 加载顺序 | 文件命名 | 职责 |
|----------|----------|------|
| 1 | `xxx_main.js` | 全局 State 定义、DOM 缓存、`DOMContentLoaded` 初始化、事件绑定、工具函数 |
| 2 | `xxx_data.js` | 加载选手/数据（fetch JSON）、加载音乐列表、加载设置 |
| 3 | `xxx_battle.js` | 核心比赛/游戏逻辑、音乐抽取、比赛模式（battle mode） |
| 4 | `xxx_render.js` | 所有 DOM 渲染函数、状态更新 |
| 5 | `xxx_persist.js` | 撤销(undo)、重置(reset)、localStorage 存取、server API 同步 |

**简单功能**可以合并为单文件。复杂功能（如团体赛）可进一步拆分为 `_match.js`（匹配）、`_drag.js`（拖拽）等。

**如果有共用逻辑**，提取到独立文件（参考 `gb_common.js`），在需要它的 HTML 中优先加载。

#### State 定义模板

```js
const State = {
  playerSource: "player1",       // 选手来源
  allPlayers: [],                // 所有选手
  music: {
    oldList: [], newList: [], exList: [],
    current: null,
  },
  musicSource: "old",            // 当前曲库
  battleKeepBg: true,            // 比赛模式保留背景
  phase: "playing",              // "playing" | "complete"
  undoStack: [],                 // 撤销栈
  // 你的自定义状态
};
```

#### 初始化模板

```js
document.addEventListener("DOMContentLoaded", () => {
  // 1. 加载设置
  const keepBg = localStorage.getItem("xxxBattleKeepBg");
  if (keepBg !== null) State.battleKeepBg = keepBg !== "false";

  // 2. 绑定事件
  document.getElementById("shuffle-btn").addEventListener("click", shufflePlayers);
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("home-btn").addEventListener("click",
    () => { window.location.href = "../html/index.html"; });
  document.getElementById("setting-btn").addEventListener("click",
    () => { window.location.href = "../html/setting.html"; });
  document.getElementById("draw-music-btn").addEventListener("click", drawMusic);
  document.getElementById("start-battle-btn").addEventListener("click", startBattle);

  // 3. 加载数据 → 尝试恢复存档 → 渲染
  Promise.all([loadPlayers(), loadMusic()])
    .then(() => {
      loadLocalState();   // 尝试从 localStorage 恢复
      if (State.nodes.length === 0) initNewGame();
      renderAll();
    });
});
```

### 2.3 创建 CSS 文件

在 `css/` 下新建 `新功能.css`。参考现有的 `drag.css` 或 `group_battle.css`，核心样式：

- `body`: 背景图 (`background-image: url("../resource/images/bg.jpg")`)
- `.control-bar` / `.header-right` / `.ctrl-btn`: 顶部控制栏
- `.music-bar` / `.draw-music-btn` / `.start-battle-btn`: 音乐控制栏
- `.status-bar`: 底部状态提示
- `body.battle-mode .app-wrapper { display: none !important; }`: 比赛模式隐藏 UI
- 响应式 `@media (max-width: 900px)`

### 2.4 注册导航入口（三个页面都需要）

根据用户目标，在以下三个页面中添加进入新功能的按钮：

#### select.html（赛制选择页）

在 `html/select.html` 中添加按钮：

```html
<button class="nav-btn 新功能-btn">新功能名称</button>
```

在 `js/select.js` 中添加跳转逻辑：

```js
document.querySelector(".新功能-btn").addEventListener("click", () => {
  window.location.href = "../html/新功能.html";
});
```

#### index.html（主页）

在 `html/index.html` 中添加按钮：

```html
<button class="feature-btn" onclick="location.href='html/新功能.html'">新功能名称</button>
```

或参照 `js/index.js` 的现有模式添加事件监听。

#### setting.html（设置页）

如果是全局功能（跨赛制），在 `html/setting.html` 中添加入口按钮，并在 `js/set-core.js` 绑定跳转。

**注意**：三个页面的导航按钮**不是全部必须添加**，根据功能性质判断：
- 赛制类 → `select.html`
- 工具/辅助类 → `index.html` 或 `setting.html`
- 全局通用 → 三个都加

### 2.5 添加设置项（如需）

在 `html/setting.html` 中添加对应的设置控件，使用 `localStorage` 存储，key 命名规则为 `功能前缀+设置名`，如 `dragTotalCount`、`dragDoubleElim`。

在 `js/set-core.js` 中添加 DOM 绑定、事件监听、初始化读取。

### 2.6 添加 Server API（如需持久化）

在 `server/database.js` 中注册新数据库：

```js
{ name: "新功能-process",  defaultValue: { phase: "idle", ... } },
{ name: "新功能-settings", defaultValue: { totalCount: 8 } },
```

在 `server/routes/game-routes.js` 中添加路由：

```js
// ========== 新功能 ==========
app.post("/api/新功能-process", (req, res) => {
  getDB("新功能-process").setState({ ...req.body, lastUpdate: new Date().toISOString() }).write();
  res.status(200).send("保存成功");
});

app.get("/api/新功能-process", (req, res) => {
  res.json(getDB("新功能-process").getState());
});

app.post("/api/clear-新功能-process", (req, res) => {
  getDB("新功能-process").setState({ phase: "idle", ... }).write();
  res.status(200).send("清除成功");
});

app.get("/api/新功能-settings", (req, res) => {
  res.json(getDB("新功能-settings").getState());
});

app.post("/api/新功能-settings", (req, res) => {
  getDB("新功能-settings").setState({ ...req.body }).write();
  res.status(200).send("保存成功");
});
```

前端 JS 中使用：

```js
const API_URL = "http://localhost:3000/api/新功能-process";
const API_CLEAR_URL = "http://localhost:3000/api/clear-新功能-process";

function getPersisted() { /* 返回 State 的可序列化子集 */ }

function saveState() {
  const data = getPersisted();
  localStorage.setItem("新功能State", JSON.stringify(data));
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lastUpdate: new Date().toISOString() }),
  }).catch(() => {});
}

function loadLocalState() {
  const raw = localStorage.getItem("新功能State");
  if (raw) restoreState(JSON.parse(raw));
}

function loadStateFromServer() {
  return fetch(API_URL)
    .then(r => r.json())
    .then(data => {
      if (data && data.nodes && data.nodes.length > 0) {
        restoreState(data);
        return true;
      }
      return false;
    }).catch(() => false);
}
```

### 2.7 数据文件

如需加载静态数据（选手列表、音乐列表等），将 JSON 文件放在 `resource/json/` 下：

- `player1.json` / `player2.json` — 选手名单（格式: `[{ "name": "选手名" }]`）
- `musics_list.json` / `musics_list_2.json` / `musics_list_ex.json` — 音乐列表

---

## 3. 通用功能实现参考

### 3.1 音乐随机抽取 + 比赛模式

所有赛制页面都需要这两个功能，参考 `drag_music.js` 或 `group_battle_battle.js`：

```js
let musicRolling = null;
let lastDrawnMusic = null;
let lastDrawnMusicSource = null;
let battleActive = false;

function drawMusic() {
  // 随机滚动 40 ticks（~2秒）后停在一个随机结果上
  // 结束后启用"开始比赛"按钮
}

function startBattle() {
  // 播放 lastDrawnMusic → 进入 battle mode:
  //   document.body.classList.add("battle-mode")
  // 音乐结束 → exitBattle()
}

function exitBattle() {
  // 移除 battle-mode → 恢复 UI
}

// 双击退出比赛
document.addEventListener("dblclick", (e) => {
  if (battleActive) exitBattle();
});
```

### 3.2 持久化模式

**保存**：每次操作后调用 `saveState()`

**恢复**：页面加载时 `loadStateFromServer()` → 失败则 `loadLocalState()` → 都没有则 `initNewGame()`

**重置**：`handleReset()` 清除 localStorage + 调用 server clear API + 重建初始状态

### 3.3 撤销 (Undo)

在每次改变状态前 push 快照到 `State.undoStack`，双击已操作的元素触发回滚。

---

## 4. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| HTML 文件 | 小写+下划线 | `group_battle.html` |
| CSS 文件 | 与 HTML 同名 | `group_battle.css` |
| JS 模块 | `{功能前缀}_{模块职责}.js` | `group_battle_render.js` |
| JS 单体备份 | 与 HTML 同名 | `drag.js`（完整版，不加载，仅备份） |
| localStorage key | 功能+描述 | `dragBattleState2_player1` |
| API 端点 | `/api/{功能前缀}-{资源}` | `/api/drag-process` |
| 数据库名 | 与 API 对应 | `drag-process` |
| CSS class | 小写+连字符 | `.node-box`, `.state-pending` |
| HTML id | 小写+连字符 | `draw-music-btn` |
| JS 变量/函数 | camelCase | `drawMusic`, `State.allPlayers` |

---

## 5. 注意事项

1. **不要修改已存在的共用文件**（如 `gb_common.js`、`select.html`）除非必要。新增功能尽量自包含。
2. **API 使用 `http://localhost:3000`** 作为 base URL，生产环境需替换。
3. **`node_modules/` 已在 `.gitignore` 中**，不要提交。
4. **`drag.js`、`group_battle.js` 等单体文件是旧版备份**，实际加载的是拆分后的模块。修改时两边都要同步。
5. **Server 端数据存储在 `resource/json/` 下**（lowdb 生成的 JSON 文件），不需要手动编辑。
6. **Windows 环境下路径用正斜杠 `/`**，与 Web 标准一致。
