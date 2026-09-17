/**
 * server/cordis/services/server.js — ctx.server 单元测试（真实 cordis Context + y-router）
 *
 * 覆盖：route(cb) 注册进 per-plugin scope（__enterScope 窗口期归位）；cb 注入形状
 * (app, { dbManager, serverLog, dataDir }) 与原 module-loader applyModuleRoutes（已移除）一致；
 * __exitScope → removeScope 物理移除（卸载插件后路由立即 404）；双插件 scope 隔离；
 * 重复 __exitScope 不误伤 root 层；经生产包装 wrapPlugin + fiber.dispose 的端到端
 * 生命周期（selfcheck A4 的 mock 分发快路径版）。
 * P6a 请求排空：drainScope 等在飞慢请求 / 排空期新请求 503 / resume 恢复；loader
 * 卸载顺序（reload = 排空先于 dispose，重挂完成恢复接客；disable 排空后 404）。
 */
const { test, runTests, assert, dispatch } = require("../../test-lib");
const { createApp } = require("../../http");
const { createBackendRoot } = require("../kernel.cjs");
const { wrapPlugin } = require("../loader");

function makeRoot() {
  const app = createApp();
  const logs = [];
  const { ctx } = createBackendRoot({
    app,
    dbManager: {}, // server 服务测试不触库
    serverLog: (...a) => logs.push(a.map(String).join(" ")),
  });
  return { app, ctx, logs };
}

test("ctx.server.app 即注入的 app；log() 汇入 serverLog（空格拼接）", () => {
  const { app, ctx, logs } = makeRoot();
  assert.strictEqual(ctx.server.app, app);
  ctx.server.log("a", 1, true);
  assert.deepStrictEqual(logs, ["a 1 true"]);
});

test("route(cb) 非函数回调抛错", () => {
  const { ctx } = makeRoot();
  assert.throws(() => ctx.server.route(null), /回调/);
  assert.throws(() => ctx.server.route("nope"), /回调/);
});

test("route(cb) 注入形状 (app, { dbManager, serverLog, dataDir }) 与原 applyModuleRoutes 一致", () => {
  const { app, ctx } = makeRoot();
  let seenArgs = null;
  ctx.server.route((a, inject) => { seenArgs = { app: a, inject }; });
  // 首参是 scope 注册面（与 Express app 同面：get/post/put/delete/all/use），模块
  // routes.js 零改动迁移即依赖这一面；scope 外注册时 __scope 标为 "root"
  for (const k of ["get", "post", "put", "delete", "all", "use"]) {
    assert.strictEqual(typeof seenArgs.app[k], "function", k);
  }
  assert.strictEqual(seenArgs.app.__scope, "root");
  assert.strictEqual(ctx.server.app, app); // 全局 app 仍经 ctx.server.app 暴露
  assert.deepStrictEqual(Object.keys(seenArgs.inject).sort(), ["dataDir", "dbManager", "serverLog"]);
});

test("__enterScope 窗口内 route(cb) 的层归入该 scope 并可正常服务", () => {
  const { app, ctx } = makeRoot();
  ctx.server.__enterScope("plugin:t");
  ctx.server.route((a) => {
    a.get("/probe", (req, res) => res.json({ ok: 1 }));
  });
  const { res } = dispatch(app, "GET", "/probe");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), '{"ok":1}');
});

test("__exitScope 物理移除：该 scope 路由立即 404，其他 scope 不受影响", () => {
  const { app, ctx } = makeRoot();
  ctx.server.__enterScope("plugin:p1");
  ctx.server.route((a) => a.get("/p1", (req, res) => res.end("one")));
  ctx.server.__enterScope("plugin:p2");
  ctx.server.route((a) => a.get("/p2", (req, res) => res.end("two")));
  ctx.server.__exitScope("plugin:p2");
  assert.strictEqual(dispatch(app, "GET", "/p2").res.statusCode, 404);
  assert.strictEqual(dispatch(app, "GET", "/p1").res.body(), "one");
});

test("__exitScope 后 currentScope 复位 root：后续 route() 不再归入已卸载 scope", () => {
  const { app, ctx } = makeRoot();
  ctx.server.__enterScope("plugin:p1");
  ctx.server.__exitScope("plugin:p1");
  let registered = false;
  ctx.server.route((a) => {
    registered = true;
    a.get("/after-exit", (req, res) => res.end("alive"));
  });
  assert.ok(registered);
  assert.strictEqual(dispatch(app, "GET", "/after-exit").res.body(), "alive");
  // 再次 __exitScope("plugin:p1")（双 dispose 防御）不误伤 root 层
  ctx.server.__exitScope("plugin:p1");
  assert.strictEqual(dispatch(app, "GET", "/after-exit").res.body(), "alive");
});

test("经生产包装 wrapPlugin 挂载：fiber.dispose() 后 route 物理消失（端到端）", async () => {
  const { app, ctx } = makeRoot();
  let routeInstalled = false;
  const probe = {
    name: "__unit_probe",
    inject: ["server"],
    apply(c) {
      c.server.route((a) => {
        routeInstalled = true;
        a.get("/__unit_probe", (req, res) => res.json({ ok: 1 }));
      });
    },
  };
  const fiber = await ctx.plugin(wrapPlugin(probe, "__unit_probe", ctx.server));
  assert.ok(routeInstalled);
  assert.strictEqual(dispatch(app, "GET", "/__unit_probe").res.statusCode, 200);
  await fiber.dispose();
  assert.strictEqual(dispatch(app, "GET", "/__unit_probe").res.statusCode, 404);
});

// ---- P6a 请求排空（ctx.server + y-router 集成，loader 卸载顺序）----

test("P6a：drainScope 等在飞慢请求；排空期新请求 503；resume 后恢复 200", async () => {
  const { app, ctx } = makeRoot();
  let finish;
  const probe = {
    name: "__drain_probe",
    inject: ["server"],
    apply(c) {
      c.server.route((a) => {
        a.get("/__slow", (req, res) => { finish = () => res.json({ ok: 1 }); });
      });
    },
  };
  await ctx.plugin(wrapPlugin(probe, "__drain_probe", ctx.server));
  const slow = dispatch(app, "GET", "/__slow"); // handler 已执行、响应挂起
  let settled = null;
  const drainP = app.__router.drainScope("plugin:__drain_probe").then((v) => { settled = v; });
  await new Promise(setImmediate);
  assert.strictEqual(settled, null); // 在飞未归零 → 等待
  const blocked = dispatch(app, "GET", "/__slow");
  assert.strictEqual(blocked.res.statusCode, 503);
  assert.strictEqual(JSON.parse(blocked.res.body()).error, "plugin __drain_probe is reloading");
  finish();
  await drainP;
  assert.strictEqual(settled.forced, false);
  assert.strictEqual(slow.res.statusCode, 200); // 在飞请求正常完成
  app.__router.resumeScope("plugin:__drain_probe");
  assert.strictEqual(dispatch(app, "GET", "/__slow").res.statusCode, 200);
});

test("loader：reload 排空先于 dispose（在飞未归零不卸载），重挂完成恢复接客；disable 后 404", async () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const paths = require("../../paths.cjs");
  const loader = require("../loader");
  const probeDir = path.join(paths.modulesDir(), "__cordis_loader_probe");
  const manifestPath = path.join(os.tmpdir(), "plugins.loader-drain-test.json");
  // 探针插件：30ms 慢 handler + 挂载代数（globalThis 跨 require.cache 逐出存活）
  const probeSrc = [
    "const g = globalThis;",
    "module.exports = {",
    '  name: "__cordis_loader_probe",',
    '  inject: ["server"],',
    "  apply(ctx) {",
    "    g.__loaderProbeGen = (g.__loaderProbeGen || 0) + 1;",
    "    const gen = g.__loaderProbeGen;",
    "    ctx.server.route((app) => {",
    '      app.get("/__loader_probe", (req, res) => {',
    "        setTimeout(() => res.json({ gen }), 30);",
    "      });",
    "    });",
    "    ctx.effect(() => () => { g.__loaderProbeDisposals = (g.__loaderProbeDisposals || 0) + 1; });",
    "  },",
    "};",
  ].join("\n");
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, "plugin.js"), probeSrc);
  fs.writeFileSync(manifestPath, JSON.stringify({
    provider: { server: "y-router", db: "sqlite" },
    plugins: [],
  }));
  const g = globalThis;
  g.__loaderProbeGen = 0;
  g.__loaderProbeDisposals = 0;
  try {
    const app = createApp();
    await loader.assembleBackend({
      app,
      dbManager: {}, // 不触库（与 makeRoot 同款空 manager）
      serverLog: () => {},
      pluginsPath: manifestPath, // 装配写盘/清单读取均改道 tmp
    });
    await loader.mountPlugin("__cordis_loader_probe", null, { evict: true });
    const slow = dispatch(app, "GET", "/__loader_probe"); // 慢请求进入 handler（挂起）
    const reloadP = loader.mountPlugin("__cordis_loader_probe", null, { evict: true }); // K2 → 排空 → 卸旧 → 重挂
    await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(g.__loaderProbeDisposals, 0); // 排空先于 dispose：在飞未归零不卸载
    assert.strictEqual(dispatch(app, "GET", "/__loader_probe").res.statusCode, 503); // 排空期拒新
    await reloadP;
    assert.strictEqual(g.__loaderProbeDisposals, 1); // 排空完成后旧 fiber 恰卸载一次
    assert.strictEqual(slow.res.statusCode, 200); // 在飞慢请求跨 reload 存活
    assert.strictEqual(JSON.parse(slow.res.body()).gen, 1); // 由旧 handler 应答
    const fresh = dispatch(app, "GET", "/__loader_probe");
    await new Promise((r) => setTimeout(r, 45)); // 新 handler 同为 30ms 慢响应
    assert.strictEqual(fresh.res.statusCode, 200); // 重挂完成恢复接客（非 503 非 404）
    assert.strictEqual(JSON.parse(fresh.res.body()).gen, 2); // 新 handler 生效
    await loader.unmountPlugin("__cordis_loader_probe", { drain: "clear" });
    assert.strictEqual(dispatch(app, "GET", "/__loader_probe").res.statusCode, 404); // disable 语义
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
    fs.rmSync(manifestPath, { force: true });
    delete g.__loaderProbeGen;
    delete g.__loaderProbeDisposals;
  }
});


// ---- P6b 终审 [P2]：assembly per-id 串行 + mountPlugin keep 标记堵漏 ----

test('assembly：并发 toggle 交错（off 排空期间 on 提交）→ 串行执行，终态一致', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const paths = require('../../paths.cjs');
  const loader = require('../loader');
  const probeDir = path.join(paths.modulesDir(), '__cordis_probe_async');
  const manifestPath = path.join(os.tmpdir(), 'plugins.async-test.json');
  const probeSrc = [
    'const g = globalThis;',
    'module.exports = {',
    '  name: "__cordis_probe_async",',
    '  inject: ["server"],',
    '  apply(ctx) {',
    '    ctx.server.route((app) => {',
    '      app.get("/__probe_async", (req, res) => {',
    '        setTimeout(() => res.json({ ok: 1 }), 30);',
    '      });',
    '    });',
    '    ctx.effect(() => () => { g.__asyncProbeDisposals = (g.__asyncProbeDisposals || 0) + 1; });',
    '  },',
    '};',
  ].join('\n');
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, 'plugin.js'), probeSrc);
  fs.writeFileSync(manifestPath, JSON.stringify({
    provider: { server: 'y-router', db: 'sqlite' },
    plugins: [{ target: 'modules/__cordis_probe_async' }],
  }));
  const g = globalThis;
  g.__asyncProbeDisposals = 0;
  const ID = '__cordis_probe_async';
  try {
    const app = createApp();
    const { ctx } = await loader.assembleBackend({
      app,
      dbManager: {},
      serverLog: () => {},
      pluginsPath: manifestPath,
    });
    const assembly = ctx.assembly;
    await loader.mountPlugin(ID, null, { evict: true });
    g.__asyncProbeDisposals = 0; // 基线重置：扣除 boot/explicit 挂载产生的旧 dispose

    // 在飞慢请求挂起 → off（drain 等待）与 on 几乎同时提交
    dispatch(app, 'GET', '/__probe_async');
    const pOff = assembly.toggle(ID, false);
    const pOn = assembly.toggle(ID, true);
    await new Promise((r) => setTimeout(r, 5));
    // 串行断言：on 不得在 off 完成前开始挂载（此刻仍在飞、未 dispose）
    assert.strictEqual(g.__asyncProbeDisposals, 0, 'off 侧 drain 期间不得提前 dispose');

    const rOff = await pOff;
    const rOn = await pOn;
    assert.strictEqual(rOff.ok, true);
    assert.strictEqual(rOn.ok, true);

    // 终态一致性：on 最后执行 → 路由在（fresh 200 而非被 off 侧 removeScope 误删成 404）、
    // fiber 挂载、清单 enabled
    await new Promise((r) => setTimeout(r, 45));
    const fresh = dispatch(app, 'GET', '/__probe_async');
    assert.strictEqual(fresh.res.statusCode, 200, '终态路由必须可服务（串行化前会被误删为 404）');
    const snap = assembly.status().backend.find((b) => b.id === ID);
    assert.strictEqual(snap.mounted, true);
    assert.strictEqual(snap.enabled, true);

    // 堵漏断言：重挂失败（plugin.js 缺失）→ keep 标记在 finally 清除 → 404 而非永久 503
    fs.rmSync(path.join(probeDir, 'plugin.js'));
    let failed = false;
    try { await loader.mountPlugin(ID, null, { evict: true }); } catch (e) { failed = true; }
    assert.strictEqual(failed, true, '缺失插件应 mount 失败');
    assert.strictEqual(dispatch(app, 'GET', '/__probe_async').res.statusCode, 404, '失败后标记已清（404），不得 503');
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
    fs.rmSync(manifestPath, { force: true });
    delete g.__asyncProbeDisposals;
  }
});

if (require.main === module) {
  runTests("server/cordis/services/server.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
