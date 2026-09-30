# 插件开发教程

> 《Y.Stage3 手册》章节 · 面向开发者。本篇是上手导览；**API 签名、参数、清单结构、生命周期与错误语义的完整技术细节**见姊妹篇 [插件开发技术参考](./plugin-development.md)。

## 1. 心智模型

一个功能 = **一对插件 + 三份清单条目**：

```
modules/my-feature/
├── plugin.js          # 后端插件（CommonJS）：路由 + 数据库 + 页面元数据
├── index.html         # 页面：静态骨架（可选）+ #plugin-root + /web/kernel.js
├── style.css
└── front/
    ├── plugin.js      # 前端插件（原生 ESM）：注册页面组件
    └── view*.js       # 组件实现（可拆多文件，同目录相对 import）
```

三份清单（脚手架会自动追加，**不要手改**）：

| 清单 | 作用 | 漏掉的后果 |
|------|------|-----------|
| `modules/modules.json` | 页面元数据（导航/管理页显示名单） | 页面能跑但不进导航 |
| `server/plugins.json` | 后端装配 | 路由与页面 404 |
| `web/front.json` | 前端装配 | 页面空白、前端代码不下载 |

`enabled:false` = 不挂载但数据保留；未列出 = 不挂载。

## 2. 准备

- 能跑 `node server.js` 且控制台无 error（见[快速上手](./getting-started.md)）
- 起服后访问 `/m/plugin-manager/`，确认现有插件全部"已挂载"——这是你的基线环境
- 选定模块 id：**小写字母 + 连字符**（如 `music-draw`），它同时是目录名、页面路径、前端组件 key

## 3. 第一步：脚手架（永远从它开始）

```bash
node scripts/new-module.js my-feature "我的功能"            # 纯前端模块
node scripts/new-module.js my-feature "我的功能" --server   # 带后端（附 db + 路由模板）
```

脚手架生成一对插件骨架（含中文契约注释）并**自动追加三份清单条目**。三份清单不同步是本项目最经典的坑，用脚手架可完全避免。

## 4. 后端插件（`plugin.js`，CommonJS）

```js
module.exports = {
  name: "my-feature",
  inject: ["db", "server", "modules"],   // 白名单：server / db / modules / assembly
  apply(ctx) {
    // ---- 数据库：一行声明即得持久化文档 ----
    ctx.db.define([
      { name: "my-feature-process", defaultValue: { phase: "idle" } },
    ]);
    // ctx.db 还有 get(name) / sql(q, p) / exists(name)

    // ---- 路由：必须在 apply 同步窗口内注册；一律带路径前缀 ----
    ctx.server.route((app, { dbManager, serverLog, dataDir }) => {
      app.get("/api/my-feature/ping", (req, res) => res.json({ ok: true }));
      app.post("/api/my-feature-process", (req, res) => { /* 保存进度 */ });
    });

    // ---- 页面元数据：必须与 modules.json 中本模块条目逐字段一致 ----
    ctx.modules.registerPage({
      id: "my-feature", name: "我的功能", description: "一句话说明",
      icon: "puzzle",                         // 图标名，须 ∈ web/icons.mjs 的 ICON_NAMES
      nav: ["select"], order: 50,             // nav: "index"/"select"/"games"
    });

    // ---- 卸载清理：插件停用时从导航中消失 ----
    ctx.effect(() => () => ctx.modules.unregister("my-feature"));
  },
};
```

**三条纪律：**

1. `inject` 只能写白名单服务名，**拼错会导致装配挂起**（内核会校验跳过，但别依赖兜底）
2. 路由全部经 `app.get/post(...)` 带**路径前缀**注册——**禁止 `scope.use(fn)` 无路径中间件**（热重载排空按路径模式拦截，pathless 层无锚点）
3. 数据库名与 API 前缀保持对应（`my-feature-process` ↔ `/api/my-feature-process`）

## 5. 前端插件（`front/plugin.js`，原生 ESM）

```js
export default {
  name: "my-feature-front",
  inject: ["ui", "api"],                 // 白名单：ui / api / state
  apply(ctx) {
    ctx.ui.register({
      key: "my-feature",                 // ★ 必须 = 模块 id，内核按它渲染
      component(el, meta, ctx2) {        // el = #plugin-root；meta = 清单条目 config
        const controller = new AbortController();
        el.innerHTML = `<section class="my-feature-page">
          <button id="my-feature-btn">点我</button>
        </section>`;
        el.querySelector("#my-feature-btn")
          .addEventListener("click", onClick, { signal: controller.signal });

        return () => controller.abort(); // cleanup：重渲染/卸载前被调用
      },
    });
  },
};
```

**铁约定：**

- **所有事件监听都传 `{ signal }`**，cleanup 里统一 `abort()`——违反它，插件重渲染时会双绑双触发
- `apply` 阶段只 register，**DOM 操作统一发生在 component 被调用时**（内核装配完成后）
- 页面内资源用同目录相对路径（`style.css`、`./front/...`）；共享资源用绝对路径（`/api/...`、`/resource/...`、`/web/...`），**不要写死 localhost 或端口**
- 服务可用 `ctx.api.get/post/del`（自动 JSON 序列化，非 2xx 抛错带 status）；跨插件通信用 `ctx.state` + `state:changed` 事件

### 5.1 图标（`/web/icons.mjs`）

全项目 UI 图标统一来自共享基座 `web/icons.mjs`（Tabler Icons 本地内置子集，MIT，离线可用、运行期零依赖；许可见根 `THIRD-PARTY-NOTICES.md`）。前端插件里 origin 相对路径 import，不要自建图标字典：

```js
import { icon, iconEl } from "/web/icons.mjs";

// 装饰性图标（旁边有文字）——不停用屏幕阅读器
btn.innerHTML = `${icon("plus", { size: 18 })}<span>新增选手</span>`;

// 图标即唯一语义——必须给 label
cell.append(iconEl("trash", { label: "删除该行" }));

// 颜色跟随父元素（stroke="currentColor"，无需在 JS 指定颜色）
statusEl.innerHTML = icon("circle-check", { size: 16 }) + " 已保存";
```

- `icon(name, { size = 20, class, stroke = 1.75, label })` → SVG 字符串；`iconEl(name, opts)` → 真实 `SVGElement`
- `label` 有值渲染 `role="img"` + `aria-label`，无值渲染 `aria-hidden="true"`；未知图标名 `icon()` 返回 `""`、`iconEl()` 返回 `null`（占位安全，不抛错）
- **禁止 emoji 图标、禁止内联复制 SVG path**；缺图标时把准确 path 追加进 `web/icons.mjs` 的 `ICON_PATHS`，再跑 `node web/icons.test.js` 守门
- 模块元数据的 `icon` 字段填**图标名**（`ICON_NAMES` 成员，如 `puzzle`），不是 emoji

## 6. 组件与共享库（什么时候该写组件）

页面代码里反复出现的交互（抽签动画、音乐播放）不要各页重写——按 **L1/L2 分层**沉淀，判据是**有没有生命周期**：

| 层 | 落位 | 准入 | 引入方式 |
|----|------|------|----------|
| L1 共享资产 | `web/lib/*.mjs`、`web/components/compose.mjs`、`web/components/grid.css` | 纯函数/纯样式：无监听、无定时器、无网络、无模块级可变状态；必须配 `*.test.js` | 直接 `import`（origin 相对路径），不注册插件、不进清单 |
| L2 组件类插件 | `modules/component-<名>/`（仅 `front/{plugin,view}.js`） | 有生命周期（监听/定时器/网络/多媒体）且被 **≥2 个页面**复用 | 进 `web/front.json`（`kind:"component"` + `pages`），享受 `enabled:false` 禁用与热开关 |

现有 L1 资产：`/web/lib/random.mjs` 的 `shuffle/pickN/pickOne`（等概率随机，替代有偏洗牌）、`/web/lib/persist.mjs` 的 `createPersistence`（双写持久化）、`/web/lib/undo.mjs` 的 `createUndoStack`（撤销栈）、`/web/components/compose.mjs` 的 `mountFromConfig`（页面装配器）、`/web/components/grid.css`（零媒体查询布局原语 `.grid-cards` / `.grid-flow` / `.grid-split` / `.card`）。现有 L2 组件：`music-player`（音乐播放 + 比赛模式）、`draw-machine`（抽签动画）、`toast`（轻提示）、`confirm-dialog`（确认对话框）、`player-list`（选手名单）、`score-board`（多队计分）、`countdown`（倒计时）、`music-source`（曲库数据源）、`neon-penlights`（霓虹荧光棒人浪），以及主题插件 `theme:neon`（霓虹主题核心）。

组件表 API 共三个（`ctx.ui`）：`registerComponent(name, factory)`、`component(name)`（→ `factory | null`）、`listComponents()`——组件插件被 `enabled:false` 禁用后 `component(name)` 返回 `null`，页面据此降级。

**主题插件（`component-theme-<主题id>/`）** 是 L2 的特化形态：注册名用 `theme:<id>` 前缀（主题管理页 `/m/theme-manager/` 按该前缀枚举组件表，自动发现并渲染主题卡），自带激活逻辑（注入样式 + 给 `<html>` 挂主题类 + `localStorage["ystage:theme"]` / `GET /api/theme/active` 对账），组内还可带组件成员（目录 `component-<主题id>-<名>/`，插件管理页「主题插件」标签归为一张组卡）。清单条目加 `label`（中文名）与 `group`（组显示名 / 显式成员）即获得中文名与组卡名。完整契约见[插件开发技术参考](./plugin-development.md) §1.5；主题之间互不 import，禁用 = 主题卡消失、页面回落默认皮肤。

### 6.1 脚手架（组件模式）

```bash
node scripts/new-module.js my-widget "我的组件" --component --pages drag,music-draw
```

组件 id 自动补 `component-` 前缀，只生成 `front/{plugin,view}.js` + `web/front.json` 条目（**不生成** `index.html` / `style.css` / 后端 `plugin.js`）。组件名 = `registerComponent` 的公开标识（kebab-case），页面侧按名字取用。

### 6.2 页面侧取用（最小范例，含降级）

```js
import { mountFromConfig } from "/web/components/compose.mjs";

// 页面 component 内（el 即 #plugin-root）：
const bridge = { draw: null };            // 组件 props.onReady 回填的实例 API，页面 flow 消费
const mounted = mountFromConfig({
  el, meta, ctx,
  label: "my-feature",                    // 日志前缀
  defaultSlots: { "draw-machine": "[data-slot=draw]" },
  runtimeProps: { "draw-machine": { onReady: (api) => { bridge.draw = api; } } },
});

// 或命令式只取一个组件——组件被 enabled:false 禁用时返回 null，必须降级不崩：
const factory = ctx.ui.component("draw-machine");
if (factory) mounted.cleanups.push(factory(host, props, ctx));
```

`mountFromConfig` 返回 `{ cleanups, mountAll(), cleanup() }`：`cleanup()` 逆序卸载全部已实例化组件（单个抛错不影响其余），与页面 flow 的 cleanup 一起在页面卸载时调用。**组件缺失、插槽缺失、选择器非法一律 warn 后跳过——插槽留空、页面照常工作。**

### 6.3 `front.json` 声明（页面条目 `config`）

```json
{
  "target": "modules/my-feature",
  "enabled": true,
  "config": {
    "compose": ["draw-machine"],
    "slots": { "draw-machine": "[data-slot=draw]" },
    "components": { "draw-machine": { "ticks": 15, "tickMs": 80 } }
  }
}
```

| 键 | 语义 |
|----|------|
| `compose` | 需要装配的组件名，**顺序 = 挂载顺序**；缺省 = `slots` 的键 |
| `slots` | 组件宿主选择器，**键是组件名**；值为字符串 = 单实例 |
| `components` | 组件静态 props（时序/颜色/文案）；运行时 props（页面 `view.js` 提供）浅合并优先 |

**多实例**：`slots` 的值写成数组（多个宿主选择器），`components` 的值写成数组，**按实例下标一一对应**（数组取第 i 项；`components` 传对象则所有实例共用同一份）。范例：`modules/music-draw/` 三曲库 = 3 个 `music-player` + 3 个 `draw-machine`，宿主用 `data-slot="music-1yearminus"` 之类的短名承载。

组件的完整 API 签名、装配器参数（`runtimeProps` / `names` 条件装配）、`kind` / `pages` 清单字段与组件纪律，见[插件开发技术参考](./plugin-development.md) §3.8 与 §4.1。

## 7. 页面与静态骨架

`index.html` 最小骨架：

```html
<body>
  <div id="plugin-root"></div>
  <script type="module" src="/web/kernel.js"></script>
</body>
```

也可以像 `modules/drag/` 那样把完整静态骨架（控制条、音频元素等）直接写进 HTML，组件只负责绑定既有 DOM 与渲染动态内容——改动更小、样式零回归，复杂页面推荐此法。多页面模块（如 `moving-sth` 的设置页）每页都放内核标签，前端组件内按 DOM 标记分发。

## 8. 持久化双写模板（赛制类模块）

前端保存采用 **localStorage + 服务器双写**，服务器失败静默跳过（比赛现场网络抖动不丢进度）；恢复时先服务器后本地：

```js
const API_URL = "/api/my-feature-process";      // origin 相对路径

function saveState() {
  localStorage.setItem("myFeatureState", JSON.stringify(data));
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lastUpdate: new Date().toISOString() }),
  }).catch(() => {});
}
// 恢复链：loadStateFromServer() 失败 → loadLocalState() → 都没有则 initNewGame()
```

同类重复代码已沉淀成 L1 共享库：`createPersistence`（双写/恢复链/重置）、`createUndoStack`（撤销栈）、`shuffle/pickN/pickOne`（随机抽取）——新页面优先 import 它们，别再手写一遍（签名见[插件开发技术参考](./plugin-development.md) §3.8）。

## 9. 生命周期：挂载、停用、热重载

- **挂载**：内核按清单装配，register 后按 key 渲染
- **停用**：物理生效——后端路由与页面 404、前端代码不再下载；**SQLite 数据保留**，重新启用即恢复
- **热重载**：改盘上的插件文件 → 管理页点"重载"→ 请求排空（在飞请求安全完成后切换）→ require 缓存逐出 → 新代码生效，**全程无需重启**
- 前端插件开关：落盘后刷新页面生效（组件类插件同理——`enabled:false` 时不被任何页面加载）

## 10. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 模块目录 | 小写+连字符 | `modules/music-draw/` |
| 组件类插件目录 | `component-<组件名>` | `modules/component-music-player/` |
| 主题插件目录 | 核心 `component-theme-<主题id>`；成员 `component-<主题id>-<名>` | `modules/component-theme-neon/`、`modules/component-neon-penlights/` |
| 后端/前端插件文件 | 固定名 | `plugin.js` / `front/plugin.js` |
| API 端点 | `/api/{功能前缀}-{资源}` | `/api/drag-process` |
| 数据库名 | 与 API 前缀对应 | `drag-process` |
| localStorage key | 功能+描述 | `dragBattleState2_player1` |
| CSS class / HTML id | 小写+连字符 | `.node-box`、`draw-music-btn` |
| JS 变量/函数 | camelCase | `drawMusic` |
| 组件名 | 小写+连字符（`registerComponent` 的公开标识） | `music-player`、`draw-machine` |
| 图标名 | 小写+连字符，须 ∈ `ICON_NAMES` | `home`、`device-gamepad-2` |

## 11. 验证清单（每步都要实际跑）

- [ ] 重启 `node server.js`，控制台 `[cordis] 装配完成` 且无 error
- [ ] 访问 `/m/my-feature/` 正常渲染；`/m/plugin-manager/` 中本插件"已挂载"无 error
- [ ] 管理页**停用再启用**：路由/页面 404 后恢复，数据不丢
- [ ] 刷新页面、二次进入，无重复渲染、无控制台红错
- [ ] 用到了组件时：管理页前端 tab 禁用该组件插件 → 刷新页面，插槽留空但页面照常工作（降级不崩）
- [ ] `node scripts/endpoint-diff.js --compare` 全绿（不破坏既有 HTTP 行为基线）

## 12. 实例索引（按需照抄）

| 实例 | 学什么 |
|------|--------|
| `modules/select/` | 最小后端插件：纯页面元数据注册 |
| `modules/drag/` | 完整范式：数据库 + 路由 + 复杂前端 + 静态骨架绑定 + cleanup |
| `modules/setting/` | 多文件前端聚合（set-*.js → front/view.js） |
| `modules/moving-sth/` | 多页面模块（游戏页 + 设置页，DOM 标记分发） |
| `modules/plugin-manager/` | 管理面：assembly 服务、config 机制、页面本身即可替换插件 |
| `modules/component-music-player/` | L2 组件范例：音乐播放 + 比赛模式归一（`body` class 引用计数、宿主 audio 只 pause 不删） |
| `modules/component-draw-machine/` | L2 组件范例：抽签/闪现动画归一（定时器登记、回调式结果交付、等概率 `pickOne`） |
| `modules/component-theme-neon/` | 主题插件范例：`theme:` 组件注册、样式/氛围层注入、localStorage + 服务端激活对账、battle-mode 守卫 |
| `modules/theme-manager/` | 主题管理页：枚举组件表自动发现主题卡、系统级主题 API（PUT id 校验 + SQLite 落盘） |
| `modules/music-draw/` | 多实例接入范例：三曲库 = 3 个 `music-player` + 3 个 `draw-machine`（数组槽位按下标一一对应） |
| `web/components/compose.mjs` | L1 装配器实现：`mountFromConfig` 的降级 / props 合并 / 多实例下标语义（配 `compose.test.js`） |

## 13. 常见坑

1. **三份清单不同步**——用脚手架，别手改
2. **inject 拼写错误** → fiber 挂起（内核校验后跳过并报 error，去管理页看）
3. **`scope.use(fn)` 无路径中间件** → 热重载排空失效，禁止
4. **监听不传 `{ signal }`** → 重渲染双绑，事件触发两次
5. **写死 `localhost:3000`** → 换环境即坏，一律 origin 相对路径
6. **改了内核/共享设施** → 后果自负；一切功能自包含于 `modules/<id>/`（唯一例外：缺图标时向 `web/icons.mjs` 追加 path）
7. **用 emoji 或自绘/粘贴 SVG 当图标** → 多份事实来源必然漂移；统一走 `web/icons.mjs` 的 `icon()` / `iconEl()`
8. **组件内模块级可变状态** → 页面同时挂载同一组件多个实例时串台（音乐播放器 P0 缺陷根因）；状态只放工厂调用的局部变量
9. **给 `document.body` 加 class 未成对移除** → 组件可能被中途卸载，残留 class 污染后续页面；同页多实例共享 body 类时用引用计数，最后一个退出者才移除
10. **多实例共享宿主 `<audio>` 不校正 `src`** → "点 A 的按钮播 B 的歌"；启动前按当前结果校正，且宿主 audio 只 pause/归零、绝不删除
11. **`[data-slot]` 宿主放在 `opacity:0` 祖先里** → 比赛模式播放器不可见；插槽宿主必须在 opacity 作用域之外
12. **组件 import 其他组件** → 单个组件禁用会级联崩溃；组件之间保持零依赖

---

出包与分发见[打包与发布](./packaging.md)；更多文档见[文档索引](./README.md)。
