/**
 * web 前端内核单测 —— P3a（node 侧，无浏览器/DOM）
 *
 * 覆盖：
 *   - loader.mjs 纯逻辑：清单解析/enabled 过滤/target 匹配/pages 覆盖/moduleId 解析/inject 白名单
 *   - kernel.mjs assemblePage 全流程（真 cordis Context + 真 ui/api/state 服务 + 假插件）：
 *     挂载注册组件 → render 注入 container、kernel:ready 事件、cleanup 契约、占位渲染、
 *     enabled:false 不 import、未知 inject 跳过
 *   - api.mjs 走真 http.Server：JSON/纯文本/非 2xx throw 带 status
 *   - 静态接线回归：/web/kernel.js 别名 → web/dist/kernel.js、/web/front.json 直读
 *
 * 风格跟随 server/http/static.test.js：真实 http.Server 验证静态层；harness 用 server/test-lib。
 * 源文件为 .mjs（根 package.json "type":"commonjs"，.js 的 ESM 语法 node 无法解析），
 * 本文件保持 CJS 经动态 import() 加载被测模块。
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { test, runTests, assert } = require("../server/test-lib");

const APP_ROOT = path.join(__dirname, "..");
const importLoader = () => import("./loader.mjs");
const importKernel = () => import("./kernel.mjs");
const importApi = () => import("./api.mjs");

const VALID_MANIFEST = {
  provider: { ui: "dom" },
  plugins: [
    { target: "modules/select", enabled: true },
    { target: "modules/setting", enabled: true },
    { target: "modules/drag", enabled: false },
    { target: "modules/group-battle", config: { teams: 3 } },
  ],
};

// ---- loader.mjs 纯逻辑 ----

test("parseManifest：合法清单原样返回", async () => {
  const { parseManifest } = await importLoader();
  const m = parseManifest(JSON.stringify(VALID_MANIFEST));
  assert.deepStrictEqual(m, VALID_MANIFEST);
});

test("parseManifest：损坏 JSON / 缺 plugins 数组 → null", async () => {
  const { parseManifest } = await importLoader();
  assert.strictEqual(parseManifest("{oops"), null);
  assert.strictEqual(parseManifest('{"provider":{}}'), null);
  assert.strictEqual(parseManifest("null"), null);
  assert.strictEqual(parseManifest(""), null);
});

test("targetId：对象/字符串条目，非法 → null", async () => {
  const { targetId } = await importLoader();
  assert.strictEqual(targetId({ target: "modules/select" }), "select");
  assert.strictEqual(targetId("modules/drag"), "drag");
  assert.strictEqual(targetId({ target: "other/x" }), null);
  assert.strictEqual(targetId({ enabled: true }), null);
  assert.strictEqual(targetId(null), null);
});

test("moduleIdFromPath：/m/<id> 各形态，非 /m → null", async () => {
  const { moduleIdFromPath } = await importLoader();
  assert.strictEqual(moduleIdFromPath("/m/select/"), "select");
  assert.strictEqual(moduleIdFromPath("/m/select"), "select");
  assert.strictEqual(moduleIdFromPath("/m/select/index.html"), "select");
  assert.strictEqual(moduleIdFromPath("/m/group-battle?foo=1"), "group-battle");
  // 主页三态（home 由根静态层服务，"/"与"/index.html"同归 home 模块）
  assert.strictEqual(moduleIdFromPath("/"), "home");
  assert.strictEqual(moduleIdFromPath("/index.html"), "home");
  assert.strictEqual(moduleIdFromPath("/m/x/"), "x");
  assert.strictEqual(moduleIdFromPath("/m/"), null);
  assert.strictEqual(moduleIdFromPath("/api/modules"), null);
  assert.strictEqual(moduleIdFromPath(""), null);
});

test("pluginsForPage：enabled 过滤 + 单页匹配 + 字符串条目", async () => {
  const { parseManifest, pluginsForPage } = await importLoader();
  const m = parseManifest(JSON.stringify(VALID_MANIFEST));
  const hit = pluginsForPage(m, "select");
  assert.strictEqual(hit.length, 1);
  assert.strictEqual(hit[0].target, "modules/select");
  // enabled:false 不命中；config 条目（缺省视为 enabled）正常命中
  assert.deepStrictEqual(pluginsForPage(m, "drag"), []);
  assert.strictEqual(pluginsForPage(m, "group-battle").length, 1);
  assert.deepStrictEqual(pluginsForPage(m, "home"), []);
  // 字符串条目 + 空/坏清单
  assert.strictEqual(pluginsForPage({ plugins: ["modules/rank"] }, "rank").length, 1);
  assert.deepStrictEqual(pluginsForPage(null, "select"), []);
  assert.deepStrictEqual(pluginsForPage(m, null), []);
});

test("matchPage：pages 数组覆盖默认单页匹配（跨页插件预留）", async () => {
  const { matchPage, pluginsForPage } = await importLoader();
  const cross = { target: "modules/battle-common", pages: ["drag", "select"] };
  assert.strictEqual(matchPage(cross, "drag"), true);
  assert.strictEqual(matchPage(cross, "select"), true);
  assert.strictEqual(matchPage(cross, "setting"), false);
  assert.strictEqual(matchPage({ target: "modules/select" }, "select"), true);
  const m = { plugins: [cross, { target: "modules/select", enabled: false }] };
  assert.strictEqual(pluginsForPage(m, "drag").length, 1);
});

test("matchPage/pluginsForPage：可选元数据 kind 不影响匹配（组件库条目 kind:'component'）", async () => {
  const { pluginsForPage } = await importLoader();
  // P11：front.json 条目可带 kind（组件库），loader 只读 target/pages/enabled，未知字段原样透传
  const m = {
    plugins: [
      { target: "modules/component-music-player", kind: "component", pages: ["drag", "battle-group1"] },
      { target: "modules/drag" },
      { target: "modules/component-off", kind: "component", pages: ["drag"], enabled: false },
    ],
  };
  const hit = pluginsForPage(m, "drag");
  assert.deepStrictEqual(hit.map((e) => e.target), ["modules/component-music-player", "modules/drag"]);
  assert.strictEqual(hit[0].kind, "component", "kind 原样透传（kernel 不解释该字段）");
  assert.deepStrictEqual(pluginsForPage(m, "select"), []);
});

test("primaryEntry：本模块条目优先，缺省回退首条", async () => {
  const { primaryEntry } = await importLoader();
  const entries = [
    { target: "modules/battle-common", pages: ["drag"] },
    { target: "modules/drag", config: { a: 1 } },
  ];
  assert.strictEqual(primaryEntry(entries, "drag").target, "modules/drag");
  assert.strictEqual(primaryEntry([entries[0]], "drag").target, "modules/battle-common");
  assert.strictEqual(primaryEntry([], "drag"), null);
});

test("unknownInjects：string/array inject，白名单 ui/api/state", async () => {
  const { unknownInjects } = await importLoader();
  assert.deepStrictEqual(unknownInjects({ inject: ["ui", "api"] }), []);
  assert.deepStrictEqual(unknownInjects({ inject: "ui" }), []);
  assert.deepStrictEqual(unknownInjects({ inject: ["ui", "server"] }), ["server"]);
  assert.deepStrictEqual(unknownInjects({ inject: ["uui"] }), ["uui"]);
  assert.deepStrictEqual(unknownInjects({}), []);
});

// ---- kernel.mjs assemblePage 全流程（真 cordis + 真服务 + 假插件） ----

/** 最小 fake container（ui.render 只依赖 innerHTML 属性，无需真实 DOM） */
function fakeContainer() {
  return { innerHTML: "" };
}

function makeDragPlugin() {
  const calls = { mounted: 0, rendered: 0, cleanups: 0 };
  return {
    calls,
    exported: {
      name: "drag-front",
      inject: ["ui", "state"],
      apply(ctx) {
        calls.mounted += 1;
        ctx.ui.register({
          key: "drag",
          component: (el, meta) => {
            calls.rendered += 1;
            calls.renderMeta = meta;
            el.innerHTML = `<div data-plugin="drag">${JSON.stringify(meta)}</div>`;
            return () => {
              calls.cleanups += 1;
            };
          },
        });
      },
    },
  };
}

test("assemblePage：启用插件挂载注册 → render 注入 container（meta 带 config）", async () => {
  const { assemblePage } = await importKernel();
  const plugin = makeDragPlugin();
  const container = fakeContainer();
  const manifest = {
    plugins: [
      { target: "modules/drag", config: { totalCount: 12 } },
      { target: "modules/select" },
    ],
  };
  const loaded = [];
  const { errors } = await assemblePage({
    moduleId: "drag",
    manifest,
    container,
    loadPlugin: async (id) => (loaded.push(id), plugin.exported),
  });
  assert.strictEqual(errors.length, 0);
  assert.deepStrictEqual(loaded, ["drag"]); // enabled 过滤 + 页面匹配后只有 drag
  assert.strictEqual(plugin.calls.mounted, 1);
  assert.strictEqual(plugin.calls.rendered, 1);
  assert.strictEqual(plugin.calls.cleanups, 0);
  assert.ok(container.innerHTML.includes('data-plugin="drag"'));
  assert.deepStrictEqual(plugin.calls.renderMeta, { totalCount: 12 });
});

test("assemblePage：kernel:ready 在全部插件挂载后发出", async () => {
  const { assemblePage, createFrontendRoot } = await importKernel();
  const events = [];
  // 两个条目都命中 drag 页（其一经 pages 覆盖，模拟跨页插件）
  const manifest = {
    plugins: [
      { target: "modules/drag" },
      { target: "modules/battle-common", pages: ["drag"] },
    ],
  };
  await assemblePage({
    moduleId: "drag",
    manifest,
    container: fakeContainer(),
    createRoot() {
      const ctx = createFrontendRoot();
      ctx.on("kernel:ready", (payload) => events.push({ ...payload, at: events.length }));
      return ctx;
    },
    loadPlugin: async (id) => ({
      name: id,
      inject: ["ui"],
      apply() {
        events.push(`mounted:${id}`);
      },
    }),
  });
  assert.deepStrictEqual(events, ["mounted:drag", "mounted:battle-common", { moduleId: "drag", at: 2 }]);
});

test("assemblePage：enabled:false 不 import；挂载失败收集进 errors 不中断后续", async () => {
  const { assemblePage } = await importKernel();
  const loaded = [];
  const manifest = {
    plugins: [
      { target: "modules/drag", enabled: false },
      { target: "modules/broken", pages: ["drag"] },
      { target: "modules/select", pages: ["drag"] },
    ],
  };
  const { ctx, errors } = await assemblePage({
    moduleId: "drag",
    manifest,
    container: fakeContainer(),
    log: () => {}, // 静音预期内报错
    loadPlugin: async (id) => {
      loaded.push(id);
      if (id === "broken") throw new Error("boom");
      return {
        name: id,
        inject: ["ui"],
        apply(ctx2) {
          ctx2.ui.register({ key: id, component: (el) => (el.innerHTML = "<b>x</b>") });
        },
      };
    },
  });
  assert.deepStrictEqual(loaded, ["broken", "select"]); // drag 被禁用未加载
  assert.strictEqual(errors.length, 1);
  assert.ok(/boom/.test(errors[0].message));
  assert.ok(ctx.ui, "后续插件装配未中断");
});

test("assemblePage：未知 inject 的插件跳过（防 fiber PENDING 死锁）", async () => {
  const { assemblePage } = await importKernel();
  const { errors } = await assemblePage({
    moduleId: "drag",
    manifest: { plugins: [{ target: "modules/drag" }] },
    container: fakeContainer(),
    log: () => {},
    loadPlugin: async () => ({ name: "bad", inject: ["server"], apply() {} }),
  });
  assert.strictEqual(errors.length, 1);
  assert.ok(/未知服务/.test(errors[0].message));
});

test("assemblePage：key 未注册组件 → 占位提示；null moduleId 不渲染", async () => {
  const { assemblePage } = await importKernel();
  const container = fakeContainer();
  await assemblePage({
    moduleId: "home", // 清单里没有 home
    manifest: VALID_MANIFEST,
    container,
    loadPlugin: async () => {
      throw new Error("不应加载");
    },
  });
  assert.ok(container.innerHTML.includes("插件未启用或未提供界面"));

  const empty = fakeContainer();
  const { ctx } = await assemblePage({
    moduleId: null,
    manifest: null,
    container: empty,
    loadPlugin: async () => {
      throw new Error("不应加载");
    },
  });
  assert.strictEqual(empty.innerHTML, "");
  assert.ok(ctx.ui, "空清单仍产出可用 root");
});

test("ui 契约：重复 render 先调旧 cleanup；unregister 当前 key 触发 cleanup", async () => {
  const { assemblePage } = await importKernel();
  const drag = makeDragPlugin();
  const select = {
    name: "select-front",
    inject: ["ui"],
    apply(ctx) {
      ctx.ui.register({
        key: "select",
        component: (el) => {
          el.innerHTML = "<div data-plugin='select'></div>";
          return () => {};
        },
      });
    },
  };
  const container = fakeContainer();
  const plugins = { drag: drag.exported, select };
  const { ctx } = await assemblePage({
    moduleId: "drag",
    // select 借 pages 命中 drag 页，两个组件都注册后才能验证切换渲染
    manifest: { plugins: [{ target: "modules/drag" }, { target: "modules/select", pages: ["drag"] }] },
    container,
    loadPlugin: (id) => plugins[id],
  });
  // 手动重渲染另一 key：旧 cleanup 先被调用
  ctx.ui.render("select", null, container);
  assert.strictEqual(drag.calls.cleanups, 1);
  assert.ok(container.innerHTML.includes("data-plugin='select'"));
  // unregister 当前渲染中的 key → cleanup + 清空容器（残留失效 DOM）；再 render 同 key → 占位
  ctx.ui.unregister("select");
  assert.strictEqual(drag.calls.cleanups, 1);
  assert.strictEqual(container.innerHTML, "");
  ctx.ui.render("select", null, container);
  assert.ok(container.innerHTML.includes("插件未启用或未提供界面"));
  // register 参数校验
  assert.throws(() => ctx.ui.register({ component: () => {} }), /key/);
});

test("state 契约：set/get + state:changed 广播 { key, val }", async () => {
  const { assemblePage, createFrontendRoot } = await importKernel();
  const seen = [];
  const manifest = { plugins: [{ target: "modules/drag" }] };
  const { ctx } = await assemblePage({
    moduleId: "drag",
    manifest,
    container: fakeContainer(),
    createRoot() {
      const root = createFrontendRoot();
      root.on("state:changed", (p) => seen.push(p));
      return root;
    },
    loadPlugin: async () => ({ name: "d", inject: [], apply() {} }),
  });
  ctx.state.set("round", 2);
  assert.strictEqual(ctx.state.get("round"), 2);
  assert.strictEqual(ctx.state.get("nope"), undefined);
  assert.deepStrictEqual(seen, [{ key: "round", val: 2 }]);
});

// ---- api 服务（真 http.Server） ----

test("api：get JSON / post 回显 / 纯文本回退 / 非 2xx throw 带 status", async () => {
  const { installApi } = await importApi();
  const { Context } = await import("cordis");
  const server = http.createServer((req, res) => {
    if (req.url === "/api/ping") {
      res.type = "application/json";
      res.setHeader("Content-Type", "application/json");
      res.end('{"ok":true}');
    } else if (req.url === "/api/echo" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ received: JSON.parse(body) }));
      });
    } else if (req.url === "/api/text") {
      res.end("保存成功"); // 无 JSON Content-Type，验证纯文本回退
    } else if (req.url === "/api/boom") {
      res.statusCode = 500;
      res.end("炸了");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ctx = new Context();
    const api = installApi(ctx, { base });
    assert.deepStrictEqual(await api.get("/api/ping"), { ok: true });
    assert.deepStrictEqual(await api.post("/api/echo", { a: 1 }), { received: { a: 1 } });
    assert.strictEqual(await api.get("/api/text"), "保存成功");
    await assert.rejects(
      () => api.get("/api/boom"),
      (e) => e.status === 500 && /HTTP 500/.test(e.message)
    );
    await assert.rejects(
      () => api.get("/api/missing"),
      (e) => e.status === 404
    );
    // 服务已 provide：插件可经 ctx.api 访问
    assert.strictEqual(ctx.api, api);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---- 静态服务接线回归（server/http/static.js 的 /web 别名，真实 HTTP） ----

function staticOnlyApp() {
  const { createApp } = require("../server/http/index");
  const createStaticMiddleware = require("../server/http/static");
  const { APP_ROOT: ROOT } = require("../server/utils");
  const app = createApp();
  app.use(createStaticMiddleware({ APP_ROOT: ROOT }));
  return app;
}

async function withServer(app, fn) {
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0);
    s.once("listening", () => resolve(s));
    s.once("error", reject);
  });
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function get(port, reqPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: reqPath }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: res.headers["content-type"] || "",
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    }).on("error", reject);
  });
}

test("静态接线：GET /web/front.json → 200 JSON 且 provider.ui=dom", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    const r = await get(port, "/web/front.json");
    assert.strictEqual(r.status, 200);
    assert.ok(r.type.includes("application/json"), r.type);
    assert.strictEqual(JSON.parse(r.body).provider.ui, "dom");
  });
});

test("静态接线：GET /web/kernel.js → 200 且为 JS（产物缺失则跳过）", async () => {
  const dist = path.join(APP_ROOT, "web", "dist", "kernel.js");
  if (!fs.existsSync(dist)) {
    console.log("  SKIP /web/kernel.js —— web/dist/kernel.js 不存在（先运行 npm run build:web）");
    return;
  }
  await withServer(staticOnlyApp(), async (port) => {
    const r = await get(port, "/web/kernel.js");
    assert.strictEqual(r.status, 200);
    assert.ok(r.type.includes("javascript"), r.type);
    assert.ok(r.body.length > 1000, "bundle 不应为空");
  });
});

if (require.main === module) {
  runTests("web/loader.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
