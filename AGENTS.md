# AGENTS.md — Y.Stage3 项目指南

## 0. 项目概述

WOTA艺（荧光棒舞蹈）对战平台。基于 **Node.js（内置 http + 自研 y-router）+ cordis 插件内核 + SQLite(sql.js)** 的多页面应用 (MPA)，无 Express 依赖（自研路由提供 Express 同面注册 API，(req,res,next) 风格中间件经兼容垫片沿用）。

**核心原则：万物皆插件。每个功能模块 = 一对插件（后端 `modules/<id>/plugin.js` + 前端 `modules/<id>/front/plugin.js`）+ 三份清单条目，独立页面形态不变（`/m/<id>/` 即开即用），双端同核（后端内核装配 HTTP/数据库/元数据，前端内核装配页面 UI）。**

- **后端**：Node 内置 http + y-router（`server/http/`），路由表项运行时增删（插件启停 = 路由物理热插拔）；插件内核 cordis@4.0.0-rc.9（精确锁定），装配清单 `server/plugins.json`。
- **前端**：每页一个内核标签 `<script type="module" src="/web/kernel.js">`，装配清单 `web/front.json`，页面 UI 由各模块的 `front/plugin.js` 组件装配进 `#plugin-root`。
- **导航/管理**：导航页按钮由 `GET /api/modules` 动态渲染；`/m/plugin-manager/` 提供插件启停/config 编辑/热重载。

---

## 1. 项目目录结构

```
Y.Stage3/
├── modules/                    # ★ 功能模块 = 一对插件 + 页面资产
│   ├── modules.json            # 页面元数据清单（19 条，单一显示名单来源）
│   ├── _template/              # 旧脚手架模板（仅历史参考；新模块用 scripts/new-module.js 生成）
│   ├── <模块id>/               # 页面模块：如 home / select / drag / plugin-manager ...
│   │   ├── plugin.js           # 后端插件（CJS）：db.define + server.route + modules.registerPage
│   │   ├── index.html          # 页面：静态骨架 DOM + #plugin-root + /web/kernel.js 内核标签
│   │   ├── style.css
│   │   └── front/
│   │       ├── plugin.js       # 前端插件（原生 ESM，不打包）：ctx.ui.register({ key, component })
│   │       └── view*.js        # 组件实现（可拆多文件，同目录相对 import）
│   └── component-<名>/         # ★ 组件类插件（L2，P11）：仅 front/{plugin,view}.js；无 index.html / 后端 plugin.js
│                               #   注册进 ctx.ui 组件表（非页面表），仅在 web/front.json 有条目（kind:component + pages）
├── web/
│   ├── kernel.mjs              # 前端内核入口（esbuild → dist/kernel.js，浏览器 ESM bundle）
│   ├── ui.mjs / api.mjs / state.mjs / loader.mjs   # 内置服务 + 装配清单纯逻辑（含 *.test.js）
│   ├── icons.mjs               # ★ 共享图标基座（Tabler 内联 SVG 子集；icon/iconEl/ICON_NAMES，含 icons.test.js）
│   ├── lib/                    # ★ L1 共享纯函数库（random / persist / undo，含 *.test.js）
│   ├── components/             # ★ L1 共享装配器与布局原语（compose.mjs + grid.css，含 compose.test.js）
│   ├── front.json              # ★ 前端装配清单（{ provider, plugins: [{ target, enabled, kind?, pages?, config? }] }）
│   └── dist/kernel.js          # 构建产物（gitignored，npm run build:web 生成）
├── server/
│   ├── plugins.json            # ★ 后端装配清单（{ provider, plugins: [{ target, enabled, config?, provides? }] }）
│   ├── http/                   # y-router HTTP 层（无 Express）
│   │   ├── index.js            # createApp()：listen 返回真 http.Server
│   │   ├── router.js           # 路由匹配 + per-plugin scope（createScope/removeScope 物理热插拔）
│   │   ├── shim.js             # req/res Express 兼容垫片（cors/body-parser/multer 沿用）
│   │   ├── static.js           # 静态服务（含 /web/kernel.js → web/dist/kernel.js 别名）
│   │   └── express-compat.js
│   ├── cordis/                 # 插件内核（cordis@4.0.0-rc.9，精确锁定）
│   │   ├── create-root.cjs     # 后端 root 打包入口（esbuild → kernel.cjs）
│   │   ├── kernel.cjs          # 构建产物（gitignored，npm run build:kernel 生成）
│   │   ├── loader.js           # 装配器：读 plugins.json → 分类 → 顺序挂载 + assembly 服务
│   │   ├── selfcheck.cjs       # 装配自检 A1-A6（node server.js --test-cordis）
│   │   └── services/           # 内置服务 ctx.server / ctx.db / ctx.modules（含 *.test.js）
│   ├── database.js             # dbManager + SQLite 文档存储（落盘 resource/sqlite/y-stage.sqlite）
│   ├── sqlite-store.js         # SQLite 存储引擎 + lowdb 兼容适配层
│   ├── module-loader.js        # modules.json 清单读取器 + 投影器（供 module-registry 兜底源与 selfcheck A3）
│   ├── module-registry.cjs     # /api/modules 元数据源开关（插件模式指向 ctx.modules）
│   ├── paths.cjs               # ★ 路径解析中枢（dev/portable 双模式；env 覆盖 plugins/resource 层）
│   ├── music-scanner.js        # 音乐文件扫描
│   ├── run-unit-tests.js       # 单测统一入口（16 个 *.test.js 子进程运行）
│   └── routes/                 # 共享路由（api / game / config / static / music / module-routes ...）
├── scripts/
│   ├── new-module.js           # ★ 模块脚手架（生成一对插件骨架 + 追加三份清单；--component 生成组件类插件）
│   ├── endpoint-diff.js        # HTTP 行为基线录制/回放（--record / --compare）
│   ├── make-portable.js        # ★ 便携式打包（默认 bundle 形态；--loose 源码形态；--zip 出压缩包）
│   └── endpoint-baseline.json  # 基线快照
├── resource/
│   ├── json/                   # 纯数据文件（选手、音乐列表快照等；非数据库）
│   ├── sqlite/                 # SQLite 数据库（y-stage.sqlite，业务数据落盘处，运行时生成）
│   ├── images/                 # 背景图等静态资源
│   └── musics/                 # 音乐库（扫描后自动生成 musics_list*.json 数据文件）
├── server.js                   # 服务端主入口
├── dist-server/                # 构建产物（gitignored，npm run build:server 生成的服务端 bundle）
├── build.bat                   # 一键打包：build:kernel → build:web → build:server → make-portable → YStage3-Portable/（+zip）
└── package.json
```

---

## 2. 历史：旧 MPA 平铺方案（已废弃）

早期方案是 `html/ css/ js/` 平铺多页面 + Express（模块经 `server/routes.js + server/db.js` 注册）。全面插件化改造后这些目录与单体备份文件（`drag.js`、`group_battle.js` 等）均已删除，legacy 跳转机制已移除。

**新功能一律按第 6 章插件契约开发**；旧约定中仍然有效的部分（State 模板、持久化双写、undo 快照栈、音乐抽取与比赛模式）保留在第 3 章——它们现在是前端插件组件内部的实现约定。

---

## 3. 通用功能实现参考（前端插件内的实现约定）

### 3.1 音乐随机抽取 + 比赛模式

所有赛制类模块的组件内实现这两个功能，参考 `modules/drag/front/view.js` 或 `modules/moving-sth/front/game.js`：

```js
let musicRolling = null;
let lastDrawnMusic = null;
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

// 双击退出比赛（监听记得传 { signal }，cleanup 里统一解绑）
document.addEventListener("dblclick", (e) => {
  if (battleActive) exitBattle();
}, { signal });
```

比赛模式隐藏 UI 的样式约定：`body.battle-mode .app-wrapper { display: none !important; }`。

### 3.2 持久化模式（双写：localStorage + server API）

**保存**：每次操作后调用 `saveState()`（localStorage + `POST /api/<模块前缀>-process` 双写）。
**恢复**：组件初始化时 `loadStateFromServer()` → 失败则 `loadLocalState()` → 都没有则 `initNewGame()`。
**重置**：`handleReset()` 清除 localStorage + 调用 clear API + 重建初始状态。

```js
const API_URL = "/api/<模块前缀>-process";        // origin 相对路径，勿写死 host
const API_CLEAR_URL = "/api/clear-<模块前缀>-process";

function saveState() {
  const data = getPersisted(); // 返回 State 的可序列化子集
  localStorage.setItem("<模块前缀>State", JSON.stringify(data));
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lastUpdate: new Date().toISOString() }),
  }).catch(() => {});
}
```

组件内也可用内核服务 `ctx.api.get/post/del`（自动 JSON 序列化、非 2xx 抛错带 status）。

### 3.3 State 定义模板

```js
const State = {
  playerSource: "player1",       // 选手来源
  allPlayers: [],                // 所有选手
  music: { oldList: [], newList: [], exList: [], current: null },
  musicSource: "old",            // 当前曲库
  battleKeepBg: true,            // 比赛模式保留背景
  phase: "playing",              // "playing" | "complete"
  undoStack: [],                 // 撤销栈
  // 你的自定义状态
};
```

初始化时序（组件体内执行，替代旧 `DOMContentLoaded`）：加载设置 → 绑定事件（`{ signal }`）→ `Promise.all([loadPlayers(), loadMusic()])` → 尝试恢复存档 → 渲染。

### 3.4 撤销 (Undo)

在每次改变状态前 push 快照到 `State.undoStack`，双击已操作的元素触发回滚。

---

## 4. 命名约定与图标规范

| 类别 | 规则 | 示例 |
|------|------|------|
| 模块目录 | 小写+连字符 | `modules/music-draw/` |
| 后端插件 | 固定名 `plugin.js`（CJS） | `modules/drag/plugin.js` |
| 前端插件 | 固定名 `front/plugin.js`（原生 ESM） | `modules/drag/front/plugin.js` |
| 前端组件 | `front/view*.js`（可拆多文件，同目录相对 import） | `modules/drag/front/view.js` |
| localStorage key | 功能+描述 | `dragBattleState2_player1` |
| API 端点 | `/api/{功能前缀}-{资源}` | `/api/drag-process` |
| 数据库名 | 与 API 对应（模块前缀） | `drag-process` |
| CSS class | 小写+连字符 | `.node-box`, `.state-pending` |
| HTML id | 小写+连字符 | `draw-music-btn` |
| JS 变量/函数 | camelCase | `drawMusic`, `State.allPlayers` |
| 清单条目 target | `modules/<模块id>` | `modules/music-draw` |
| 图标名 | 小写+连字符，必须是 `ICON_NAMES` 成员 | `home`, `device-gamepad-2` |

### 4.1 图标规范（唯一来源 `web/icons.mjs`）

全项目 UI 图标统一由 `web/icons.mjs` 提供：Tabler Icons 的**本地内置子集**（MIT，运行期零依赖、无 CDN、无网络请求，离线局域网可用），许可见根目录 `THIRD-PARTY-NOTICES.md`。

```js
import { icon, iconEl, ICON_NAMES } from "/web/icons.mjs";
// icon(name, { size = 20, class, stroke = 1.75, label })  → SVG 字符串；未知名字返回 ""
// iconEl(name, opts)                                      → 真实 SVGElement；无 DOM 环境或未知名字返回 null
// ICON_NAMES                                              → 已内置图标名（冻结数组，当前 61 枚，字典序）
```

```js
// ① 装饰性图标（旁边有文字）——不停用屏幕阅读器
btn.innerHTML = `${icon("plus", { size: 18 })}<span>新增选手</span>`;

// ② 图标即唯一语义——必须给 label
cell.append(iconEl("trash", { label: "删除该行" }));

// ③ 颜色跟随父元素（stroke="currentColor"，无需在 JS 指定颜色）
statusEl.innerHTML = icon("circle-check", { size: 16 }) + " 已保存";

// ④ 模块元数据（modules.json 与 plugin.js 两处必须一致，值为图标名而非 emoji）
ctx.modules.registerPage({ id: "my-feature", icon: "puzzle", ... });
```

- **禁止新增 emoji 图标**：新代码一律经 `icon()` / `iconEl()` 渲染线条 SVG，不再出现 emoji 表情当图标（含 CSS 伪元素 `content:"…"`——图标改由真实 DOM 节点承载）。
- **禁止各自内联复制 SVG path**：不得在模块内自建图标字典或粘贴 Tabler path（多份事实来源必然漂移）。
- **缺图标先补基座**：把准确的 Tabler path 追加进 `web/icons.mjs` 的 `ICON_PATHS`（自动并入 `ICON_NAMES`），再跑 `node web/icons.test.js` 守门（需求清单、SVG 规格、下游引用自检）。
- **`label` 语义**：图标是唯一语义来源（无相邻文字）时传 `label`（渲染 `role="img"` + `aria-label`）；有可见文字说明时留空（渲染 `aria-hidden="true"`，避免屏幕阅读器重复朗读）。

### 4.2 L1/L2 分层与组件体系（P11）

**分层准入**——判据是**有没有生命周期**（无生命周期 = L1，有 = L2）：

| 层 | 准入 | 落位 | 引入方式 |
|----|------|------|----------|
| L1 共享资产 | 纯函数/纯样式：无监听、无定时器、无网络、无模块级可变状态；必须配 `*.test.js`（可 node 单测） | `web/lib/*.mjs`、`web/components/compose.mjs`、`web/components/grid.css`（与 `web/icons.mjs` 同级） | 直接 `import`（origin 相对路径），**不注册插件、不进清单** |
| L2 组件类插件 | 有生命周期（监听/定时器/网络/多媒体）且被 **≥2 个页面**复用 | `modules/component-<名>/`：仅 `front/{plugin,view}.js`（可选 `style.css`），**无 `index.html`、无后端 `plugin.js`、不进导航** | 只在 `web/front.json` 有条目（`kind:"component"` + `pages`）→ 享受 `enabled:false` 禁用与热开关 |

**L1 资产清单**：

| 资产 | 导出 | 说明 |
|------|------|------|
| `/web/lib/random.mjs` | `shuffle(arr, rng?)` / `pickN(arr, n, rng?)` / `pickOne(arr, rng?)` | 等概率随机（Fisher–Yates），返回新数组、不改入参，`rng` 可注入做确定性测试；**全仓禁用 `sort(() => Math.random() - 0.5)` 有偏洗牌** |
| `/web/lib/persist.mjs` | `createPersistence(deps)` / `createMemoryStorage()` | §3.2 双写持久化的依赖注入实现（fetch/localStorage 由调用方注入，可 node 全流程单测） |
| `/web/lib/undo.mjs` | `createUndoStack(opts?)` / `MAX_HISTORY`（= 50） | §3.4 撤销快照栈（push/undo/peek/canUndo/size/clear/toArray/load），超上限丢最旧 |
| `/web/components/grid.css` | `.grid-cards` / `.grid-flow` / `.grid-split` / `.card` | 布局原语：**零媒体查询**，按容器宽度连续自适应（auto-fill 保卡片尺寸 / auto-fit 保铺满） |
| `/web/components/compose.mjs` | `mountFromConfig(spec)` | 页面组件装配器（消除"读 config → 查组件 → 挂 data-slot → 收集 cleanup"样板） |

**L2 组件表 API（`ctx.ui`）——与页面表分离的两张 Map**：

```js
ctx.ui.registerComponent(name, factory); // factory: (hostEl, props, ctx) => cleanup|void；同 name 后注册覆盖
ctx.ui.component(name);                  // → factory | null（未注册/非字符串名 → null，调用方据此降级）
ctx.ui.listComponents();                 // → string[]（插入序快照，调试/管理页/单测断言用）
```

页面表（`register({ key, component })`，key 必须 = 模块 id、由 kernel 按 URL 自动 render）与组件表**互不覆盖**：组件名永不被 kernel 自动渲染，只由页面 component 显式 `ctx.ui.component(name)` 实例化；本期无 `unregisterComponent`（组件生命周期 = 页面生命周期）。

**页面侧取用 `mountFromConfig`**（单实例参考 `modules/drag/front/plugin.js`，多实例参考 `modules/music-draw/front/plugin.js`）：

```js
import { mountFromConfig } from "/web/components/compose.mjs";

const mounted = mountFromConfig({
  el, meta, ctx,
  label: "my-feature",                  // 日志前缀（warn/error 消息带 [label]）
  defaultSlots: DEFAULT_SLOTS,          // 模块缺省插槽表（键 = 组件名；清单 config.slots 可覆盖/追加）
  runtimeProps: componentProps(bridge), // 可选：运行时 props（bridge 由组件 props.onReady 回填后消费）
  names: ["draw-machine"],              // 可选：只装配这些组件（[] = 本页零装配；缺省 = 全装）
});
// → { cleanups, mountAll(), cleanup() }：cleanup() 逆序卸载全部已实例化组件（单个抛错不影响其余）
```

`mountAll()` **非幂等**（构造时已自动执行一次）：重复调用会在同一宿主再建一个实例并追加 cleanup；旧的监听、`body` class 等副作用需先 `cleanup()` 释放，**切勿当作"重渲染"使用**。

`names` 带诊断：其中不存在于 compose/slots 推导结果的名字会逐条 warn `[<label>] names 中的组件 "<name>" 不在 compose/slots 中，已忽略` 并被忽略（不装配、也不查组件表）。`names: []` 是合法用法——本页零装配且零告警（movement-teaching 的记录页/设置页依赖此路径），缺省 `names` 与非数组畸形值均不过滤、零告警。

**`web/front.json` 页面条目 `config` 三键**（内核作为 `meta` 传给页面 component）：

| 键 | 值 | 语义 |
|----|----|------|
| `compose` | `["music-player","draw-machine"]` | 需要装配的组件名，**顺序 = 挂载顺序**；缺省 = `slots` 的键 |
| `slots` | `{ "<组件名>": "[data-slot=x]" \| ["sel1","sel2"] }` | 宿主选择器（**键是组件名**）；数组 = 多实例，按**下标一一对应**（如 music-draw 三曲库三实例） |
| `components` | `{ "<组件名>": { …props } \| [{ … }, …] }` | 组件静态 props（运行时 props 浅合并优先）；对象 = 各实例共用，数组 = 多实例按下标取 |

宿主查找顺序：`el.querySelector(selector) || document.querySelector(selector)`。

**优雅降级（不得崩）**：`ctx.ui.component(name)` 为 null（组件被 `enabled:false` 禁用或未注册）→ warn + 插槽留空，页面其余部分照常工作；槽位未声明、宿主不存在、选择器非法、`meta`/`slots`/`components` 畸形一律 warn 后跳过或按空表降级，**装配器自身的畸形输入一律降级不抛错**（组件工厂 `factory(host, props, ctx)` 自身抛错则**向上传播**、不吞，以免掩盖组件缺陷）。

**L2 清单语义**：`{ "target": "modules/component-<名>", "enabled": true, "kind": "component", "pages": ["<模块id>", …] }`

- `kind:"component"` 是**服务端放行该目录资源的白名单依据**（`server/routes/module-routes.js` 的 `resolveComponentDir`：仅 `kind=component` 且 `enabled !== false` 的条目允许 `/m/component-*/**` 被静态服务，禁用即不服务）
- `pages` 决定被哪些页面加载（`web/loader.mjs` 的 `matchPage`）；无 `pages` 则只匹配 target 自身 id
- 组件目录**不进** `modules/modules.json` / `server/plugins.json`、不进导航
- 组件自带 `style.css` 属**可选兜底外观**（组件不自带 `<link>`）：需要组件独立外观、或宿主页无对应 CSS 时，由页面显式引入 `<link rel="stylesheet" href="/m/component-<名>/style.css">`；未引入不影响功能——组件与页面共用既有类名（如 `battle-overlay` / `rolling` / `selected`），现有 8 个接入页的外观均由各自页面 CSS 提供

**组件纪律（P11 实战教训，违反必致缺陷）**：

1. 所有监听传 `{ signal }`（AbortController），cleanup 里 `abort()` 一次解绑；定时器/interval 统一登记后全部清除。
2. `document.body` 的 class 必须**成对增删**——组件可能被中途卸载，残留 class 会污染后续页面；同页多实例共享 body 类时用引用计数，最后一个退出者才移除。
3. **禁模块级可变状态**——多实例串台根因（音乐播放器 P0 缺陷）；状态只存在于工厂调用局部。
4. 宿主页既有 `<audio>` 只 pause/归零/摘 `onended`，**绝不删除**；只回滚本实例写入的改动。
5. `[data-slot]` 宿主必须置于 `opacity:0` 祖先之外（否则比赛模式播放器不可见）。
6. `config` 只放静态值（时序/颜色/文案），运行时 props 优先。
7. 组件不得 import 其他组件——跨插件 import 会让「单独禁用」变成「级联崩溃」。

**脚手架（组件模式）**：`node scripts/new-module.js <组件id> "<名称>" --component [--pages a,b]`——组件 id 自动补 `component-` 前缀，只生成 `front/{plugin,view}.js` 与 `web/front.json` 的 kind/pages 条目（`--server` 与 `--component` 互斥）。

**已接入组件体系的 8 个页面**（统一 `import { mountFromConfig } from "/web/components/compose.mjs"`）：battle-group1 / battle-group1-2 / battle-group2 / battle-group2-2 / drag / music-draw / group-battle / movement-teaching。现有 L2 组件：`modules/component-music-player`（组件名 `music-player`，9 处音乐播放 + 比赛模式归一）、`modules/component-draw-machine`（组件名 `draw-machine`，抽签动画归一）。

### 4.3 响应式资产（P11-R1）：细粒度状态 → DOM 同步

**定位**：状态驱动的管理/表单/列表页用响应式消除"手动把状态刷进 DOM"的样板（搜索输入不再丢焦点、列表增删改不再 innerHTML 全量重建）；**动画 / audio / 计时器驱动的赛制页（battle-group 系、drag、group-battle、music-draw 及两个 L2 组件）保持命令式，禁止引入**。

| 资产 | 说明 |
|------|------|
| `/web/lib/reactive.mjs` | L1 封装：`loadReactive()`（动态 import，按需加载）/ `createReactiveScope(init)`（reactive 状态）/ `mountReactiveSafe(host, { template, scope })` → 同步 cleanup（幂等 + 晚到守卫：卸载先于异步挂载完成时自动取消） |
| `/web/lib/vendor/petite-vue.mjs` | **构建产物**（gitignored）：`npm run vendor:petite-vue` 从锁定的 devDependency（petite-vue 0.4.1，MIT）经 esbuild 生成；运行期本地静态文件 + 按需动态 import，未用响应式的页面零下载 |

**契约与纪律**：

1. 页面组件保持**同步返回 cleanup** 的内核契约——`mountReactiveSafe` 立即返回可用的 dispose；勿在组件体内 `await` 挂载后再返回。
2. 状态变更后 DOM 更新排在**微任务**里：测试/脚本里断言 DOM 必须先过异步边界（`await` 一个宏任务），同步读取必然读到旧值。
3. node 单测**永不加载 vendor**（其含 `document.currentScript` 自动初始化语句）——经 `mountReactiveSafe` 的 `deps` 参数注入 fake；见 `web/lib/reactive.test.js`（9 例）。
4. **CSP 约束**：petite-vue 模板表达式经 `new Function` 编译——若将来为本站启用 CSP `script-src`，需整体换用无 eval 方案（如 preact + htm）。
5. L1 纪律同 §5-1：改 `reactive.mjs` 须同步 `reactive.test.js` 并复跑两关口。

**已接入**：plugin-manager（整页视图，644 → ~420 行，删保焦机器）、setting（三个列表编辑器 v-for 化）。新增接入页走 `createReactiveScope` + 挂载模板三件套，参照上述两页。

---

## 5. 注意事项

1. **不要修改内核与共享设施**（`web/kernel.mjs`、`web/ui.mjs`、`web/lib/`（random / persist / undo）、`web/components/`（grid.css、compose.mjs）、`server/http/`、`server/cordis/`、`server/database.js` 等）。新增功能一律自包含于 `modules/<id>/`；**唯一例外**是缺图标时向 `web/icons.mjs` 追加准确 path（见 4.1，改后跑 `web/icons.test.js`）。
   **L1 资产：可 import ≠ 可随手改**——`web/lib/*.mjs`、`web/components/compose.mjs`、`web/components/grid.css` 与 `web/icons.mjs` 向所有模块开放 import（准入见 4.2），但它们是 8 个以上模块的共同依赖面：改动 `web/lib/*.mjs` / `compose.mjs` 必须同步其同名 `*.test.js`，且一律复跑 `node server/run-unit-tests.js` 与 `node scripts/endpoint-diff.js --compare`（不重录直绿）后才算完成。
2. **前端 API 一律使用 origin 相对路径**（`/api/...`、`/resource/...`、`/web/...`），兼容任意部署环境（本地、预览代理、生产同域）；不要写死 `http://localhost:3000`（服务端代码内部仍可用 `process.env.PORT`）。
3. **★ 三份清单同步追加铁律**：新模块必须同时在 `modules/modules.json`、`server/plugins.json`、`web/front.json` 追加条目（脚手架自动完成）。漏 `plugins.json` → 后端不挂载（路由/页面 404）；漏 `front.json` → 前端不装配（页面渲染占位）。`enabled:false` = 不挂载但 SQLite 数据保留；未列出 = 不挂载。
4. **构建产物 gitignored，克隆/新环境需先构建**：`server/cordis/kernel.cjs`、`web/dist/kernel.js`、`dist-server/server.bundle.cjs` 分别由 `npm run build:kernel`、`npm run build:web`、`npm run build:server` 生成；分发打包走 `build.bat`（= build + `node scripts/make-portable.js --zip`，产出 bundle 形态便携目录 `YStage3-Portable/`；pkg 单文件 exe 已于 P6b 退役）。
5. **Server 端业务数据存储在 `resource/sqlite/y-stage.sqlite`**（SQLite 单文件，sql.js WASM 支撑），经 `dbManager` 读写，不需要手动编辑；插件内用 `ctx.db.get/define/sql/exists` 访问。`resource/json/` 仅存放纯数据文件（如 `musics_list_2.json`、`games_musics.json`、`musics_free.json`、`tricks_for_game.json`）。
6. **Windows 环境下路径用正斜杠 `/`**，与 Web 标准一致。
7. **模块一律通过 `/m/<id>/` 访问**（无尾斜杠会 302 补齐，保证页面内相对资源解析正确）；唯一例外是 home：`/` 与 `/index.html` 同样服务首页，前端内核将两者归一为 home 模块装配
8. **`node_modules/` 已在 `.gitignore` 中**，不要提交。

---

## 6. ★ 插件化开发指南（新功能 / 新页面唯一途径）

> **添加一个功能 = 添加一对插件 + 三份清单条目，不需要修改任何共享文件。**

### 6.1 模块插件契约（目录形态）

```
modules/<模块id>/
├── plugin.js          # 后端插件（CJS，必须）：module.exports = { name, inject, apply(ctx) }
├── index.html         # 页面（必须）：静态骨架 DOM + #plugin-root + /web/kernel.js
├── style.css          # 样式（可选，页面同目录相对引用）
└── front/
    ├── plugin.js      # 前端插件（原生 ESM，必须）：export default { name, inject, apply(ctx) }
    └── view*.js       # 组件实现（可拆多文件，同目录相对 import）
```

后端 `inject` 白名单：`server` / `db` / `modules` / `assembly`，以及清单条目 `provides` 声明的服务（插件间依赖）。前端 `inject` 白名单：`ui` / `api` / `state`。**inject 拼写错误会让 fiber 永久挂起（装配死锁）**，内核在挂载前校验，非法服务名直接跳过该插件并在 `/api/plugins` 报 error。

### 6.2 后端插件契约 `modules/<id>/plugin.js`

```js
module.exports = {
  name: "my-feature",
  inject: ["db", "server", "modules"],        // 纯前端模块可仅 ["modules"]
  apply(ctx) {
    // ---- 数据库定义（SQLite 文档存储，落盘 resource/sqlite/y-stage.sqlite） ----
    ctx.db.define([
      { name: "my-feature-process", defaultValue: { phase: "idle" } },
    ]);                                       // ctx.db 还有 get(name) / sql(q, p) / exists(name)

    // ---- 路由注册（必须在 apply 同步窗口内调用；scope 生命周期 = 本插件 fiber，
    //      管理页停用该插件时路由被物理移除、立即 404） ----
    ctx.server.route((app, { dbManager, serverLog, dataDir }) => {
      app.get("/api/my-feature/ping", (req, res) => res.json({ ok: true }));
      // (req,res,next) 风格与 Express 一致；中间件（multer 等）沿用
    });

    // ---- 页面元数据（必须与 modules/modules.json 中本模块条目逐字段一致） ----
    ctx.modules.registerPage({
      id: "my-feature",
      name: "我的功能",
      description: "一句话说明",
      icon: "puzzle",                           // 图标名，须 ∈ web/icons.mjs 的 ICON_NAMES（见 4.1）
      nav: ["select"],                          // "index" / "select" / "games"，空数组不显示
      order: 50,                                // 导航排序（小在前）
    });

    // 插件卸载时同步注销页面元数据
    ctx.effect(() => () => ctx.modules.unregister("my-feature"));
  },
};
```

页面元数据的单一来源是 `modules/modules.json`（导航页与管理页的显示名单），`registerPage` 是其运行时声明处，两处必须逐字段一致。其中 `icon` 是**图标名字符串**（取自 `web/icons.mjs` 的 `ICON_NAMES`，如 `puzzle`），不是 emoji——详见 4.1 图标规范。

### 6.3 前端插件契约 `modules/<id>/front/plugin.js`

```js
// 原生 ESM，浏览器直接 import（URL: /m/<id>/front/plugin.js），
// 不要 import 内核或 Node 模块；apply 阶段只 register，DOM 操作统一在 component 内。
export default {
  name: "my-feature-front",
  inject: ["ui", "api"],                       // 白名单 ui / api / state
  apply(ctx) {
    ctx.ui.register({
      key: "my-feature",                       // ★ 必须 = 模块 id（内核按 /m/<id>/ 路径查组件）
      component(el, meta, ctx) {               // el = #plugin-root；meta = front.json 条目 config（无则 null）
        const controller = new AbortController();
        const { signal } = controller;

        el.innerHTML = `<section class="my-feature-page">...</section>`;
        el.querySelector("button").addEventListener("click", onClick, { signal });

        return () => controller.abort();       // cleanup：内核重渲染/卸载前调用
      },
    });
  },
};
```

页面 UI 的图标统一 import 共享基座（origin 相对路径，不经打包）：

```js
import { icon, iconEl } from "/web/icons.mjs";

// ① 装饰性图标（旁边有文字）——不停用屏幕阅读器
btn.innerHTML = `${icon("plus", { size: 18 })}<span>新增选手</span>`;

// ② 图标即唯一语义——必须给 label
cell.append(iconEl("trash", { label: "删除该行" }));

// ③ 颜色跟随父元素（stroke="currentColor"，无需在 JS 指定颜色）
statusEl.innerHTML = icon("circle-check", { size: 16 }) + " 已保存";
```

完整约定（禁 emoji、禁内联复制 SVG path、缺图标补基座、`label` 语义）见 4.1 图标规范。

**组件类插件（L2，P11）**——跨页复用的、**有生命周期**的 UI 能力（抽签动画/音乐播放等）做成组件类插件，注册进**组件表**而非页面表；准入、装配器与组件纪律见 4.2：

```js
// modules/component-<名>/front/plugin.js —— 无 index.html / 后端 plugin.js，仅 front/{plugin,view}.js
import { createMyWidget } from "./view.js";

export default {
  name: "component-my-widget",
  inject: ["ui"],
  apply(ctx) {
    ctx.ui.registerComponent("my-widget", createMyWidget); // factory(hostEl, props, ctx) => cleanup|void
  },
};
```

与页面插件的差异：页面插件用 `register({ key, component })`（key 必须 = 模块 id，kernel 按 URL 自动 render）；组件类插件用 `registerComponent(name, factory)`，**组件名永不被 kernel 自动 render**，只在页面 component 显式取用时实例化。清单只在 `web/front.json` 追加 `{ kind:"component", pages:[…] }`。

前端内核服务：`ctx.ui`（页面表 register/unregister/render + 组件表 registerComponent/component/listComponents）、`ctx.api`（get/post/del，origin 相对路径）、`ctx.state`（跨插件内存键值，`set` 时广播 `state:changed` 事件，`ctx.on` 订阅）。

页面 `index.html` 只需最小骨架（也可像 `modules/drag/` 一样放置静态骨架 DOM 由组件复用；多页面模块如 `moving-sth` 每页都有内核标签，组件内按 DOM 标记分发）：

```html
<body>
  <!-- 页面内容（可选静态骨架） -->
  <div id="plugin-root" hidden></div>
  <script type="module" src="/web/kernel.js"></script>
</body>
```

`enabled:false` 的前端条目不 import、代码不下载（效果等同不注入 script）。

### 6.4 三份装配清单（单一装配事实来源）

| 清单 | 作用 | 条目格式 |
|------|------|----------|
| `modules/modules.json` | 页面元数据（导航/管理页显示名单） | `{ id, name, description, icon, nav, order }`（`icon` = `ICON_NAMES` 中的图标名） |
| `server/plugins.json` | 后端装配（provider: y-router/sqlite） | `{ target: "modules/<id>", enabled, config?, provides? }` |
| `web/front.json` | 前端装配（provider: dom） | 页面模块 `{ target: "modules/<id>", enabled, config? }`；组件类插件追加 `kind: "component"`（服务端放行 `/m/component-*/**` 的白名单依据）与 `pages: ["<模块id>", …]`（决定被哪些页面加载，缺省只匹配 target 自身 id） |

语义：`enabled:false` 不挂载（后端路由/页面 404、前端代码不下载，SQLite 数据保留）；未列出 = 不挂载；`config` 作为插件配置传入（后端为 `apply(ctx, config)` 第二参，前端为组件 `meta`）。新模块**三份都要追加**——直接用脚手架，别手改。组件类插件**只进 `web/front.json`**（不进 `modules.json` / `plugins.json`、不进导航，见 4.2）。

### 6.5 三步创建一个新模块

1. **脚手架**（自动生成一对插件骨架并追加三份清单，条目已存在则跳过并提示）：

   ```cmd
   node scripts/new-module.js my-feature "我的功能"                                    :: 页面模块（纯前端）
   node scripts/new-module.js my-feature "我的功能" --server                           :: 页面模块 + db.define / server.route 模板
   node scripts/new-module.js my-widget "我的组件" --component --pages drag,music-draw :: 组件类插件（L2，见 4.2）
   ```

2. **填充逻辑**：编辑 `front/plugin.js`（/ `front/view.js`）写页面 UI；需要后端时编辑 `plugin.js`（改 `inject` 为 `["db","server","modules"]`，参照 6.2 注释模板）。页面内资源用**同目录相对路径**（`style.css`、`front/...`），共享资源用**绝对路径**（`/resource/...`、`/api/...`、`/web/...`）。组件模式只生成 `front/{plugin,view}.js` 与 `web/front.json` 条目（不生成 `index.html` / `style.css` / 后端 `plugin.js`），页面侧用 `mountFromConfig` 取用（见 4.2）。

3. **验证**：重启 `node server.js` → 日志出现 `[cordis] 装配完成` → 访问 `/m/my-feature/`；打开 `/m/plugin-manager/` 确认插件已列出且已挂载；跑 `node scripts/endpoint-diff.js --compare` 确认未破坏 HTTP 行为基线。

### 6.6 插件管理页 `/m/plugin-manager/`

本身就是插件。列表展示双端全部条目（kind / enabled / mounted / config / error）；操作生效时机：

| API | 作用 | 生效时机 |
|-----|------|----------|
| `GET /api/plugins` | 装配快照（后端条目 + 前端条目） | — |
| `POST /api/plugins/:id/toggle` | 启用/禁用后端插件 | 即时（挂载/路由物理 404） |
| `POST /api/plugins/:id/reload` | 热重载（排空 → 逐出缓存 → 重挂） | 即时（真实文件改盘即生效，无需重启） |
| `GET / POST /api/plugins/:id/config` | 读/写清单 config（写后热重装） | 即时 |
| `POST /api/plugins/front/:id/toggle` | 前端插件开关 | 刷新页面后生效 |

> 排空语义（P6a）：toggle / reload / config 写触发的卸载一律先停新——排空期命中该插件路由的请求立即 503 `{"error":"plugin <id> is reloading"}` + `Retry-After: 1`，等在飞请求完成后才 dispose 重挂（disable 则排空后路由物理移除、后续 404 为正确语义）；排空超时默认 15s（环境变量 `Y_STAGE_DRAIN_TIMEOUT_MS` 可覆盖），超时 warn 后强制继续卸载。

### 6.7 导航如何工作

- `GET /api/modules` 返回全部启用模块清单（含 `id/name/description/icon/nav/order/route`，`route` 为 `/m/<id>/`）。
- `home`、`select`、`games` 三个导航页（本身也是模块）前端 `fetch` 该接口**动态渲染按钮**。
- 新增/修改模块只需动三份清单 + 模块文件夹，导航零代码改动。

### 6.8 模块开发检查单

- [ ] `plugin.js` 契约正确：CJS 导出 `{ name, inject, apply }`；路由在 apply 同步窗口内经 `ctx.server.route` 注册
- [ ] `inject` 全部在白名单内（后端 `server/db/modules/assembly` + 清单 `provides`；前端 `ui/api/state`）
- [ ] 三份清单条目已同步追加（`modules.json` + `plugins.json` + `front.json`，字段与 `registerPage` 逐字段一致）
- [ ] `registerPage` / `modules.json` 的 `icon` 为 `web/icons.mjs` 的 `ICON_NAMES` 成员；页面图标一律 `icon()` / `iconEl()`，无 emoji、无内联复制 SVG path（见 4.1）
- [ ] 前端插件 `key` = 模块 id；事件监听传 `{ signal }`，组件返回 cleanup
- [ ] 组件类插件（如适用）：仅 `web/front.json` 有条目（`kind:"component"` + `pages`），无 `index.html` / 后端 `plugin.js` / `modules.json` 条目；组件名 kebab-case，工厂签名 `(hostEl, props, ctx) => cleanup`
- [ ] 组件纪律（见 4.2）：监听带 `{ signal }`、`body` class 成对增删、无模块级可变状态、不 import 其他组件、`config` 只放静态值
- [ ] 页面组件装配走 `mountFromConfig`；手动禁用某组件插件后复验「插槽留空、页面照常工作」（降级不崩）
- [ ] 后端路由全部经 `app.get/post(...)` 带路径前缀注册（**禁止 `scope.use(fn)` 无路径中间件**——热重载排空按路径模式拦截，pathless 层无锚点）
- [ ] 重启后 `/m/plugin-manager/` 可见本插件且「已挂载」无 error
- [ ] `node scripts/endpoint-diff.js --compare` 不破坏既有 HTTP 行为基线

---

## 7. 验证与测试

| 命令 | 用途 |
|------|------|
| `node server.js --test` | 数据库操作回归测试（6 项，结果输出在控制台） |
| `node server.js --test-cordis` | cordis 装配自检 A1-A6（装配零错误/数据库基线/元数据投影/探针插件/inject 白名单/manager 管理链路），测完自动退出 |
| `node server/run-unit-tests.js` | 单元测试统一入口（16 个 `*.test.js`：server 侧 9 个 = utils 1 + paths 1 + http 层 4 + cordis services 3；web 侧 7 个 = loader / icons / ui + lib 的 random / persist / undo + components/compose） |
| `node scripts/endpoint-diff.js --record` | 在当前服务上录制端点行为基线（35 用例 → `scripts/endpoint-baseline.json`；仅行为有意变更时重录，其余场合 --compare 必须不重录直绿） |
| `node scripts/endpoint-diff.js --compare` | 起服后重放用例逐字节对比基线，全绿退出码 0（HTTP 层改动的合并关口） |

---

## 8. 便携式打包与插件热替换（P6b 引入，P7 起默认 bundle 形态）

**pkg 单文件 exe 已退役**（Vercel 停维护 + 快照虚拟文件系统导致清单不可写）；分发形态为便携目录，应用核心以 **esbuild 单文件 bundle** 交付（`app/` 内无 node_modules）。dev 源码模式完全不变（`node server.js` 跑源码树）。

### 8.1 便携布局与构建

```
YStage3-Portable/
├── node/node.exe        # 运行时（复制构建机 process.execPath，免安装 Node）
├── app/                 # 应用程序核心（bundle 形态，无 node_modules）
│   ├── server.bundle.cjs      # 应用 + 全部生产依赖的 esbuild 单文件（含 kernel.cjs 内容）
│   ├── server.bundle.cjs.map  # sourcemap（外置，可删）
│   ├── sql-wasm.wasm          # 唯一外置二进制资产（SQLite 引擎用）
│   ├── web/                   # 前端静态整树复制（dist/ 内核产物 + icons.mjs 等共享资产；排除 *.test.js 与 front.json）
│   └── favicon.ico
├── plugins/             # ★ 插件组件层（可写、可热替换）
│   ├── plugins.json     # 后端装配清单（真实文件，toggle/config 即时落盘）
│   ├── front.json       # 前端装配清单
│   └── modules/<id>/…   # 全部模块
├── resource/            # 数据层：sqlite/、musics/、json/、images/
├── 启动YStage.bat       # 注入 env → app 目录 → ..\node\node.exe server.bundle.cjs
└── 说明.txt
```

构建：`build.bat`（= `npm install` + `npm run build`（含 `build:server`）+ `node scripts/make-portable.js --zip`）。产物目录整体拷走即用；升级 = 替换 `app/`，`plugins/` 与 `resource/` 原地保留。

- `npm run build:server`：`esbuild server.js --bundle --platform=node --format=cjs --sourcemap=external --outfile=dist-server/server.bundle.cjs`（不 minify）。bundle 内唯一动态 require 是 loader 的外置插件加载（运行期绝对路径，esbuild 原样保留为原生 require）→ 外置插件参与真实 `require.cache`，reload 语义不变。
- `node scripts/make-portable.js --loose`：调试用旧形态——app/ 放全源码树 + node_modules（排除顶层 devDeps），以 `server.js` 启动。

### 8.2 dev/portable 双模式（server/paths.cjs）

| 路径 | dev 默认（不设 env） | portable（启动 bat 注入 env） |
|------|----------------------|-------------------------------|
| 后端清单 | `<根>/server/plugins.json` | `$Y_STAGE_PLUGINS_DIR/plugins.json` |
| 前端清单 | `<根>/web/front.json` | `$Y_STAGE_PLUGINS_DIR/front.json` |
| 模块目录 | `<根>/modules/` | `$Y_STAGE_PLUGINS_DIR/modules/` |
| 数据层 | `<根>/resource/` | `$Y_STAGE_RESOURCE_DIR/` |
| app 根 | `__dirname` 推导（`<根>`） | `$Y_STAGE_APP_ROOT`（bundle 形态 bat 注入 `app/`） |

`Y_STAGE_PLUGINS_DIR` / `Y_STAGE_RESOURCE_DIR` 任一设置即进入便携布局；dev 默认值与历史布局逐字节一致（`server/paths.test.js` 铁门用例锁定）。wasm 定位候选：`Y_STAGE_SQL_WASM` env → `<app根>/sql-wasm.wasm`（bundle）→ `<app根>/node_modules/sql.js/dist/`（dev）。

### 8.3 插件热替换三步

1. 直接修改 `plugins/` 下的文件（改 `modules/<id>/plugin.js` 逻辑、增删模块目录）；
2. 打开 `/m/plugin-manager/` 对该插件**热重载**（排空在飞 → require 缓存逐出 → 重挂，改盘即生效无需重启）；bundle 形态下外置插件参与真实模块缓存，语义与源码形态一致；已列模块的启停用 toggle，新模块先在 `plugins.json` 追加条目再重启；
3. 清单与 config 的全部改动即时落盘 `plugins/*.json`，重启后保持。
