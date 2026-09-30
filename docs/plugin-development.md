# 插件开发技术参考（Plugin Development Reference）

> 本文是插件开发的**完整技术参考**：API 签名、参数、数据结构、生命周期与错误语义。
> 入门教程见 [`docs/tutorial.md`](./tutorial.md)；架构总览见 `AGENTS.md`。
> 所有签名均与当前实现核对过；cordis 内核的实测 API 结论（K1-K17）收录在 `server/cordis/selfcheck.cjs` 头注释。

---

## 目录

1. [插件形态总览](#1-插件形态总览)
2. [后端插件 API](#2-后端插件-api)
3. [前端插件 API](#3-前端插件-api)
4. [结构参考](#4-结构参考)
5. [错误语义与边界](#5-错误语义与边界)
6. [工具链与验证](#6-工具链与验证)

---

## 1. 插件形态总览

### 1.1 目录结构（一个模块的全部文件）

```
modules/<模块id>/
├── plugin.js            # 后端插件（CommonJS，必须）
├── index.html           # 页面（必须）：静态骨架 + #plugin-root + 内核标签
├── style.css            # 样式（可选，页面同目录相对引用）
└── front/
    ├── plugin.js        # 前端插件（原生 ESM，必须）
    └── view*.js         # 组件实现（可选拆分，同目录相对 import）
```

加载方式：

| 文件 | 加载者 | 方式 |
|------|--------|------|
| `plugin.js` | 服务端 cordis loader | `require(磁盘绝对路径)`（参与真实 `require.cache`，热重载可逐出） |
| `index.html` / `style.css` | y-router 的 `/m/:id/*` 静态服务 | HTTP |
| `front/plugin.js` 及其 import 图 | 浏览器内核 loader | `import("/m/<id>/front/plugin.js")` 动态导入（`enabled:false` 不下载） |

### 1.2 导出形状对照

| | 后端 `plugin.js` | 前端 `front/plugin.js` |
|---|---|---|
| 模块格式 | CommonJS（`module.exports =`） | 原生 ESM（`export default`） |
| 必填字段 | `apply(ctx)` | `apply(ctx)` + 注册的 `key` |
| 可选字段 | `name`、`inject`、`Config` | `name`、`inject` |
| `inject` 白名单 | `server` `db` `modules` `assembly`（+ 清单 `provides` 声明） | `ui` `api` `state` |
| 运行环境 | Node（服务进程内） | 浏览器（页面内） |
| 不可 import | 不得绕过内核直接 require 服务端模块 | 不得 import 内核文件或 Node 模块 |

### 1.3 装配流程（谁在什么时候调用你）

**后端**：进程启动 → 读 `server/plugins.json` → 创建根 Context → provide 内置服务（`server/db/modules/assembly`，在任何业务插件挂载之前）→ 按清单顺序 `await ctx.plugin(wrapped)` → `initializeAllDatabases()` → 挂共享路由 → listen。

**前端**：页面加载 `/web/kernel.js` → 从 `location.pathname` 解析模块 id → `fetch("/web/front.json")` → 过滤 `enabled !== false` 且 target 匹配的条目 → 建前端 root、provide `ui/api/state` → 逐个 `await import(...)` + `ctx.plugin()` → 全部完成后 emit `kernel:ready` → 对当前模块 id 调 `ui.render`。

### 1.4 组件类插件形态（L2，P11）

组件类插件是**纯前端资产**：没有 `index.html`、没有后端 `plugin.js`，也不进 `modules/modules.json` / `server/plugins.json`、不进导航；只在 `web/front.json` 有一条 `kind:"component"` 条目。

```
modules/component-<名>/
├── front/
│   ├── plugin.js     # 组件注册（原生 ESM）：ctx.ui.registerComponent("<名>", factory)，inject 仅需 ["ui"]
│   └── view.js       # 组件工厂：factory(hostEl, props, ctx) => cleanup|void
└── style.css         # 可选；组件不自带 <link>，需要时由页面按 /m/component-<名>/style.css 引入
```

| | 页面插件 | 组件类插件 |
|---|---|---|
| 注册 API | `ctx.ui.register({ key, component })` | `ctx.ui.registerComponent(name, factory)` |
| 注册表 | 页面表（key 必须 = 模块 id） | 组件表（name 自由命名，建议 kebab-case） |
| 自动渲染 | kernel 按 URL 自动 `render` | **永不自动渲染**，只在页面 component 显式 `ctx.ui.component(name)` 取用时实例化 |
| 清单条目 | `web/front.json` + `modules.json` + `plugins.json` | **仅** `web/front.json`：`{ kind: "component", pages: [...] }` |
| 资源放行 | 由页面模块条目决定 | `kind:"component"` 且 `enabled !== false` 是 `/m/component-*/**` 可被静态服务的**白名单依据**（`server/routes/module-routes.js` 的 `resolveComponentDir`，fail closed：禁用即不服务） |

跨页命中：`pages` 决定被哪些页面加载（`web/loader.mjs` 的 `matchPage`，缺省 = 只匹配 target 自身 id）；`enabled:false` 不 import、前端代码不下载。

### 1.5 主题插件形态（`component-theme-<主题id>`，主题插件组核心）

主题是 L2 组件类插件的特化形态。**目录契约**：`modules/component-theme-<主题id>/`（主题 id = 小写字母开头的 kebab-case，≤40 字符，与 `PUT /api/theme/active` 的校验同口径），仅 `front/{plugin,view}.js`（+ `theme.css` 等静态资产），无 `index.html`、无后端插件。

`web/front.json` 条目（`pages` 必须列出主题要生效的全部页面 id）：

```json
{ "target": "modules/component-theme-neon", "enabled": true, "kind": "component",
  "label": "霓虹主题核心",
  "group": { "name": "霓虹主题", "members": ["component-neon-penlights"] },
  "pages": ["home", "select", "..."] }
```

`apply` 内的职责（参考 `modules/component-theme-neon/front/plugin.js`）：

1. `ctx.ui.registerComponent("theme:<id>", factory)`——factory 渲染主题管理页的主题预览卡（`props.active` = 是否当前主题）；theme-manager 按 `"theme:"` 前缀枚举组件表自动发现，无需登记进任何页面
2. 资产注入无条件执行：挂自己的 `<link>` 样式与氛围层 DOM，样式规则全部挂在 `<html>` 主题类（如 `theme-neon`）之下——未激活零视觉残留
3. **自带激活逻辑**：`localStorage["ystage:theme"]` 同步初判（避免首屏闪默认主题）+ `GET /api/theme/active` 异步对账（系统级首选；接口 404/异常 → 静默保持本地）
4. 比赛演出守卫：`body.battle-mode` 下主题氛围全部退场只留背景图；`prefers-reduced-motion` 全量降级

纪律：主题之间互不 import（组件纪律第 7 条）；禁用主题插件 = 主题从主题页消失、页面回落默认皮肤。组内**组件成员** = 目录 `modules/component-<组id>-<名>/` 的普通组件插件（如 `component-neon-penlights` 荧光棒人浪），按命名约定自动归组；约定覆盖不到的成员可在核心条目 `group.members` 显式列出 id（清单中不存在的 id 跳过）。

---

## 2. 后端插件 API

### 2.1 导出契约

```js
module.exports = {
  name: "my-feature",              // string，可省略（loader 以清单 target 的 id 兜底）
  inject: ["db", "server", "modules"], // array 或单个 string（如 "db"），可省略
  // Config: <StandardSchemaV1>,   // 可选：声明后清单 config 会先过校验
  apply(ctx, config) { /* ... */ },
};
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 插件名；省略时以 `plugins.json` 条目 target 的 id 兜底 |
| `inject` | `string \| string[]` | 依赖的服务名。**不在白名单内的名字 → 该插件被跳过挂载，计入 errors，serverLog 报 error，不阻断启动**（防止 cordis fiber 永久 PENDING 死锁） |
| `Config` | StandardSchema | 可选 config 校验器；不声明时清单条目的 `config` 原样透传 |
| `apply` | `(ctx, config) => void` | 插件主体。**`ctx.server.route()` 必须在 apply 的同步窗口内完成调用**（loader 顺序 await 保证单变量 scope 无交错） |

白名单集合 = 内置 `{ server, db, modules, assembly }` ∪ `server/plugins.json` 各条目 `provides: [...]` 声明的服务名。插件间依赖：先行插件在清单声明 `provides` 并 `ctx.provide(name, value)`，后行插件 inject 该名字。

### 2.2 `ctx.server`

```js
ctx.server = {
  app,                                 // y-router 实例（createApp 产物）
  route(cb),                           // 注册进 per-plugin 路由 scope
  log(...args),                        // 等价 serverLog
};
```

**`route(cb)`**：`cb = (app, { dbManager, serverLog, dataDir }) => void`，在回调内同步完成全部路由注册。

| 参数/成员 | 说明 |
|-----------|------|
| `app` | 路由注册面：`app.get/post/put/delete(path, handler...)`、`app.use(path, subRouter)`；handler 为 Connect 风格 `(req, res, next)`，支持中间件数组与 4 参错误处理 `(err, req, res, next)` |
| `dbManager` | 数据库管理器（同 `ctx.db` 的底层，供原 Express 时代代码直迁） |
| `serverLog` | 结构化日志函数：`serverLog(msg, level?)`，level 可为 `"error"` 等 |
| `dataDir` | 数据目录绝对路径（`resource/` 的解析结果，便携模式随 env 变化） |

**scope 语义**（理解热插拔的关键）：

- 每次 `route()` 的注册进入名为 `plugin:<id>` 的 scope；插件卸载 = `removeScope` **物理删除**这些路由层（后续请求立即 404），不是逻辑屏蔽
- 卸载前执行**请求排空**：该 scope 标记 draining → 命中其路由的新请求得到 `503 {"error":"plugin <id> is reloading"}` + `Retry-After: 1` → 在飞请求全部完成后才 dispose（超时 `Y_STAGE_DRAIN_TIMEOUT_MS`，默认 15000ms，强制降级并告警）
- 重挂（reload/改 config）时层序自动修正：新路由层会被搬回 404 兜底之前的正确位置（K16），`/api/modules` 投影顺序保持不变（K17）
- 同一插件的管理操作按 id **promise 链串行化**：并发 toggle/reload 不会交错出"三态不一致"

**禁止事项**：`scope.use(fn)`（无路径中间件）——排空按路径模式拦截，pathless 层无锚点（当前内核已防御：pathless 层不参与拦截匹配，但作为约定仍禁止）。

### 2.3 `ctx.db`

```js
ctx.db = {
  define(defs),          // defs: [{ name: string, defaultValue: object }]
  get(name),             // → lowdb v1 兼容文档对象
  sql(q, params),        // 原生 SQL 查询
  exists(name),          // → boolean
};
```

| API | 参数 | 返回/行为 |
|-----|------|-----------|
| `define(defs)` | `[{ name, defaultValue }]` | 声明模块数据库。`INSERT OR IGNORE` 幂等；默认值**不覆盖**已有数据（优先读 docs 行）。装配早于建库时仅登记，统一初始化时补写 |
| `get(name)` | 数据库名 | lowdb v1 兼容对象：`getState()` / `setState(obj)` / `write()` / `set(path, val)` / `push(path, val)` 链式可用（`.set().set().write()` 为合法用法） |
| `sql(q, params)` | SQL 语句 + 参数 | 直查 SQLite |
| `exists(name)` | 数据库名 | 是否已存在 |

存储位置：`resource/sqlite/y-stage.sqlite`（单文件，sql.js WASM 引擎，无需安装数据库）。插件停用/卸载**不删数据**。

### 2.4 `ctx.modules`

```js
ctx.modules = {
  registerPage(page),    // 注册页面元数据
  unregister(id),        // 注销（从 /api/modules 与导航中消失）
  list(),                // 当前全部页面投影
  get(id),               // 单条查询
};
```

**`registerPage(page)`** 参数（7 字段，与 `modules/modules.json` 中本模块条目**逐字段一致**——selfcheck A3 双源 parity 断言把关）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 模块 id（= 目录名 = 前端组件 key） |
| `name` | `string` | 显示名 |
| `description` | `string` | 一句话说明 |
| `icon` | `string` | 图标名，必须是 `web/icons.mjs` 的 `ICON_NAMES` 成员（如 `trophy`），不是 emoji |
| `nav` | `string[]` | 出现在哪些导航页：`"index"` / `"select"` / `"games"` 的子集；`[]` 不进导航 |
| `order` | `number` | 导航内排序，小在前 |

投影时自动补 `route: "/m/<id>/"`。**必须**配套 `ctx.effect(() => () => ctx.modules.unregister(id))`，保证停用后从 `/api/modules` 消失。

### 2.5 `ctx.assembly`（管理面服务，一般只有 plugin-manager 使用）

```js
ctx.assembly = {
  status(),                    // → { manifest, fibers, errors, baseOrder, baseLayerCount, ... }
  toggle(id, enabled),         // → { ok, persisted }  启停（排空→dispose→按需重挂）
  reload(id),                  // → { ok }             require.cache 逐出 + 重挂
  setConfig(id, config),       // → { ok, persisted }  写清单 config + 热重装
  toggleFront(id, enabled),    // → { ok, persisted }  写 web/front.json（前端插件，刷新生效）
};
```

`persisted:false` 仅在清单文件不可写时出现（通用写权限警示）。自保护：对 plugin-manager 自身执行禁用/重载/改 config 一律 400。

### 2.6 HTTP 处理器环境（垫片语义）

handler 写法与 Express 子集一致，由 `server/http/shim.js` 提供。**能用与不能用的**：

| 类别 | 支持 | 说明 |
|------|------|------|
| `res` 链式 | `res.status(n).set(k,v).type(mime).json(obj).send(body).end()` | `send(string)` → `text/html; charset=utf-8`；`send(Buffer)` 保型；`redirect(url)` 带 `Vary: Accept` 协商 |
| `req` | `req.params`（**URL 解码**）、`req.query`、`req.path`（**保持原始编码**——注意与 params 的不对称是 Express 语义）、`req.originalUrl`、`req.body`、`req.headers` | `:param` 路径参数 + `*` 通配 + 尾斜杠宽容匹配 + 大小写不敏感 |
| 全局中间件 | `cors`（最先，预检 204）、`body-parser`（JSON，limit 5MB）、`multer`（50MB，仅音乐上传路由） | 直接 `next(e)` |
| 错误处理 | `next(err)` → 4 参错误分发 → 穷尽后 500 JSON | malformed JSON → 500 |
| 明确不存在 | ETag/304、自动 OPTIONS 应答（无 Origin 裸 OPTIONS 落 404）、`res.sendFile/download/cookies/render`、`express.static` | 静态文件走共享层；需要发文件用 `res.send(Buffer)` 或流 |
| 404 兜底 | JSON/文本形式 `Cannot <METHOD> <path>` | 依赖 `req.originalUrl` |

### 2.7 生命周期与卸载语义

```
apply(ctx) 同步窗口
  └─ ctx.server.route() 注册 → scope "plugin:<id>"
停用（toggle off / 清单移除）
  ├─ 标记 draining：命中本插件路由的新请求 → 503 + Retry-After: 1
  ├─ 等在飞请求归零（Y_STAGE_DRAIN_TIMEOUT_MS，默认 15000，超时强制降级并 warn）
  └─ dispose（cordis effect 逆序回收）→ scope 路由物理移除 → 后续 404（正确语义）
重载（reload / 改 config）
  └─ 同上排空 → require.cache 逐出该插件的磁盘文件 → 重新 require + apply
     → 重挂期间微窗口内原路径请求 503（而非 404）→ finally resumeScope
```

约束：同一插件对象重复 `ctx.plugin()` 会叠加 fiber（cordis K2）——loader 已防，插件作者无需处理但**不要在模块顶层做有副作用的单例注册**；`fiber.dispose()` 是异步的（K6），loader 全程 await。

---

## 3. 前端插件 API

### 3.1 导出契约

```js
export default {
  name: "my-feature-front",     // string，可省略
  inject: ["ui", "api"],        // 白名单：ui / api / state；可省略或传单个 string
  apply(ctx) {
    ctx.ui.register({ key: "my-feature", component });
  },
};
```

- **`key` 必须 = 模块 id**：内核装配完成后按 `location.pathname` 解析出的 id 调 `ui.render`，key 不匹配则页面显示"插件未启用"占位
- `inject` 含未知服务名 → 该插件被跳过（防 cordis fiber PENDING 死锁），错误计入装配 errors
- 插件文件**不要 import 内核**（`/web/kernel.js`）或任何 Node 模块；需要拆分就用同目录相对 import（`./view.js`）

### 3.2 `ctx.ui`

```js
ctx.ui = {
  // ---- 页面表（kernel 按 URL 自动渲染；key 必须 = 模块 id）----
  register({ key, component }),
  unregister(key),
  render(key, meta, container),
  // ---- 组件表（P11：页面显式取用，永不被 kernel 自动渲染）----
  registerComponent(name, factory),
  component(name),        // → factory | null
  listComponents(),       // → string[]（插入序快照）
};
```

| API | 参数 | 行为 |
|-----|------|------|
| `register` | `key: string`；`component: (el, meta, ctx) => cleanup \| void` | 注册页面组件。`el` = 容器元素（`#plugin-root`）；`meta` = front.json 条目的 `config`（缺省 `null`）；`ctx` = 前端 Context（`ctx.on/emit` 可用） |
| `unregister` | `key` | 注销并触发其 cleanup |
| `render` | `key, meta, container` | 未注册 → 渲染占位 `<div class="plugin-placeholder">插件未启用…</div>`；重复 render **先调用旧 cleanup**；组件抛错 → 捕获、降级渲染占位并 console.error（不会白屏） |
| `registerComponent` | `name: string`（建议 kebab-case）；`factory: (hostEl, props, ctx) => cleanup \| void` | 注册组件工厂；同 name **后注册覆盖先注册**；name 非字符串/空串或 factory 非函数 → 抛错。主题插件用 `theme:<id>` 前缀名（主题管理页按该前缀枚举发现主题卡，见 1.5） |
| `component` | `name` | 返回工厂本体；未注册或非字符串名 → **`null`**（调用方据此优雅降级，不抛错） |
| `listComponents` | — | 已注册组件名的**插入序快照**（防御性拷贝，调试/管理页/单测断言用） |

**两张表互不覆盖**：页面表 key = 模块 id（kernel 按 URL 查表 render），组件表 name 自由命名、**永不被 kernel 自动渲染**。本期不提供 `unregisterComponent`——组件生命周期 = 页面生命周期（`front.json` 的 enabled 决定是否 import，热替换 = 刷新页面），刷新即重建整个 ctx。

**cleanup 契约**：返回的函数在"同容器再次 render"或"unregister 当前 key"时被调用（抛错被吞并 console.error，不阻断新渲染）。事件监听一律 `addEventListener(type, handler, { signal })` + `AbortController`，cleanup 里 `abort()`；定时器/rAF/audio 也应在 cleanup 中清理。组件实例的 cleanup 由取用方持有与释放（见 3.8 的 `mountFromConfig`）。

### 3.3 `ctx.api`

```js
ctx.api = {
  get(path),            // → Promise<解析后的 JSON>
  post(path, body),     // body 自动 JSON.stringify + Content-Type
  del(path),
};
```

- `path` 一律 **origin 相对路径**（`/api/...`）——部署到任意端口/子路径无需改代码
- 非 2xx：抛 `Error`，`err.status` 为状态码（前端按需 try/catch）
- 纯文本响应回退为 `{ text }` 形态

### 3.4 `ctx.state`

```js
ctx.state = {
  get(key),          // → any
  set(key, val),     // 广播 ctx.emit("state:changed", { key, val })
};
```

跨插件内存键值。监听：`ctx.on("state:changed", (payload) => {...})`。

### 3.5 事件

| 事件 | 载荷 | 时机 |
|------|------|------|
| `kernel:ready` | `{ moduleId }` | 全部插件挂载完成后、`ui.render` 之前 |
| `state:changed` | `{ key, val }` | `ctx.state.set` 时 |
| `plugins.updated` | 装配快照 | 后端管理操作成功后（预留事件，当前无前端订阅者） |

### 3.6 页面结构（`index.html`）

最小形态：

```html
<body>
  <div id="plugin-root"></div>
  <!-- 注意：本手册内嵌副本中，内核标签的结束标签须写作 <\/script>（防提前终止数据块） -->
  <script type="module" src="/web/kernel.js"><\/script>
</body>
```

三种形态：

1. **全组件**：页面内容全部由 component 构建（适合简单页面）
2. **静态骨架 + 绑定**（复杂页面推荐，参考 `modules/drag/`）：HTML 写完整骨架与 CSS 引用，component 只绑定既有 DOM（用 `document.getElementById`）并渲染动态内容——样式零回归
3. **多页面模块**（参考 `modules/moving-sth/`）：每个 HTML 都含内核标签，component 内按 DOM 标记分发（如 `#settings-form` → 设置页逻辑），`front.json` 只需一条

模块 id 解析规则（`web/loader.mjs` 的 `moduleIdFromPath`）：`/m/<id>/…` → `<id>`；`/` 与 `/index.html` → `home`；其余 → null（不装配）。

### 3.7 图标基座 `web/icons.mjs`

全项目 UI 图标的唯一来源：Tabler Icons 的本地内置子集（MIT，`@tabler/icons` v3.46.0 outline，构建期一次性提取，运行期零依赖、无 CDN、无网络请求）。来源与许可全文见仓库根 `THIRD-PARTY-NOTICES.md`。

```js
import { icon, iconEl, ICON_NAMES } from "/web/icons.mjs";
```

| API | 参数 | 返回/行为 |
|-----|------|-----------|
| `icon(name, opts?)` | `name` 图标名；`opts = { size?, class?, stroke?, label? }` | 内联 SVG **字符串**。`size` 默认 20、`stroke` 默认 1.75（非法/非正数回退默认）、`class` 追加且基础类 `y-icon` 恒保留。**未知名字返回 `""`**（占位安全，不抛错） |
| `iconEl(name, opts?)` | 同上 | 真实 `SVGElement`（经 `<template>` 构造）；无 DOM 环境（node 单测）或未知名字返回 `null` |
| `ICON_NAMES` | — | 已内置图标名（冻结数组，当前 65 枚，字典序）；模块 `icon` 字段必须取自这里 |

无障碍语义：`label` 有值 → `role="img"` + `aria-label`（图标是唯一语义来源时用）；无值 → `aria-hidden="true"`（装饰性，旁边已有文字说明）。`label` / `class` 中的引号与尖括号会被属性转义。

```js
import { icon, iconEl } from "/web/icons.mjs";

// ① 装饰性图标（旁边有文字）——不停用屏幕阅读器
btn.innerHTML = `${icon("plus", { size: 18 })}<span>新增选手</span>`;

// ② 图标即唯一语义——必须给 label
cell.append(iconEl("trash", { label: "删除该行" }));

// ③ 颜色跟随父元素（stroke="currentColor"，无需在 JS 指定颜色）
statusEl.innerHTML = icon("circle-check", { size: 16 }) + " 已保存";
```

约定与边界：

- **禁止新增 emoji 图标**，**禁止在模块内自建图标字典或内联复制 SVG path**——图标只有 `web/icons.mjs` 一份事实来源。CSS 伪元素 `content:"…"` 无法承载图标，改由真实 DOM 节点（`icon()` 输出）承载。
- **缺失图标**：把准确的 Tabler path 追加进 `web/icons.mjs` 的 `ICON_PATHS`（键自动并入 `ICON_NAMES`），然后跑 `node web/icons.test.js`；该测试校验需求清单、SVG 统一规格、边界行为，并扫描 `modules/**` 中引用本基座的文件、报告缺失图标名。
- 模块元数据 `registerPage({ icon })` 与 `modules/modules.json` 的 `icon` 填图标名（`ICON_NAMES` 成员），两处必须一致（见 2.4）。

### 3.8 L1 共享资产与页面装配器（P11）

**L1 分层**：纯函数/纯样式共享资产（与 `web/icons.mjs` 同级）——无生命周期、不进清单、可直接 import（origin 相对路径），必须配 `*.test.js`。

| 资产 | 导出 | 说明 |
|------|------|------|
| `/web/lib/random.mjs` | `shuffle(arr, rng?)`、`pickN(arr, n, rng?)`、`pickOne(arr, rng?)` | 等概率随机（`shuffle` 为 Fisher–Yates，**替代有偏的 `sort(() => Math.random() - 0.5)`**）；均返回新数组、不改入参，入参非数组按空数组处理（不抛错）；`rng` 默认 `Math.random`（注入固定序列可做确定性测试）；`pickN` 长度 = `min(max(floor(n),0), arr.length)`，`pickOne([])` → `null` |
| `/web/lib/persist.mjs` | `createPersistence(deps)`、`createMemoryStorage()` | 教程 §8 双写持久化模板的依赖注入实现（`key` 必填）；`deps = { key, storage?, api?, endpoint?, clearEndpoint?, initNewGame?, isValid?, now?, onError? }` |
| `/web/lib/undo.mjs` | `createUndoStack(opts?)`、`MAX_HISTORY`（= 50） | 撤销快照栈：`push/undo/peek/canUndo/size/clear/toArray/load`；超上限丢最旧（FIFO），快照按引用保存 |
| `/web/components/grid.css` | `.grid-cards` / `.grid-flow` / `.grid-split` / `.card` | 布局原语：**零媒体查询**（`repeat(auto-*, minmax(min(<阈值>,100%),1fr))` 按容器宽度连续自适应）；`.grid-cards` 用 auto-fill（卡片尺寸一致）、`.grid-flow` / `.grid-split` 用 auto-fit（少卡片时撑满） |
| `/web/components/compose.mjs` | `mountFromConfig(spec)` | 页面组件装配器（见下） |

`createPersistence` 返回 `{ load, save, reset }`（均为 Promise，**永不 reject**）：

- `load()` → `{ data, source }`，`source: "server" | "local" | "new" | "none"`；恢复链 server → localStorage → `initNewGame`
- `save(data)` → `{ local, remote }`（两端各自是否成功）；本地先写（同步必达），远端 POST 体 = `{ ...data, lastUpdate: now() }`（`data` 为数组/原始值时按原值发）
- `reset()` → `{ local, remote }`；只清两端存档、不重建状态

**`mountFromConfig(spec)`** —— 消除页面插件里"读 front.json config → 查 `ctx.ui.component` → 挂到 `data-slot` 宿主 → 收集 cleanup"的重复样板：

```js
import { mountFromConfig } from "/web/components/compose.mjs";

const mounted = mountFromConfig({
  el,               // 页面根容器（#plugin-root）
  meta,             // front.json 中该页面条目的 config（可 null）
  ctx,              // 前端 ctx（内部只用 ctx.ui.component(name)）
  label,            // 日志前缀，如 "music-draw"（warn/error 消息带 [label]）
  defaultSlots,     // 缺省插槽表 { "<组件名>": "[data-slot=x]" | [sel, ...] }；清单 config.slots 覆盖/追加
  runtimeProps,     // 可选：运行时 props，按组件名索引（对象 = 单/共用；数组 = 多实例按下标）
  names,            // 可选：只装配这些组件（与推导出的 compose 取交集、保持其顺序；[] = 本页零装配）
});
// → { cleanups, mountAll(), cleanup() }
```

| 返回成员 | 语义 |
|----------|------|
| `cleanups` | 已实例化组件的 cleanup 数组（按挂载顺序；调用方也可自行 push 页面 cleanup） |
| `mountAll()` | 执行一次装配循环（构造时已自动执行一次）；**非幂等**：重复调用会在同一宿主再建一个实例并追加 cleanup，旧的监听、`body` class 等副作用需先 `cleanup()` 释放，**切勿当作"重渲染"使用** |
| `cleanup()` | **逆序**调用 cleanups 并清空；单个抛错不影响其余（console.error 上报，不向外抛） |

清单声明语义（`meta`，即 front.json 页面条目的 `config`）：

| 键 | 值 | 语义 |
|----|----|------|
| `compose` | `["music-player","draw-machine"]` | 需要装配的组件名，**顺序 = 挂载顺序**；缺省 = `Object.keys(slots)` |
| `slots` | `{ "<组件名>": "[data-slot=x]" \| ["sel1","sel2"] }` | 宿主选择器（**键 = 组件名**）；数组 = 多实例。`slots = { ...defaultSlots, ...meta.slots }`——模块缺省表兜底，清单可覆盖/追加 |
| `components` | `{ "<组件名>": { …props } \| [{ … }, …] }` | 静态 props；数组 = 多实例按下标一一对应，对象 = 所有实例共用 |

- 宿主查找顺序：`el.querySelector(selector) || document.querySelector(selector)`
- props 优先级：静态 props < 运行时 props（浅合并）；多实例按**实例下标一一对应**取（`propsAtIndex` 语义）
- 只有 `factory(host, props, ctx)` 返回函数才入 cleanups
- `names` 诊断：不在 compose/slots 推导结果中的名字逐条 warn `[<label>] names 中的组件 "<name>" 不在 compose/slots 中，已忽略` 并忽略（不装配、不查组件表）；`names: []` = 本页零装配且零告警（movement-teaching 记录页/设置页依赖此路径），缺省 `names` 或非数组畸形值均不过滤、零告警
- 组件自带样式：`style.css` 属**可选兜底外观**（组件不自带 `<link>`）——需要组件独立外观、或宿主页无对应 CSS 时，由页面显式引入 `<link rel="stylesheet" href="/m/component-<名>/style.css">`；未引入不影响功能，组件与页面共用既有类名（如 `battle-overlay` / `rolling` / `selected`），现有 8 个接入页的外观均由各自页面 CSS 提供

**优雅降级（装配器自身的畸形输入不抛错）**：`ctx.ui.component(name)` 未注册（组件被 `enabled:false` 禁用）→ factory 为 null → warn 后跳过该组件（插槽留空），页面其余部分照常工作；槽位未声明、宿主不存在、选择器非法（非字符串 / DOM 拒收）、`meta` / `slots` / `components` / `runtimeProps` 畸形（null、数组、原始值）一律 warn 后跳过或按空表降级。组件工厂 `factory(host, props, ctx)` 自身抛错**不**被吞掉（**向上传播**，降级归调用方），以免掩盖组件真实缺陷。

**组件纪律（P11 实战教训）**：监听传 `{ signal }` + AbortController；`body` class 成对增删（多实例共享时引用计数）；禁模块级可变状态（多实例串台根因）；宿主 audio 只 pause/归零、不删除；`[data-slot]` 宿主置于 `opacity:0` 祖先之外；`config` 只放静态值；**组件不得 import 其他组件**（禁用会级联崩溃）。

参考实例：单实例 `modules/drag/front/plugin.js`、多实例 `modules/music-draw/front/plugin.js`、条件装配 `modules/movement-teaching/front/plugin.js`（`names` 传 `[]` 表达"本页零装配"）。

---

## 4. 结构参考

### 4.1 三份清单

**`server/plugins.json`**（后端装配）：

```json
{
  "provider": { "server": "y-router", "db": "sqlite" },
  "plugins": [
    { "target": "modules/drag", "enabled": true,
      "config": { "totalCount": 12 },
      "provides": [] }
  ]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `target` | ✔ | `"modules/<id>"` |
| `enabled` |  | 默认 true；`false` = 不挂载（路由/页面 404，SQLite 数据保留） |
| `config` |  | 透传为 `apply(ctx, config)` 第二参（声明了 `Config` schema 则先校验） |
| `provides` |  | 本插件向其他插件提供的服务名数组（并入 inject 白名单动态集合） |
| `label` |  | 可选中文名（插件管理页显示与搜索命中，缺省回退 id；如 music-library 的「音乐库（扫描 / 上传 / 回收）」）；loader 对未知字段透明，由 plugin-manager 透传进 `GET /api/plugins` 快照 |

**`web/front.json`**（前端装配）：

```json
{
  "provider": { "ui": "dom" },
  "plugins": [
    { "target": "modules/drag", "enabled": true,
      "config": { "keepBg": true },
      "pages": ["drag", "performance"] },
    { "target": "modules/component-draw-machine", "enabled": true,
      "kind": "component", "label": "抽签机",
      "pages": ["drag", "music-draw", "movement-teaching"] }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `enabled` | `false` = 不 import，**前端代码不下载**（效果等同没有该 script） |
| `config` | 作为 `component(el, meta)` 的 `meta` 传入；页面条目用它声明组件装配（`compose` / `slots` / `components`，见 3.8） |
| `pages` | 可选；覆盖默认的"target 即本模块页"匹配，用于跨页插件 |
| `kind` | 组件类插件填 `"component"`——既是分类标记，也是服务端放行 `/m/component-*/**` 静态资源的**白名单依据**（`resolveComponentDir` 要求 `kind === "component"` 且 `enabled !== false`，fail closed；见 1.4） |
| `label` | 可选中文名（插件管理页显示与搜索命中，缺省回退 id）；loader 对未知字段透明（内核零改动），`GET /api/plugins` 快照由 plugin-manager 读清单原文件透传，前端 toggle 写回整包保留未知字段 |
| `group` | 仅主题组核心条目：`{ "name": "组显示名", "members": ["成员插件id", …] }`——name 为插件管理页组卡显示名（缺省回退组 id）；members 为显式成员声明（可选的未来适配，成员仍可纯靠 `component-<组id>-` 命名约定自动发现、零登记；清单中不存在的 id 跳过） |

组件类插件条目**只存在于 `web/front.json`**（不进 `modules/modules.json` / `server/plugins.json`、不进导航）；组件目录含 `index.html` 也无意义——kernel 不会自动渲染组件名。

**`modules/modules.json`**（页面元数据）：`{ "modules": [ { id, name, description, icon, nav, order } ] }`——与后端插件 `registerPage` 逐字段一致（脚手架自动双写），其中 `icon` 为 `web/icons.mjs` 的 `ICON_NAMES` 图标名。

损坏容错：后端清单 JSON 损坏 → 整体回退 legacy 投影 + serverLog error，服务器照常启动；前端清单获取失败 → 按空清单装配（页面渲染占位，不白屏）。

### 4.2 `/api/modules` 投影结构

```json
{ "id": "drag", "name": "Drag式比赛", "description": "对阵树式四强双败赛",
  "icon": "trophy", "nav": ["select"], "order": 15, "route": "/m/drag/" }
```

固定 7 字段、顺序 = modules.json 宇宙序（插件注册按 id 原位覆盖，不沉底）。

### 4.3 `/api/plugins` 快照结构（管理页数据源）

```json
{ "backend": [ { "id", "name", "icon", "kind": "plugin|legacy", "enabled", "mounted", "error", "config", "label?" } ],
  "front":   [ { "id", "name", "icon", "enabled", "kind", "label?", "group?" } ] }
```

前端条目的 `kind` 是可选的分类元数据（P11 增量）：组件类插件为 `"component"`，普通页面条目为 `null`。`pkg` 单文件形态退役后（P6b）快照不再返回该字段。

`label` / `group` 是可选的清单展示元数据：assembly 条目投影本身不含它们，plugin-manager 后端在 `GET /api/plugins` 时按 target 读两份清单**原文件**补进快照（dev/portable 双模式路径解析；读取失败降级返回原始快照），内核零改动。管理页用它显示中文名与主题插件组。

便携模式（`Y_STAGE_PLUGINS_DIR` / `Y_STAGE_RESOURCE_DIR` 环境变量注入）下清单即 `plugins/` 目录的真实文件，所有写操作 `persisted: true`。

---

## 5. 错误语义与边界

| 场景 | 行为 |
|------|------|
| 后端 inject 含未知服务 | 跳过挂载、errors 收集、serverLog error，其余插件照常装配 |
| `apply` 抛错 | fiber dispose，已注册的 scope effect 被回收（路由随插件消失），errors 收集 |
| 前端插件 import 失败 / apply 抛错 | errors 收集，继续装配后续插件；页面渲染占位 |
| component 抛错 | render 捕获 → 占位降级 + console.error |
| 坏 JSON 请求体 | 500（4 参错误分发穷尽兜底） |
| 热重载排空超时 | 强制 dispose + warn（在飞请求可能失败，有界降级） |
| 清单写盘失败（只读目录） | 响应 `persisted:false` + 通用写权限警示，内存态本次进程内仍生效 |

---

## 6. 工具链与验证

| 工具 | 命令 | 用途 |
|------|------|------|
| 脚手架（页面） | `node scripts/new-module.js <id> "名称" [--server]` | 生成一对插件骨架 + 自动追加三份清单 |
| 脚手架（组件） | `node scripts/new-module.js <组件id> "名称" --component [--pages a,b]` | 生成组件类插件骨架（仅 `front/{plugin,view}.js` + `web/front.json` 的 `kind`/`pages` 条目；id 自动补 `component-` 前缀；与 `--server` 互斥） |
| 数据库回归 | `node server.js --test` | 6 项，测完自动退出 |
| 装配自检 | `node server.js --test-cordis` | A1-A6 + A6.9 排空端到端，31 项断言（数据库基线 24 个，含 `theme-store`、`game-composer-layouts`） |
| 单元测试 | `node server/run-unit-tests.js` | 19 个测试文件（server 侧 9 + web 侧 10；含图标基座守门 `web/icons.test.js` 与 `web/ui.test.js`、`web/lib/{random,persist,undo,reactive,timers,body-class}.test.js`、`web/components/compose.test.js`） |
| HTTP 行为基线 | `node scripts/endpoint-diff.js --compare` | 35 用例逐字节回放，**不重录直绿**是改动零漂移的证明 |

**发布前检查单**（完整版见 `AGENTS.md` §6.8）：契约正确、inject 合法、三清单同步、key=模块 id、signal+cleanup、组件装配降级不崩（组件禁用时插槽留空）、管理页可见无 error、endpoint-diff 全绿。

---

## 7. 稳定性备注

- cordis 锁定 `4.0.0-rc.9` 精确版本；内核 API 漂移收敛在 `server/cordis/` 内，不扩散到插件代码
- 内核实测结论（重复挂载叠加 fiber、dispose 异步、effect 逆序回收、list 顺序语义等）以 `server/cordis/selfcheck.cjs` 头注释 K1-K17 为准
- 本文与 `AGENTS.md` 第 6 章冲突时，以 `AGENTS.md` 为准；发现文档失实请直接修正并保持与实现同步
