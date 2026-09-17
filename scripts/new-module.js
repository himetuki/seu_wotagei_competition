#!/usr/bin/env node
/**
 * 模块脚手架（P5b 插件化版）：生成一对插件骨架并追加三份装配清单
 *
 * 用法：
 *   node scripts/new-module.js <模块id> "<模块名称>" [--server]
 *   示例：
 *   node scripts/new-module.js my-feature "我的功能"
 *   node scripts/new-module.js my-feature "我的功能" --server   // plugin.js 附带 db.define + server.route 模板
 *
 * 生成物（modules/<id>/）：
 *   plugin.js          后端插件（CJS）——元数据 registerPage；--server 时含数据库+路由模板
 *   index.html         页面静态骨架（#plugin-root + /web/kernel.js 内核标签）
 *   style.css          样式
 *   front/plugin.js    前端插件（原生 ESM）——ctx.ui.register({ key: <id>, component })
 *
 * 清单追加（缺一不可，导航页/双端装配/管理页都以此为准）：
 *   modules/modules.json   页面元数据（须与 plugin.js 的 registerPage 逐字段一致）
 *   server/plugins.json    后端装配（{ target, enabled }）
 *   web/front.json         前端装配（{ target, enabled }）
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
const args = process.argv.slice(2);
const serverFlag = args.includes("--server");
const positional = args.filter((a) => !a.startsWith("--"));

const id = positional[0];
const name = positional[1] || id;

if (!id) {
  console.error('用法: node scripts/new-module.js <模块id> "<模块名称>" [--server]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(`非法模块id「${id}」: 仅允许小写字母/数字/连字符，且不能以连字符开头`);
  process.exit(1);
}

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
function appendAssemblyEntry(manifestPath, label) {
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
  plugins.push({ target, enabled: true });
  writeJsonFile(manifestPath, manifest);
  console.log(`✓ 已追加 ${label}（${target}，enabled=true）`);
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
