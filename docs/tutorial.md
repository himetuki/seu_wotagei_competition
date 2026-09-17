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

## 6. 页面与静态骨架

`index.html` 最小骨架：

```html
<body>
  <div id="plugin-root"></div>
  <script type="module" src="/web/kernel.js"></script>
</body>
```

也可以像 `modules/drag/` 那样把完整静态骨架（控制条、音频元素等）直接写进 HTML，组件只负责绑定既有 DOM 与渲染动态内容——改动更小、样式零回归，复杂页面推荐此法。多页面模块（如 `moving-sth` 的设置页）每页都放内核标签，前端组件内按 DOM 标记分发。

## 7. 持久化双写模板（赛制类模块）

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

## 8. 生命周期：挂载、停用、热重载

- **挂载**：内核按清单装配，register 后按 key 渲染
- **停用**：物理生效——后端路由与页面 404、前端代码不再下载；**SQLite 数据保留**，重新启用即恢复
- **热重载**：改盘上的插件文件 → 管理页点"重载"→ 请求排空（在飞请求安全完成后切换）→ require 缓存逐出 → 新代码生效，**全程无需重启**
- 前端插件开关：落盘后刷新页面生效

## 9. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 模块目录 | 小写+连字符 | `modules/music-draw/` |
| 后端/前端插件文件 | 固定名 | `plugin.js` / `front/plugin.js` |
| API 端点 | `/api/{功能前缀}-{资源}` | `/api/drag-process` |
| 数据库名 | 与 API 前缀对应 | `drag-process` |
| localStorage key | 功能+描述 | `dragBattleState2_player1` |
| CSS class / HTML id | 小写+连字符 | `.node-box`、`draw-music-btn` |
| JS 变量/函数 | camelCase | `drawMusic` |
| 图标名 | 小写+连字符，须 ∈ `ICON_NAMES` | `home`、`device-gamepad-2` |

## 10. 验证清单（每步都要实际跑）

- [ ] 重启 `node server.js`，控制台 `[cordis] 装配完成` 且无 error
- [ ] 访问 `/m/my-feature/` 正常渲染；`/m/plugin-manager/` 中本插件"已挂载"无 error
- [ ] 管理页**停用再启用**：路由/页面 404 后恢复，数据不丢
- [ ] 刷新页面、二次进入，无重复渲染、无控制台红错
- [ ] `node scripts/endpoint-diff.js --compare` 全绿（不破坏既有 HTTP 行为基线）

## 11. 实例索引（按需照抄）

| 实例 | 学什么 |
|------|--------|
| `modules/select/` | 最小后端插件：纯页面元数据注册 |
| `modules/drag/` | 完整范式：数据库 + 路由 + 复杂前端 + 静态骨架绑定 + cleanup |
| `modules/setting/` | 多文件前端聚合（set-*.js → front/view.js） |
| `modules/moving-sth/` | 多页面模块（游戏页 + 设置页，DOM 标记分发） |
| `modules/plugin-manager/` | 管理面：assembly 服务、config 机制、页面本身即可替换插件 |

## 12. 常见坑

1. **三份清单不同步**——用脚手架，别手改
2. **inject 拼写错误** → fiber 挂起（内核校验后跳过并报 error，去管理页看）
3. **`scope.use(fn)` 无路径中间件** → 热重载排空失效，禁止
4. **监听不传 `{ signal }`** → 重渲染双绑，事件触发两次
5. **写死 `localhost:3000`** → 换环境即坏，一律 origin 相对路径
6. **改了内核/共享设施** → 后果自负；一切功能自包含于 `modules/<id>/`（唯一例外：缺图标时向 `web/icons.mjs` 追加 path）
7. **用 emoji 或自绘/粘贴 SVG 当图标** → 多份事实来源必然漂移；统一走 `web/icons.mjs` 的 `icon()` / `iconEl()`

---

出包与分发见[打包与发布](./packaging.md)；更多文档见[文档索引](./README.md)。
