# AGENTS.md — Y.Stage3 项目指南

## 0. 项目概述

WOTA艺（荧光棒舞蹈）对战平台。基于 **Node.js（内置 http + 自研 y-router）+ cordis 插件内核 + SQLite(sql.js)** 的多页面应用 (MPA)，无 Express 依赖（自研路由提供 Express 同面注册 API，(req,res,next) 风格中间件经兼容垫片沿用）。

**核心原则：万物皆插件。每个功能模块 = 一对插件（后端 `modules/<id>/plugin.js` + 前端 `modules/<id>/front/plugin.js`）+ 三份清单条目，独立页面形态不变（`/m/<id>/` 即开即用），双端同核（后端内核装配 HTTP/数据库/元数据，前端内核装配页面 UI）。**

- **后端**：Node 内置 http + y-router（`server/http/`），路由表项运行时增删（插件启停 = 路由物理热插拔）；插件内核 cordis@4.0.0-rc.9（精确锁定），装配清单 `server/plugins.json`。
- **前端**：每页一个内核标签 `<script type="module" src="/web/kernel.js">`，装配清单 `web/front.json`，页面 UI 由各模块的 `front/plugin.js` 组件装配进 `#plugin-root`。
- **导航/管理**：导航页按钮由 `GET /api/modules` 动态渲染；`/m/plugin-manager/` 提供插件启停/config 编辑/热重载。
- **可视化编排（P14/P15）**：`/m/game-composer/` 拖积木式编排 L2 组件并连组件间数据/事件线，生成新游戏模式（布局存 SQLite），`/m/custom-stage/?layout=<id>` 即取即运行——无代码扩展赛制，见 4.4。

---

## 1. 项目目录结构

```
Y.Stage3/
├── modules/                    # ★ 功能模块 = 一对插件 + 页面资产
│   ├── modules.json            # 页面元数据清单（22 条，单一显示名单来源）
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
│   ├── lib/                    # ★ L1 共享纯函数库（random / persist / undo / reactive / timers / body-class，含 *.test.js）
│   ├── components/             # ★ L1 共享装配器与布局原语（compose.mjs + grid.css，含 compose.test.js）
│   ├── front.json              # ★ 前端装配清单（{ provider, plugins: [{ target, enabled, kind?, pages?, config?, label?, group? }] }）
│   └── dist/kernel.js          # 构建产物（gitignored，npm run build:web 生成）
├── server/
│   ├── plugins.json            # ★ 后端装配清单（{ provider, plugins: [{ target, enabled, config?, provides?, label? }] }）
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
│   ├── run-unit-tests.js       # 单测统一入口（19 个 *.test.js 子进程运行）
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
// ICON_NAMES                                              → 已内置图标名（冻结数组，当前 65 枚，字典序）
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
| `/web/lib/timers.mjs` | `createTimerRegistry(deps?)` | 一次性定时器登记表：`later(fn, ms)` 登记即跟踪、回调执行后自动出表；`dispose()` 后 `later` 返回 null（卸载后迟到登记安全拒绝）；setTimeout/clearTimeout 可注入做假时钟测试。组件纪律第 1 条「定时器统一登记」的承载工具 |
| `/web/lib/body-class.mjs` | `createBodyClassRef({ className })` | body class 引用计数：`acquire()` 计数 0→1 加类、`release()` 归零摘类（多实例共享时最后一个退出者才移除）；document 可注入 fake。组件纪律第 2 条的承载工具 |
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

**已接入组件体系的 10 个页面**（统一 `import { mountFromConfig } from "/web/components/compose.mjs"`），分两种装配模式：

- **front.json 静态 config（8 页）**：battle-group1 / battle-group1-2 / battle-group2 / battle-group2-2 / drag / music-draw / group-battle / movement-teaching——`compose`/`slots`/`components` 写死在清单条目 `config` 里，改配置需改 `web/front.json`。
- **运行时动态布局装配（P14，2 页）**：game-composer（编辑器预览）/ custom-stage（组合舞台运行台）——config 由用户保存的布局 JSON 经 `layoutToConfig` 换算而来（见 4.4），调 `mountFromConfig({ el, meta, ctx, label })` 时不传 `defaultSlots` / `runtimeProps`，插槽 DOM 由页面按 items 顺序现建（`[data-slot=<item.id>]`）。

现有 8 个 L2 组件：`modules/component-music-player`（组件名 `music-player`，9 处音乐播放 + 比赛模式归一）、`modules/component-draw-machine`（`draw-machine`，抽签动画归一）、`modules/component-toast`（`toast`，轻提示服务）、`modules/component-confirm-dialog`（`confirm-dialog`，确认对话框服务）、`modules/component-player-list`（`player-list`，选手名单勾选，P14）、`modules/component-score-board`（`score-board`，多队计分，P14）、`modules/component-countdown`（`countdown`，mm:ss 倒计时，P14）、`modules/component-music-source`（`music-source`，曲库数据源，P16：拉取 music-library 曲库并经 `getList` 输出口供数据连线）。P14 起新增的四个均以「零 props 可渲染」为准入（title / source / teams / minutes / group 等 props 全部可选并收敛到合法值），pages 只含 `["game-composer","custom-stage"]`；toast / confirm-dialog 属**服务类组件**（不排布进布局，页面直接 `factory(document.body, { onReady })` 常驻实例化收 API，缺失时降级 console / window.confirm）。

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

**已接入**：plugin-manager（整页视图，644 → ~420 行，删保焦机器）、setting（三个列表编辑器 v-for 化）、game-composer（P14 编排编辑器三栏视图）。新增接入页走 `createReactiveScope` + 挂载模板三件套，参照上述页面。

### 4.4 可视化编排体系（P14，P15 增组件连线）：布局驱动的动态组件拼装

一句话：用户在 `/m/game-composer/` 把 L2 组件拖成有序布局、连出组件间数据/事件线（存 SQLite），`/m/custom-stage/?layout=<id>` 按该布局现建插槽 + `mountFromConfig` 挂真组件并注入连线运行——**新增一个赛制 = 保存一份布局 JSON，不写代码**。

**布局 JSON schema**（存于 `game-composer-layouts` 文档存储，落盘 SQLite）：

```js
{
  id: "ly-a1b2c3d4",              // 服务端生成："ly-" + 8 位 hex
  name: "双人对战练习台",           // 1..40 字符（trim 后）
  updatedAt: "2026-09-28T00:00:00.000Z",  // 服务端 ISO（POST/PUT 时刷新）
  items: [                         // 0..40 项，顺序 = 挂载与展示顺序
    { id: "it-1-4f2a",             // 实例 uid（可缺省=渲染跳过；给出时须 /^[a-zA-Z][a-zA-Z0-9_-]*$/、≤64 字符、布局内唯一——选择器 [data-slot=<id>] 不加引号拼接）
      component: "score-board",    // 组件名，/^[a-z][a-z0-9-]*$/
      title: "上半场",              // 可选：卡片头标题（非空时并入该实例 props）
      props: { teams: [{ name: "红方" }] } },  // 可选：普通对象（非数组）
  ],
  connections: [                   // P15 可选，缺省 = []（v1 布局完全兼容）；0..20 条，见下「组件连线」
    { id: "cn-1-a3f2b1",           // 可缺省，后端补 "cn-" + 6 位 hex
      from: "it-3-c2d4e5",         // 来源实例 id + 输出口（out 不以 on 开头 = 数据线）
      out: "getSelected",
      to: "it-4-d5e6f7", in: "items" },  // 目标实例 id + 输入口
  ],
}
```

**API 四端点**（`modules/game-composer/plugin.js`，校验失败 400 `{"error":"..."}`）：

| 端点 | 行为 |
|------|------|
| `GET /api/game-composer/layouts` | → `{ list: Layout[] }`（无单条端点，取单条也走全量按 id 查） |
| `POST /api/game-composer/layouts` | 新建（服务端生成 id + updatedAt）→ 201 `{ layout }` |
| `PUT /api/game-composer/layouts/:id` | 整体替换 name/items/connections → 200 `{ layout }`；未知 id → 404 |
| `DELETE /api/game-composer/layouts/:id` | → 200 `{ ok: true }`；未知 id → 404 |

**`layoutToConfig` 换算语义**（Layout → `mountFromConfig` 的 `meta`；编辑器与 custom-stage **各自内置同语义实现**——跨插件 import 禁止，勿提共享文件）：

- `compose` 按组件名**去重保首现序**（compose.mjs 对同名组件会整组挂载其全部 slots，不去重会重复挂载）；
- `slots` / `components` 按组件名分组、**组内保持 items 出现顺序**（数组形态 = 多实例下标一一对应）：`slots[name] = ["[data-slot=<item.id>]", …]`，`components[name] = [{ ...(title), ...props }, …]`；
- 缺 `component` 的项静默跳过；缺 `id` 的项跳过并 warn（否则生成 `[data-slot=undefined]` 死插槽）——预览建 DOM 与换算共用同一 `stageItems` 过滤，宿主与选择器一一对应。

**custom-stage 运行链路**（`?layout=` 深链 / 列表 / 空态三视图，切布局 = 链接跳转整页重载，不做 SPA 内切换）：

- 无参 → 布局卡片列表（`/api/game-composer/layouts` 全量 + `.grid-cards`），空列表给「去可视化编排」引导链；
- `?layout=<id>` → 全量列表按 id 查找 → 运行台：头部（布局名 + 更换布局 + 「编辑此布局」回链 `/m/game-composer/?layout=<id>`）+ 按 items 顺序建 `.stage-slot` 宿主再 `mountFromConfig`（经 `runtimeProps` 注入连线，见下）；找不到（已删除）→ 提示 + 返回列表；
- 页面零持久化（各组件自管内存态）；fetch 失败 → 错误行 + 重试，不白屏。

**编辑器特性**（game-composer，petite-vue 三栏：palette / 画布 / 属性）：

- palette 名单 = `ctx.ui.listComponents()` 实时快照 + `PALETTE_META` 中文名表（`modules/game-composer/front/layout.mjs`；未收录的组件名兜底显示原名，标「高级」的是需运行时数据、一般不宜直接排布的组件）；
- 画布卡片支持上移 / 下移 / 删除；属性面板编辑 `title`（文本）+ `props`（JSON 对象，失焦或点「应用」时解析，失败就地报错并保持旧值）；
- 预览**即挂即卸**：切进预览态现建插槽 DOM → `mountFromConfig({ meta: layoutToConfig(...), runtimeProps: buildRuntimeProps(...) })` 真挂组件 + 注入连线（状态仅内存）；退出前必须先 `mounted.cleanup()`——`mountAll()` 非幂等，重进预览一律重新挂载；
- dirty 切换守卫：未保存时新建/切换布局先确认，`beforeunload` 提示；「在组合舞台打开」深链 `/m/custom-stage/?layout=<id>`（需先保存）；自身也接受 `?layout=<id>` 预载（供 custom-stage 回链编辑）。

**组件连线（P15）：connections schema 与校验**（随布局整包 POST/PUT，违例 400 `{"error":"..."}`）：

- 每条连线只保留 `id / from / out / to / in` **五键**（多余键丢弃）；`connections` ≤ **20** 条，缺省视为 `[]`（v1 布局完全兼容）；
- `from` / `to`：非空字符串 ≤ 64 字符（item id 形态）；`out` / `in`：`/^[a-zA-Z][a-zA-Z0-9]*$/` 且 ≤ 40 字符，**不得为保留名 `onReady`**（连线注入的 api 注册钩子，占用会使该实例数据连线静默失效——后端 400 拒绝新建，两处运行时对存量数据 warn 跳过）；`id` 可缺省（后端补 `"cn-" + 6 位 hex`），给出时宽松保留；
- 后端**不校验** from/out/to/in 与 items 组件能力的匹配——宽松存储，编辑器负责引导（词汇表）、运行时负责降级（warn 跳过）。

**连线类型判定与运行时注入**（无 type 字段，`out` 是否以 `"on"` 开头是**运行时唯一依据**）：

- **事件连线**（out 以 `on` 开头，如 `onResult` / `onDrawn`）：注入 **from** 实例的 `props[out]` 回调，触发时调 **to** 实例的 `api[in](...args)`（如 抽签定格 → `play(item)` 立即播放）；
- **数据连线**（其余，如 `getSelected` / `getScores` / `getResult`）：注入 **to** 实例的 `props[in]` **惰性函数**，调用时取 **from** 实例的 `api[out]()` 返回值，`undefined` 兜底 `[]`（draw-machine / music-player 的 `items` prop 本就接受 `Array | () => Array` 惰性求值）；
- 注入经 `mountFromConfig` 的 `runtimeProps`：`buildRuntimeProps(layout, apis, warn)` 构造，返回 `组件名 → props 数组`（**下标 = 组内实例序**，与 `layoutToConfig` 的 slots 一一对齐）；`apis` 以 **item.id** 为键、由注入的 `onReady` 在挂载过程**同步回填**（`mountFromConfig` 构造内即完成 mountAll，返回时已齐），连线函数在用户交互时才惰性查表——分组挂载顺序不影响取值。运行时 props 浅合并优先 → 连线覆盖布局 JSON 同名静态 prop（预期行为）；
- 同一 (实例, prop) 被多条连线注入 → 后者覆盖前者并 warn 一条（编辑器拦截建重复，此处兜底直写 API 的存量数据）；
- **悬挂连线不级联删**：编辑器删除实例不连带删其连线（避免静默改数据），连线列表透明显示「实例已删除」；运行时对坏引用（from/to 不在 items、out/in 非字符串、项非对象）warn 后跳过，不影响其余连线；事件触发时目标 api 无该方法 → warn 忽略，动作执行抛错 console.error 不中断；
- game-composer（预览）与 custom-stage **各自内置**同语义 `buildRuntimeProps`（禁跨插件 import 共享，同 `layoutToConfig` 的镜像纪律）。

**编辑器连线 UI**（属性面板内「连线」区，选中项属性下方、未选中亦可见）：连线列表 `来源实例 · out 标签 → 目标实例 · in 标签` + 删除按钮，「事件」/「数据」徽标按 out 前缀判定；新增表单 from → out → to → in **四下拉联动**（out/in 选项 = 所选实例组件的 `PALETTE_META.outs/ins` 词汇表，实例切换时词汇不兼容项清空），四项齐才可提交；重复拦截：事件同 (from, out) / 数据同 (to, in) 的目标 prop 已被占用 → 提示不建；连线编辑计入 dirty，随布局整包保存；预览经 `buildRuntimeProps` 真注入，预览条连线数只统计两端可解析的连线并标注「N 条悬挂已跳过」。词汇表只是**编辑器 UI 引导、非运行时依赖**——custom-stage 不 import `PALETTE_META`，运行时只认连线 JSON 的原始字符串、宽松降级；未收录词汇表的组件选不到口子（无法经表单建线），但既有连线照常显示/运行。

**组件 api 连线口**（词汇表即下列能力的引导名）：

| 组件 | outs（输出） | ins（输入） |
|------|--------------|-------------|
| music-source | `getList`（数据，当前组曲库 `[{name,folder}]`，name 含扩展名供播放） | — |
| player-list | `getSelected`（数据，已选名单 string[]） | — |
| score-board | `getScores`（数据，`[{name,score}]`） | — |
| countdown | — | — |
| draw-machine | `onResult`（事件，抽签定格）、`getResult`（数据，当前结果） | `items`（数据，候选池） |
| music-player | `onDrawn`（事件，抽取定格） | `items`（数据，候选池）、`play`（动作，播放曲目） |

music-source（P16）是**数据源组件**：经 music-library 的 `GET /api/music_files?group=<组别>` 拉取（组别 `1yearplus` / `1yearplus_ex` / `1yearminus` / `games_musics` 可切换，回收站 `musics_free` 不入选择器），把「曲库列表（数据）」连到 draw-machine / music-player 的「候选池」即可免手写 `props.items`。

music-player 的 `play(item)` 为 P15 新增 api（`item ? setItem(item) : 不变; return start()`——可选设置曲目并立即进入播放），纯新增方法、既有消费页零影响；toast / confirm-dialog 属服务类组件，词汇表为空数组（不参与连线）。

**默认触发按钮语义（undefined vs null，勿改错）**：draw-machine 在 props **完全不提** `trigger`（undefined，如编排零 props 排布）时自建「抽取」按钮 + 默认展示 `span`（display 缺省指向宿主自身，textContent 覆写会抹掉按钮，故一并自建专用子节点）；music-player 在**完全不提** `trigger` / `startTrigger` 时自建「抽取音乐」「播放」默认控制条。**显式传 `null` = 刻意钉空不建**（调用方接管按钮分工），传选择器/元素 = 绑定既有按钮。battle-group1 / 1-2 / 2 / 2-2 与 group-battle 三页已在 P15 补 `trigger: null` 钉空（group-battle 连 `startTrigger` 一并钉空；drag / music-draw 原本即传 null 防同按钮双跑动画）——**新页面若不想要默认按钮必须显式传 `null`，不能省略不写**。

**扩展指引——新增一个可编排组件**（在 4.2 L2 组件基础上）：

1. L2 组件三步照旧：`node scripts/new-module.js <组件id> "<名称>" --component --pages game-composer,custom-stage` → 实现 factory（**全部 props 可选并收敛到合法值，零 props 必须能渲染**）→ `web/front.json` 条目（脚手架已生成）；
2. `modules/game-composer/front/layout.mjs` 的 `PALETTE_META` 补一行中文名/描述，并**同步补 `outs` / `ins` 连线词汇表**（P15，`[{name,label}]` 数组；无连线能力/服务类组件为空数组；不补中文名则 palette 显示原始组件名，不补 outs/ins 则连线表单选不到该组件的口子）；
3. 验证：编辑器 palette 可见可添加 → 预览真挂载 → 保存后 custom-stage 深链可运行；有连线口的组件在编辑器建一条线 → 预览验证联动 → custom-stage 复验；手动禁用该组件插件后复验「插槽留空、页面照常」（降级不崩）。

### 4.5 主题系统与插件组（2026-09-30）：主题 = 插件组，可切换、可自建

一句话：**主题是插件组**（主题核心组件 + 若干成员组件），激活状态系统级存储（SQLite `theme-store`），切换全场屏幕刷新生效；既有页面文件零改动——非激活主题对页面零影响，激活主题经 CSS 覆盖 + 结构增强注入换肤。

**主题插件契约**（自建主题照此实现，会被自动发现）：

1. 目录 `modules/component-theme-<id>/`（仅 front/{plugin,view}.js + 主题样式等静态资产，无 index.html / 后端 plugin.js），`web/front.json` 条目 `{ target, enabled, kind:"component", label?, group?, pages:[…全部生效页面…] }`；
2. apply 内 `ctx.ui.registerComponent("theme:<id>", factory)`——factory 渲染主题管理页的主题预览卡（props.active = 是否当前主题）；
3. 自带激活逻辑（参照 `modules/component-theme-neon/front/plugin.js`）：注入自己的样式表、给 `<html>` 挂主题类、标注 `<html data-page>`；`localStorage["ystage:theme"]` 同步初判（防首屏闪默认）+ `GET /api/theme/active` 异步对账（服务端不一致 → 按服务端翻转或整页 reload）；
4. 比赛演出守卫：`body.battle-mode` 期间隐藏全部主题氛围层，只留背景图；`prefers-reduced-motion: reduce` 全量停用装饰动画；
5. 主题之间互不 import（组件纪律）；禁用主题插件 = 主题从管理页消失、页面回落默认皮肤。

**主题管理页 `/m/theme-manager/`**（`modules/theme-manager`，nav 为空不进导航；入口 = 插件管理页「主题插件」tab 组卡「管理」链接 + 直链）：后端 `GET/PUT /api/theme/active`（PUT 校验 `/^[a-z][a-z0-9-]{0,39}$/`，落盘 db `theme-store`）；前端枚举 `ctx.ui.listComponents()` 中 `theme:` 前缀组件自动渲染主题卡（默认主题卡为页面内置），「设为系统主题」双写服务端 + localStorage 后刷新；页内附自建指南。

**插件管理页「主题插件」tab = 插件组视图**：默认主题虚拟组卡 + 每主题一张组卡（组名 = 核心条目 `group.name` 声明，缺省 gid；「已启用 x / 共 y」；当前主题徽标）。组级控件：设为系统主题（激活组禁用）/ 启用整组 / 禁用整组（**串行**逐个 front toggle + `groupBusy` 锁防并发写清单；失败点名未生效条目）。成员行（「主题核心」/「组件成员」）可**只开组内某些组件**。成员归属 = `component-<gid>-` 命名约定**最长前缀**自动发现 ∪ 核心条目 `group.members` 显式并集。既有页面的「回主页」等站内跳转一律 origin 相对路径（`/m/home`），禁写 `index.html` 相对跳转（旧 MPA 遗留会原地打转）。

**现状**：neon 主题（`component-theme-neon` 核心 + `component-neon-penlights` 荧光棒人浪成员）已交付——WOTA live 会场 × 电竞 HUD 视觉（荧光棒人浪/舞台光束/网格地板/扫描线/跑马灯/标题流光/BATTLE START·VICTORY 全屏演出/结构增强注入复现样例版式），battle-group 系列按组别分色（加组荧绿/加组二章青/内组蓝/内组二章冰青）。

---

## 5. 注意事项

1. **不要修改内核与共享设施**（`web/kernel.mjs`、`web/ui.mjs`、`web/lib/`（random / persist / undo / reactive / timers / body-class）、`web/components/`（grid.css、compose.mjs）、`server/http/`、`server/cordis/`、`server/database.js` 等）。新增功能一律自包含于 `modules/<id>/`；**唯一例外**是缺图标时向 `web/icons.mjs` 追加准确 path（见 4.1，改后跑 `web/icons.test.js`）。
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
  <div id="plugin-root"></div>
  <script type="module" src="/web/kernel.js"></script>
</body>
```

注意 `#plugin-root` **默认可见（不带 `hidden`）**：内核只向它渲染、从不摘 `hidden` 属性——骨架若写 `hidden` 且组件不自行摘除，页面会一直白屏（脚手架模板已改为不带 `hidden`）。

`enabled:false` 的前端条目不 import、代码不下载（效果等同不注入 script）。

### 6.4 三份装配清单（单一装配事实来源）

| 清单 | 作用 | 条目格式 |
|------|------|----------|
| `modules/modules.json` | 页面元数据（导航/管理页显示名单） | `{ id, name, description, icon, nav, order }`（`icon` = `ICON_NAMES` 中的图标名） |
| `server/plugins.json` | 后端装配（provider: y-router/sqlite） | `{ target: "modules/<id>", enabled, config?, provides?, label? }` |
| `web/front.json` | 前端装配（provider: dom） | 页面模块 `{ target: "modules/<id>", enabled, config? }`；组件类插件追加 `kind: "component"`（服务端放行 `/m/component-*/**` 的白名单依据）与 `pages: ["<模块id>", …]`（决定被哪些页面加载，缺省只匹配 target 自身 id） |

**可选显示元数据（label / group）**：清单条目可带 `label`（中文显示名；纯英文 id 的插件应配，缺省回退 id/投影名）与主题组核心条目的 `group: { name, members? }`（组显示名 + 显式成员 id 数组——成员归属 = `component-<gid>-` 命名约定最长前缀自动发现 ∪ 显式 members 并集，约定能覆盖时 members 可省略）。loader 对未知字段透明（内核零改动）；`GET /api/plugins` 由 plugin-manager 后端读清单原文件把 label/group 补进快照（读取失败降级原始快照）；toggleFront 整包写回保留未知字段。已声明：10 个组件插件与 music-library 均有 label；component-theme-neon 带 `group:{name:"霓虹主题",members:["component-neon-penlights"]}`。

语义：`enabled:false` 不挂载（后端路由/页面 404、前端代码不下载，SQLite 数据保留）；未列出 = 不挂载；`config` 作为插件配置传入（后端为 `apply(ctx, config)` 第二参，前端为组件 `meta`）。新模块**三份都要追加**——直接用脚手架，别手改。组件类插件**只进 `web/front.json`**（不进 `modules.json` / `plugins.json`、不进导航，见 4.2）。

**纯后端功能件（P13）**：与 component-\* 对偶的形态——无页面、不进导航的后端功能插件，**只进 `server/plugins.json`**（不进 `modules.json` / `web/front.json`）。例：`modules/music-library`（音乐扫描/上传/回收，原 `server/music-scanner.js` + `server/routes/music-routes.js` 迁入）；setting 插件同时承载本页配置数据 API（/api/player1 等）。共享路由层 `server/routes/` 只保留通用基础设施（winners、data CRUD、静态/模块/测试路由），业务端点一律随页面插件。

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

本身就是插件。列表展示双端全部条目（kind / enabled / mounted / config / error）+ **「主题插件」tab（插件组视图：默认主题虚拟组卡 + 每主题组卡，组级整组启停/设为系统主题、成员级独立启停，条目显示清单 label 中文名，见 4.5）**；操作生效时机：

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
| `node server/run-unit-tests.js` | 单元测试统一入口（19 个 `*.test.js`：server 侧 9 个 = utils 1 + paths 1 + http 层 4 + cordis services 3；web 侧 10 个 = loader / icons / ui + lib 的 random / persist / undo / reactive / timers / body-class + components/compose） |
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
