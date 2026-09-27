#!/usr/bin/env node
/**
 * 模块脚手架（P5b 插件化版 + P11 组件模式）：生成插件骨架并追加装配清单
 *
 * 用法：
 *   node scripts/new-module.js <模块id> "<模块名称>" [--server]
 *   node scripts/new-module.js <组件目录id> "<组件名称>" --component [--pages a,b]
 *   示例：
 *   node scripts/new-module.js my-feature "我的功能"
 *   node scripts/new-module.js my-feature "我的功能" --server     // plugin.js 附带 db.define + server.route 模板
 *   node scripts/new-module.js my-wheel "转盘" --component --pages drag,music-draw
 *
 * 生成物（页面模块 modules/<id>/）：
 *   plugin.js          后端插件（CJS）——元数据 registerPage；--server 时含数据库+路由模板
 *   index.html         页面静态骨架（#plugin-root + /web/kernel.js 内核标签）
 *   style.css          样式
 *   front/plugin.js    前端插件（原生 ESM）——ctx.ui.register({ key: <id>, component })
 *
 * 生成物（组件类插件 modules/component-<名>/，--component，P11 §3 问 2）：
 *   front/plugin.js    组件注册（原生 ESM）——ctx.ui.registerComponent("<名>", factory)
 *   front/view.js      组件工厂实现——factory(hostEl, props, ctx) => cleanup
 *   目录 id 统一补 component- 前缀（传 "my-wheel" 与 "component-my-wheel" 等价）；
 *   不生成 index.html（组件不是页面）、不生成后端 plugin.js（纯前端资产）、不进导航。
 *
 * 清单追加（缺一不可，导航页/双端装配/管理页都以此为准）：
 *   modules/modules.json   页面元数据（须与 plugin.js 的 registerPage 逐字段一致）——仅页面模块
 *   server/plugins.json    后端装配（{ target, enabled }）——仅页面模块
 *   web/front.json         前端装配（{ target, enabled }）——页面模块；
 *                          组件模块追加 { kind: "component", pages: [...] }（P11 §3 问 6：
 *                          组件是纯前端资产，不进 modules.json / plugins.json、不进导航）
 *
 * 模块id 要求：小写字母/数字/连字符，全局唯一。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MODULES_DIR = path.join(ROOT, "modules");
const MODULES_MANIFEST = path.join(MODULES_DIR, "modules.json");
const PLUGINS_MANIFEST = path.join(ROOT, "server", "plugins.json");
const FRONT_MANIFEST = path.join(ROOT, "web", "front.json");

// ---- 参数解析 ----
// --pages 的值先摘出（支持 --pages=a,b 与 --pages a,b 两种写法），
// 否则 "a,b" 会被当成位置参数（模块名称）——位置参数过滤只认 -- 前缀。
// 缺值判定：--pages 后的 token 缺失或以 "--" 开头（如 `--pages --component`）时不消费该
// token（视作 pages 缺值），否则 "--component" 会被当成分隔符值吞掉 → 旗标静默失效。
const rawArgs = process.argv.slice(2);
let pagesArg = null;
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--pages") {
    const next = rawArgs[i + 1];
    if (next === undefined || next.startsWith("--")) {
      pagesArg = "";
      console.warn("! --pages 缺值（后随旗标或参数结束），按空 pages 处理");
      continue;
    }
    pagesArg = next;
    i++;
    continue;
  }
  if (a.startsWith("--pages=")) {
    pagesArg = a.slice("--pages=".length);
    continue;
  }
  args.push(a);
}

const serverFlag = args.includes("--server");
const componentFlag = args.includes("--component");
const positional = args.filter((a) => !a.startsWith("--"));

let id = positional[0];
const rawName = positional[1] || null;

if (!id) {
  console.error('用法: node scripts/new-module.js <模块id> "<模块名称>" [--server]');
  console.error('       node scripts/new-module.js <组件id> "<组件名称>" --component [--pages a,b]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(`非法模块id「${id}」: 仅允许小写字母/数字/连字符，且不能以连字符开头`);
  process.exit(1);
}
if (serverFlag && componentFlag) {
  console.error("--server 与 --component 互斥：组件是纯前端资产（P11 §3 问 6），不带后端插件");
  process.exit(1);
}

// ---- 组件模式（P11）：目录统一 component-<组件名>，组件名 = registerComponent 的公开标识 ----
const componentName = componentFlag
  ? id.startsWith("component-")
    ? id.slice("component-".length)
    : id
  : null;
if (componentFlag) {
  if (!componentName) {
    console.error('组件 id 缺少组件名："component-" 之后必须非空（如 component-music-wheel）');
    process.exit(1);
  }
  // 组件名比页面 id 更严：必须以字母开头。组件名会派生 JS 标识符 create<Pascal> 与 CSS
  // 类名 .<组件名>，数字/连字符开头会生成 create1x、querySelector(".1x") 这类不可运行的代码。
  if (!/^[a-z][a-z0-9-]*$/.test(componentName)) {
    console.error(
      `非法组件名「${componentName}」: 必须以小写字母开头，仅含小写字母/数字/连字符`
    );
    console.error(
      "原因：组件名会派生 JS 标识符 create<Pascal> 与 CSS 类名 .<组件名>，" +
        "以数字或连字符开头会生成无法运行的生成物（如 create1x / querySelector(\".1x\")）"
    );
    process.exit(1);
  }
  if (!id.startsWith("component-")) {
    id = `component-${componentName}`;
    console.log(`i 组件目录按约定补前缀 → modules/${id}（组件名 "${componentName}"）`);
  }
}

// 组件名 = registerComponent 的名字（kebab-case，页面侧 ctx.ui.component("<名>") 取用）
const name = rawName || componentName || id;

const targetDir = path.join(MODULES_DIR, id);
if (fs.existsSync(targetDir)) {
  console.error(`模块目录已存在: ${targetDir}`);
  process.exit(1);
}

// ---- 读取 JSON（容忍 modules.json 为顶层数组的旧格式） ----
function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// 统一写盘格式：2 空格缩进 + 尾换行（与 server/cordis/loader.js 的 persistJsonRel 一致）
function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

// ---- 生成文件 ----
fs.mkdirSync(path.join(targetDir, "front"), { recursive: true });

/** 安全写入：只允许写进本模块目录之内（relName 为脚本内硬编码常量，规范化后二次校验） */
function writeInsideModuleDir(relName, content) {
  const dstPath = path.resolve(targetDir, relName);
  const relToTarget = path.relative(targetDir, dstPath);
  if (relToTarget.startsWith("..") || path.isAbsolute(relToTarget)) {
    console.error(`拒绝写入模块目录之外的路径: ${dstPath}`);
    process.exit(1);
  }
  fs.writeFileSync(dstPath, content, "utf8");
  console.log(`✓ 生成 ${path.relative(ROOT, dstPath)}`);
}

// ========== 组件模式（--component）：只生成 front/{plugin,view}.js ==========
// 组件是纯前端资产（P11 §3 问 6）：不生成 index.html（组件不是页面）、不生成后端
// plugin.js（无路由/数据库）、不生成 style.css（避免死文件——需要时自建并由页面 <link>
// 引入 /m/<id>/style.css）。清单只追加 web/front.json 的 { kind: "component", pages }：
// 该条目同时是组件资源经 /m/<id>/ 放行的依据（server/routes/module-routes.js 的
// resolveComponentDir 按"kind=component 且 enabled"白名单回退，禁用即不服务）。
if (componentFlag) {
  const pascal = componentName
    .split("-")
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
  // pages 项 = 模块 id：非法项丢弃并 warn（拼写错要看得见），合法项去重且保持首次出现顺序
  const rawPages = String(pagesArg || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const validPages = [];
  const invalidPages = [];
  for (const p of rawPages) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(p)) validPages.push(p);
    else invalidPages.push(p);
  }
  if (invalidPages.length) {
    console.warn(
      "! --pages 丢弃非法项（pages 项须为模块 id：小写字母/数字/连字符，不以连字符开头）: " +
        invalidPages.map((p) => JSON.stringify(p)).join(", ")
    );
  }
  const pages = [...new Set(validPages)];

  const componentPluginJs = `/**
 * ${id} 前端插件（组件类，P11 §3 问 2）
 *
 * 形态：标准前端插件（enabled 由 web/front.json 条目控制，带 pages 跨页命中），
 *      但注册进的是**组件表**而非页面表：ctx.ui.registerComponent(name, factory)。
 *      kernel 只自动 render 页面条目（key = 模块 id），组件名永不被自动渲染——
 *      只在页面 component 里显式 ctx.ui.component("${componentName}") 取用时实例化。
 *
 * 组件名 "${componentName}" 是跨页公开标识；页面侧取用（P11 约定）：
 *   const factory = ctx.ui.component("${componentName}");
 *   if (factory) cleanups.push(factory(host, props, ctx));   // host = 页面插槽元素
 * 降级：组件被 enabled:false 禁用或未注册时 component() 返回 null，页面据此跳过（插槽留空）。
 *
 * 跨页命中（web/front.json 条目 pages）：${
    pages.length ? JSON.stringify(pages) : "（空 —— 需补 pages，否则永不被任何页面加载）"
  }
 * 依赖纪律：组件不得 import 其他组件——跨插件 import 会让「单独禁用」变成「级联崩溃」
 * （P11 §3 问 6 的 L2 准入条款）。
 */
import { create${pascal} } from "./view.js";

export default {
  name: "${id}",
  inject: ["ui"],
  apply(ctx) {
    // 内核组件注册表未就绪时优雅降级：不注册、不抛错（页面侧 component() 返回 null）
    if (typeof ctx.ui.registerComponent !== "function") {
      console.error("[${id}] ctx.ui.registerComponent 不可用（内核未升级），组件未注册");
      return;
    }
    ctx.ui.registerComponent("${componentName}", create${pascal});
  },
};
`;

  const componentViewJs = `/**
 * ${componentName} 组件工厂（L2 组件实现，P11 §3 问 2）
 *
 * 契约：factory(hostEl, props, ctx) => cleanup | void
 *   hostEl  专属于本实例的宿主元素（页面插槽，如 [data-slot=...]）——只操作其内部
 *   props   调用方传入的普通对象 = 清单静态 props（front.json 的 config.components）与
 *           运行时 props 的浅合并（运行时优先）；选择器类 props 先 hostEl 后 document
 *   cleanup 卸载函数（内核重渲染 / 页面卸载前调用）：解绑监听、清定时器、移除 body class
 *
 * 纪律（P11 组件纪律，违反会致缺陷）：
 *   · 所有事件监听传 { signal }（本文件 AbortController），cleanup 里 abort() 一次解绑
 *   · 给 document.body 加 class 必须成对移除（组件可能被中途卸载，残留会污染后续页面）
 *   · 禁止模块级可变状态（页面可能同时挂载同一组件的多个实例 → 实例间串台）
 *   · 定时器/interval 统一登记（本文件 timers 集合），cleanup 里全部清除
 *   · 多实例音频等独占资源：只操作 props/onReady 交付的句柄，不碰无关全局节点
 *   · 样式默认沿用页面既有 CSS 类名（改动最小）；需要独立样式就自建 style.css，
 *     并由页面 <link rel="stylesheet" href="/m/${id}/style.css"> 引入
 *   · 图标统一走 /web/icons.mjs 的 icon() / iconEl()，禁 emoji、禁内联复制 SVG path
 */

export function create${pascal}(host, props = {}, ctx) {
  const controller = new AbortController();
  const { signal } = controller;
  const timers = new Set(); // 定时器登记（cleanup 统一回收）

  // ---- 渲染（示例：替换成你的 UI）----
  host.innerHTML = \`
    <div class="${componentName}" data-component="${componentName}">
      <span class="${componentName}__text"></span>
    </div>
  \`;
  const textEl = host.querySelector(".${componentName}__text");
  if (textEl) textEl.textContent = props.text || "${name}";

  // ---- 交互（示例：经 props 回调把结果交还调用方，组件不碰持久化与网络）----
  const root = host.querySelector(".${componentName}");
  if (root) {
    root.addEventListener(
      "click",
      () => {
        if (typeof props.onClick === "function") {
          try {
            props.onClick({ host, props });
          } catch (e) {
            console.error("[${componentName}] onClick 回调抛错:", e);
          }
        }
      },
      { signal }
    );
  }

  // ---- 对外控制句柄（可选：调用方经 props.onReady 拿到 api）----
  if (typeof props.onReady === "function") {
    try {
      props.onReady({ host, api: { start, stop } });
    } catch (e) {
      console.error("[${componentName}] onReady 回调抛错:", e);
    }
  }

  /** 示例控制方法（定时器登记后 cleanup 必然回收） */
  function start() {
    if (timers.size) return;
    timers.add(
      setInterval(() => {
        /* 周期性工作 */
      }, 1000)
    );
  }
  function stop() {
    for (const id of timers) clearInterval(id);
    timers.clear();
  }

  // ---- cleanup：内核重渲染 / 页面卸载前调用 ----
  return () => {
    stop();
    controller.abort();
  };
}
`;

  // 路径均为脚本内硬编码常量（front/plugin.js / front/view.js），经 writeInsideModuleDir 越界校验
  writeInsideModuleDir("front/plugin.js", componentPluginJs);
  writeInsideModuleDir("front/view.js", componentViewJs);

  appendAssemblyEntry(FRONT_MANIFEST, "web/front.json", { kind: "component", pages });

  if (!pages.length) {
    console.warn(
      `! pages 为空 —— 组件 "${componentName}" 不会被任何页面加载；` +
        `请在 web/front.json 本条目补 pages: ["<模块id>", ...] 后刷新页面`
    );
  }
  console.log(`
完成！下一步：
  1. 编辑 modules/${id}/front/view.js 实现组件（factory(host, props, ctx) => cleanup）
  2. 页面侧取用：const f = ctx.ui.component("${componentName}"); if (f) f(host, props, ctx)
     页面插槽用 data-slot 承载；slots / 静态 props 声明在 web/front.json 的页面条目 config
  3. 刷新页面即可（组件不进导航、无后端，无需重启 server.js）；
     管理页「前端」tab 可见本组件条目（kind=component）`);
  process.exit(0);
}

// 导航 order = 现有最大 order + 1（同时写进 modules.json 条目与 registerPage，两处必须一致）
const modulesManifest = readJsonFile(MODULES_MANIFEST);
const moduleList = Array.isArray(modulesManifest) ? modulesManifest : modulesManifest.modules;
const nextOrder = moduleList.reduce((max, m) => Math.max(max, m.order || 0), 0) + 1;

// ========== modules/<id>/plugin.js（后端插件，CJS） ==========
const serverPart = serverFlag
  ? `    // ---- 数据库定义（SQLite 文档存储，落盘 resource/sqlite/y-stage.sqlite） ----
    // 库名以模块 id 为前缀，避免与其他模块冲突；原生 SQL 用 ctx.db.sql(sql, params)
    ctx.db.define([
      {
        name: "${id}-process",
        defaultValue: { phase: "idle", lastUpdate: null },
      },
    ]);

    // ---- 路由注册（必须在 apply 同步窗口内调用；scope 生命周期 = 本插件 fiber，
    // 管理页禁用/卸载时路由被物理移除，立即 404） ----
    ctx.server.route((app, { dbManager, serverLog, dataDir }) => {
      // 健康检查示例
      app.get("/api/${id}/ping", (req, res) => {
        res.json({ ok: true, module: "${id}" });
      });

      // 进度存取示例（dbManager.get 返回 lowdb v1 兼容对象：get/setState/push/write）
      app.get("/api/${id}-process", (req, res) => {
        res.json(dbManager.get("${id}-process").getState());
      });

      app.post("/api/${id}-process", (req, res) => {
        dbManager
          .get("${id}-process")
          .setState({ ...req.body, lastUpdate: new Date().toISOString() })
          .write();
        res.status(200).send("保存成功");
      });

      serverLog("${id} 模块路由已注册");
    });

`
  : `    // ---- 需要后端 API 时再补充 ----
    // 1) inject 改为 ["db", "server", "modules"]
    // 2) 数据库：ctx.db.define([{ name: "${id}-process", defaultValue: {} }])
    // 3) 路由（必须在 apply 同步窗口内调用）：
    //    ctx.server.route((app, { dbManager, serverLog }) => {
    //      app.get("/api/${id}/ping", (req, res) => res.json({ ok: true }));
    //    });
    // 4) 改完后在 /m/plugin-manager/ 对本插件点「热重载」，或重启 node server.js

`;

const pluginJs = `/**
 * ${id} 后端插件
 *
 * 契约要点：
 * - CJS：module.exports = { name, inject, apply(ctx) }
 * - inject 白名单 = server / db / modules / assembly + 清单条目 provides 声明的服务；
 *   拼写错误会让 fiber 永久挂起（装配死锁），loader 会校验并跳过该插件
 * - ctx.modules.registerPage 的字段必须与 modules/modules.json 的 ${id} 条目逐字段一致
 *   （页面元数据单一来源 = modules.json，registerPage 是其运行时声明处）
 */
module.exports = {
  name: "${id}",
  inject: [${serverFlag ? '"db", "server", "modules"' : '"modules"'}],
  apply(ctx) {
${serverPart}    // ---- 页面元数据（与 modules/modules.json 中 ${id} 条目逐字段一致） ----
    ctx.modules.registerPage({
      id: "${id}",
      name: ${JSON.stringify(name)},
      description: "模块说明",
      icon: "puzzle",
      nav: ["select"],
      order: ${nextOrder},
    });

    // 插件卸载时同步注销页面元数据（管理页停用后 /api/modules 与 /m/${id} 同步消失）
    ctx.effect(() => () => ctx.modules.unregister("${id}"));
  },
};
`;

// ========== modules/<id>/index.html（页面静态骨架） ==========
const indexHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <!-- 页面 UI 由前端插件装配：内核按 /m/${id}/ 路径解析模块 id → 读 /web/front.json →
         dynamic import /m/${id}/front/plugin.js → ctx.ui.render("${id}") 渲染进 #plugin-root。
         也可像既有模块一样在此放置静态骨架 DOM，由组件复用/增强（见 modules/drag）。 -->
    <div id="plugin-root" hidden></div>

    <!-- 前端内核（稳定 URL，实际指向构建产物 web/dist/kernel.js；404 时先 npm run build:web） -->
    <script type="module" src="/web/kernel.js"></script>
  </body>
</html>
`;

// ========== modules/<id>/style.css ==========
const styleCss = `/* ${name} —— modules/${id}/style.css
   页面内资源用同目录相对路径；共享资源用绝对路径：
   /resource/images/... /resource/json/... /resource/musics/... */

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  background: #101418;
  color: #e8eaed;
}

.${id}-page {
  text-align: center;
}

.${id}-hint {
  color: #9aa0a6;
}

.${id}-btn {
  padding: 8px 20px;
  border: 1px solid #3c4043;
  border-radius: 6px;
  background: #1e2126;
  color: #e8eaed;
  cursor: pointer;
}

.${id}-btn:hover {
  background: #2a2e33;
}
`;

// ========== modules/<id>/front/plugin.js（前端插件，原生 ESM 不打包） ==========
const frontPluginJs = `/**
 * ${id} 前端插件
 *
 * 契约要点：
 * - 原生 ESM，浏览器直接 import（/m/${id}/front/plugin.js），不要 import 内核或 Node 模块；
 *   复杂逻辑拆到本目录（如 view.js），用同目录相对 import
 * - apply 阶段只 register；DOM 操作统一放在 component 内（内核渲染时才调用）
 * - key 必须 = 模块 id "${id}"（内核按 /m/${id}/ 路径解析后以此查组件）
 * - component(el, meta, ctx)：el = #plugin-root；meta = front.json 条目的 config（无则 null）
 * - 后端 API 用 origin 相对路径（/api/...），或直接用 ctx.api.get/post/del
 * - 复杂页面可像既有模块一样操作 index.html 的静态骨架 DOM，而不是写进 el
 */

export default {
  name: "${id}-front",
  inject: ["ui", "api"],
  apply(ctx) {
    ctx.ui.register({
      key: "${id}",
      component(el, meta, ctx) {
        // 所有事件监听统一传 { signal }，cleanup 里 abort 一次性解绑
        const controller = new AbortController();
        const { signal } = controller;

        // ---- 组件 DOM：写入挂载点 #plugin-root（示例，替换成你的 UI） ----
        el.innerHTML = \`
          <section class="${id}-page">
            <h1>${name}</h1>
            <p class="${id}-hint">前端插件已装配。编辑 modules/${id}/front/plugin.js 开始开发。</p>
            <button type="button" class="${id}-btn">点我试试</button>
          </section>
        \`;

        el.querySelector(".${id}-btn").addEventListener(
          "click",
          () => {
            // 示例：调用后端（--server 生成的模板含 /api/${id}/ping）
            fetch("/api/${id}/ping").catch(() => {});
            console.log("[${id}-front] clicked, meta =", meta);
          },
          { signal }
        );

        // ---- cleanup：内核重渲染/页面卸载前调用 ----
        return () => {
          controller.abort();
        };
      },
    });
  },
};
`;

const files = [
  ["plugin.js", pluginJs],
  ["index.html", indexHtml],
  ["style.css", styleCss],
  [path.join("front", "plugin.js"), frontPluginJs],
];
for (const [rel, content] of files) {
  const dst = path.join(targetDir, rel);
  fs.writeFileSync(dst, content, "utf8");
  console.log(`✓ 生成 ${path.relative(ROOT, dst)}`);
}

// ---- 追加三份装配清单（条目已存在则跳过） ----
// 1) modules/modules.json：页面元数据
if (moduleList.some((m) => m && m.id === id)) {
  console.warn(`! modules/modules.json 已存在 id=${id}，跳过`);
} else {
  moduleList.push({
    id,
    name,
    description: "模块说明",
    icon: "puzzle",
    nav: ["select"],
    order: nextOrder,
  });
  writeJsonFile(MODULES_MANIFEST, modulesManifest);
  console.log(`✓ 已追加 modules/modules.json（nav=["select"]，order=${nextOrder}）`);
}

// 2) server/plugins.json + 3) web/front.json：双端装配条目 { target, enabled }
// extra（可选）：组件类条目的 { kind: "component", pages }（P11）——kind 是服务端放行
// 组件资源的白名单依据（server/routes/module-routes.js 的 resolveComponentDir）。
// 不传 extra 的页面模块条目仍是逐字节相同的 { target, enabled: true }。
function appendAssemblyEntry(manifestPath, label, extra) {
  const manifest = readJsonFile(manifestPath);
  const plugins = Array.isArray(manifest) ? manifest : manifest.plugins;
  if (!Array.isArray(plugins)) {
    console.warn(`! ${label} 缺 plugins 数组，未追加（请手动检查）`);
    return;
  }
  const target = `modules/${id}`;
  if (plugins.some((e) => e && (typeof e === "string" ? e : e.target) === target)) {
    console.warn(`! ${label} 已存在 ${target}，跳过`);
    return;
  }
  plugins.push({ target, enabled: true, ...(extra || {}) });
  writeJsonFile(manifestPath, manifest);
  const extraKeys = extra ? Object.keys(extra) : [];
  console.log(
    `✓ 已追加 ${label}（${target}，enabled=true${extraKeys.length ? "，" + extraKeys.join("+") : ""}）`
  );
}

appendAssemblyEntry(PLUGINS_MANIFEST, "server/plugins.json");
appendAssemblyEntry(FRONT_MANIFEST, "web/front.json");

// ---- 下一步指引 ----
console.log(`
完成！下一步：
  1. 重启 node server.js（首次或产物缺失时先 npm run build:kernel && npm run build:web）
  2. 访问 /m/${id}/（默认 http://localhost:3000/m/${id}/）
  3. 打开 /m/plugin-manager/ 确认插件已列出且「已挂载」
提示：改动 plugin.js 后可在管理页对该插件「热重载」；改动 front/ 代码刷新页面即可。`);
