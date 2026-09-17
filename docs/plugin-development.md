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
  register({ key, component }),
  unregister(key),
  render(key, meta, container),
};
```

| API | 参数 | 行为 |
|-----|------|------|
| `register` | `key: string`；`component: (el, meta, ctx) => cleanup \| void` | 注册组件。`el` = 容器元素（`#plugin-root`）；`meta` = front.json 条目的 `config`（缺省 `null`）；`ctx` = 前端 Context（`ctx.on/emit` 可用） |
| `unregister` | `key` | 注销并触发其 cleanup |
| `render` | `key, meta, container` | 未注册 → 渲染占位 `<div class="plugin-placeholder">插件未启用…</div>`；重复 render **先调用旧 cleanup**；组件抛错 → 捕获、降级渲染占位并 console.error（不会白屏） |

**cleanup 契约**：返回的函数在"同容器再次 render"或"unregister 当前 key"时被调用（抛错被吞并 console.error，不阻断新渲染）。事件监听一律 `addEventListener(type, handler, { signal })` + `AbortController`，cleanup 里 `abort()`；定时器/rAF/audio 也应在 cleanup 中清理。

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
  <script type="module" src="/web/kernel.js"></script>
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
| `ICON_NAMES` | — | 已内置图标名（冻结数组，当前 61 枚，字典序）；模块 `icon` 字段必须取自这里 |

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

**`web/front.json`**（前端装配）：

```json
{
  "provider": { "ui": "dom" },
  "plugins": [
    { "target": "modules/drag", "enabled": true,
      "config": { "keepBg": true },
      "pages": ["drag", "performance"] }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `enabled` | `false` = 不 import，**前端代码不下载**（效果等同没有该 script） |
| `config` | 作为 `component(el, meta)` 的 `meta` 传入 |
| `pages` | 可选；覆盖默认的"target 即本模块页"匹配，用于跨页插件 |

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
{ "backend": [ { "id", "kind": "plugin|legacy", "enabled", "mounted", "error", "config", "name" } ],
  "front":   [ { "id", "target", "enabled" } ],
  "pkg": false }
```

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
| 脚手架 | `node scripts/new-module.js <id> "名称" [--server]` | 生成一对插件骨架 + 自动追加三份清单 |
| 数据库回归 | `node server.js --test` | 6 项，测完自动退出 |
| 装配自检 | `node server.js --test-cordis` | A1-A6 + A6.9 排空端到端，30 项断言 |
| 单元测试 | `node server/run-unit-tests.js` | 10 个测试文件（含 `web/icons.test.js` 图标基座守门） |
| HTTP 行为基线 | `node scripts/endpoint-diff.js --compare` | 35 用例逐字节回放，**不重录直绿**是改动零漂移的证明 |

**发布前检查单**（完整版见 `AGENTS.md` §6.8）：契约正确、inject 合法、三清单同步、key=模块 id、signal+cleanup、管理页可见无 error、endpoint-diff 全绿。

---

## 7. 稳定性备注

- cordis 锁定 `4.0.0-rc.9` 精确版本；内核 API 漂移收敛在 `server/cordis/` 内，不扩散到插件代码
- 内核实测结论（重复挂载叠加 fiber、dispose 异步、effect 逆序回收、list 顺序语义等）以 `server/cordis/selfcheck.cjs` 头注释 K1-K17 为准
- 本文与 `AGENTS.md` 第 6 章冲突时，以 `AGENTS.md` 为准；发现文档失实请直接修正并保持与实现同步
