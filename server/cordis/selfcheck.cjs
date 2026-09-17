/**
 * cordis 装配自检 —— `node server.js --test-cordis` 与本文件独立运行共用的实现体。
 *
 * 用法：
 *   node server/cordis/selfcheck.cjs            # 全量清单模式
 *   node server/cordis/selfcheck.cjs --empty    # 空清单模式
 *   server.js 内：require 本文件 run() 后 process.exit(code)（C9：必须显式退出）
 *
 * 断言项：
 *   A1 装配零错误（errors 为空）
 *   A2 数据库定义与 P0 基线一致（getAllDatabaseDefs 名称集合 == 硬编码基线；P0 §2
 *      表格逐行累加为 22 个，标题"23"与表格内容不符，以表格+运行时实测为准）
 *   A3 ctx.modules.list() 与 module-loader 投影逐字节一致（迁移期 /api/modules 防漂移
 *      守门员；P4 起 manager 不在 modules.json 宇宙内，expected 末尾追加 manager 条目，
 *      共 19 条）
 *   A4 探针插件：ctx.server.route 注册 → HTTP 200 → fiber.dispose() → 物理移除 404
 *      （per-plugin scope 端到端证明）；ctx.db.define 桥接可见；effect 清理生效
 *   A5 inject 白名单（F6/P4）：未知服务名会令 fiber 永久 PENDING（装配死锁），
 *      loader 挂载前校验 exported.inject ⊆ 内置集合 {server, db, modules, assembly}
 *      ∪ 清单条目 provides 动态声明，非法即跳过并收集 errors
 *   A6 manager 管理链路（P4，全量清单模式，经 manager 生产路由端到端）：
 *      GET /api/plugins 快照 → toggle 真实迁移插件（drag）disabled → 其路由物理 404
 *      → 还原 enabled → reload 走通 → config 写读往返还原 → 禁用自身被拒
 *   A6.9 请求排空（P6a，端到端）：300ms 慢 handler 探针 + 立即 reload → 在飞慢请求
 *      最终 200 完成（排空先于 dispose）、排空期新请求 503+Retry-After（HEAD 无体）、
 *      其他 scope 不受影响、重挂后新请求 200、toggle off 排空后 404
 *
 * cordis@4.0.0-rc.9 d.ts 核对结论（K1-K11，实测于本文件与冒烟脚本）：
 *   K1  new Context() 即根，无 start()；根 fiber 立即 ACTIVE            = 计划假设
 *   K2  ctx.plugin(p, config) 返回 Fiber&PromiseLike；config 第二参；
 *       同一插件对象重复挂载 = 叠加 fiber（不报错不替换）→ 防双挂载归 loader 职责  ≠ 假设中"可能替换"
 *   K3  ctx.provide(name, value) 存在（根 fiber effect，随根存活）        = 计划假设
 *   K4  inject 缺失时 fiber 挂起 PENDING，服务就绪自动 apply（notify→refresh）= 计划假设
 *   K5  ctx.effect(fn) 同步执行返回 disposer；卸载时 DisposableList.clear()
 *       逆序回收                                                        = 计划假设
 *   K6  卸载 = fiber.dispose()（async，Promise<void>）；registry.delete 触发各 fiber.dispose ≠ 计划中"可能同步"
 *   K7  on/once/emit/parallel/serial/bail/waterfall 全可用               = 计划假设
 *   K8  插件 Config 字段 = StandardSchemaV1；未声明时 config 原样透传     = 计划假设（P2 只传 raw）
 *   K9  ctx.logger 内置（LoggerService）；内核错误走其输出；业务日志仍转发 serverLog = 计划假设
 *   K10 esbuild --format=cjs 打包通过（无顶 await，static 块合法）        = 计划假设
 *   K11 require 缓存逐出属 loader 职责（P4 已实现：重挂前 evictPluginCache）= 已落地
 *   K12 ctx.modules.list() 顺序语义 = modules.json 序：loader 按 manifest 序投影
 *      全部启用条目（legacy∪migrated），migrated 插件挂载时 registerPage 按 id
 *      原位覆盖（Map 保持首次插入位置）→ 双模式 /api/modules 逐字节一致（P3c）；
 *      A3 的双源投影断言依赖此语义
 *
 * P4 plugin-manager 结论（K13-K16，实测于本文件 A5/A6）：
 *   K13 assembly 服务由 loader 在挂载任何业务插件前 provide（manager inject 依赖）；
 *      KNOWN_SERVICES 演进选定方案 A：assembly 作为内置集合成员静态加入（它由
 *      loader 自身装配期 provide，与 server/db/modules 同级），清单 provides 仅用于
 *      插件间服务依赖（先挂插件给后挂插件供服务）
 *   K14 热重装 = await 旧 fiber dispose（K6）→ evictPluginCache（K11）→ ctx.plugin
 *      重挂；K2 防叠加由 loader runtime.fibers 单一事实源保证（挂载前必先卸载）
 *   K15 （P6b 起退役）pkg 环境分支整体移除：reload 对真实磁盘文件完全生效
 *      （require.cache 逐出 → 重读新代码），清单写盘 persisted:true 常态化
 *   K16 禁用→启用循环会把 /api/modules 条目重插到末尾（Map 语义），loader 在启用
 *      路径按原序 unregister+registerPage 恢复投影顺序（A6.5b 背书）
 *   K17 y-router 注册序 = 匹配优先序，handle404 在 setupRoutes（装配后）注册：
 *      热重挂的 scope layer 追加数组尾会被 404 兜底先行应答（A6 自测应用无
 *      setupRoutes 测不出，实服实测暴露）→ loader 记录装配完成时基准 layer 数，
 *      重挂后把该 scope 的 layer relocate 回兜底之前
 */
const os = require("os");
const http = require("http");
const bodyParser = require("body-parser");
const { createApp } = require("../http");
const { dbManager, registerModuleDatabases, getAllDatabaseDefs } = require("../database");
const { serverLog } = require("../utils");
const moduleLoader = require("../module-loader");
const { assembleBackend } = require("./loader");

// P4 manager 元数据投影（A3 expected 追加项；与 modules/plugin-manager/plugin.js 逐字段一致）
const MANAGER_PROJECT = {
  id: "plugin-manager",
  name: "插件管理",
  description: "插件装配管理与热替换",
  icon: "puzzle",
  nav: ["index"],
  order: 5,
  route: "/m/plugin-manager/",
};

// P0 基线（p0-baseline.md §2）：10 内置 + 12 模块声明
const BASELINE_DB_NAMES = [
  "winners", "settings", "statistics", "player1", "player2", "tricks",
  "tricks_for_group2", "musics_list", "musics_list_ex", "award",
  "battle-group1-process", "battle-group1-pre-process", "battle-group1-2-process",
  "battle-group2-process", "battle-group2-2-process", "drag-process", "drag-settings",
  "group-battle-process", "game_2_process", "game_2_settings", "movement_partys",
  "game_setting",
];

// 与 module-routes.js:20-29 逐字段一致的投影（守门员对比基准）
function project(m) {
  return {
    id: m.id,
    name: m.name,
    description: m.description || "",
    icon: m.icon || "",
    nav: m.nav || [],
    order: m.order || 0,
    route: `/m/${m.id}/`,
  };
}

// 探针插件：route + db.define + modules + effect，全服务面覆盖
let probeCleaned = false;
function makeProbePlugin() {
  return {
    name: "__cordis_probe",
    inject: ["server", "db", "modules"],
    apply(ctx) {
      ctx.db.define([{ name: "__cordis_probe_db", defaultValue: { ok: true } }]);
      ctx.server.route((app) => {
        app.get("/__cordis_probe", (req, res) => res.json({ ok: 1 }));
      });
      ctx.modules.registerPage({ id: "__cordis_probe", name: "探针" });
      ctx.effect(() => () => {
        ctx.modules.unregister("__cordis_probe");
        probeCleaned = true;
      });
    },
  };
}

// A6.9 排空探针源码（运行时写入 modules/__cordis_drain_probe/plugin.js，测毕删除）：
// 300ms 慢 handler + 挂载代数/在飞/卸载计数（globalThis 跨 require.cache 逐出存活）
const DRAIN_PROBE_SRC = [
  "const g = globalThis;",
  "module.exports = {",
  '  name: "__cordis_drain_probe",',
  '  inject: ["server"],',
  "  apply(ctx) {",
  "    g.__drainProbeGen = (g.__drainProbeGen || 0) + 1;",
  "    const gen = g.__drainProbeGen;",
  "    ctx.server.route((app) => {",
  '      app.get("/__cordis_drain_probe", (req, res) => {',
  "      g.__drainProbeActive = (g.__drainProbeActive || 0) + 1;",
  "      setTimeout(() => {",
  "        g.__drainProbeActive -= 1;",
  '        res.json({ ok: 1, gen });',
  "      }, 300);",
  "      });",
  "    });",
  "    ctx.effect(() => () => { g.__drainProbeDisposals = (g.__drainProbeDisposals || 0) + 1; });",
  "  },",
  "};",
].join("\n");

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`  FAIL ${name}${detail ? " — " + detail : ""}`);
    failures.push(name);
  } else {
    console.log(`  PASS ${name}`);
  }
}
const failures = [];

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    }).on("error", reject);
  });
}

// A6 用：带 JSON body 的请求，返回 { status, headers, body, text }（body 为 JSON 解析结果或 null）
function requestJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, text });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// A6.9 用：HEAD 请求，返回 { status, body }（排空 503 时 body 应为空串）
function requestHead(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "HEAD" }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, body: text }));
    });
    req.on("error", reject);
    req.end();
  });
}

const httpJson = (port, path) => requestJson(port, "GET", path);
const httpPost = (port, path, body) => requestJson(port, "POST", path, body === undefined ? {} : body);

async function run(options = {}) {
  const empty = !!options.empty;
  console.log(`=== cordis selfcheck（${empty ? "空清单" : "全量清单"}模式）===`);

  const app = createApp();
  // A6 需要经 manager 生产路由 POST JSON（bodyParser 与 server.js 同款，必须先于
  // assembleBackend 注册 —— 插件路由在装配期就进入 router 层序）
  app.use(bodyParser.json());
  const fs = require("fs");
  const path = require("path");
  const deps = { app, dbManager, registerModuleDatabases, serverLog };
  // P5a：清单写盘一律改道 tmp（deps.pluginsPath 机制），A6 的 toggle/config 持久化
  // 落在临时副本上，非受控中断不再在真实 server/plugins.json 留下残迹。
  if (empty) {
    deps.pluginsPath = path.join(os.tmpdir(), "plugins.empty.json");
    fs.writeFileSync(deps.pluginsPath, JSON.stringify({
      provider: { server: "y-router", db: "sqlite" },
      plugins: [],
    }));
  } else {
    try {
      deps.pluginsPath = path.join(os.tmpdir(), "plugins.selfcheck.json");
      fs.writeFileSync(
        deps.pluginsPath,
        fs.readFileSync(require("../paths.cjs").backendManifestPath(), "utf8")
      );
    } catch (e) {
      deps.pluginsPath = null; // 真实清单读取失败 → 维持旧行为（写真实文件）
    }
  }

  // ---- A1 装配零错误 ----
  const result = await assembleBackend(deps);
  assert("A1 装配零错误", result.errors.length === 0,
    result.errors.map((e) => e.message).join("; "));

  // ---- A2 数据库定义与基线一致 ----
  const defNames = getAllDatabaseDefs().map((d) => d.name).sort();
  if (empty) {
    assert("A2-empty 仅内置库（模块定义 0）", defNames.length === 10 && result.legacy.length === 0,
      `defs=${defNames.length}, legacy=${result.legacy.length}`);
  } else {
    const expected = [...BASELINE_DB_NAMES].sort();
    const missing = expected.filter((n) => !defNames.includes(n));
    const extra = defNames.filter((n) => !expected.includes(n) && !n.startsWith("__cordis_probe"));
    assert("A2 数据库定义 == 基线 22 个", missing.length === 0 && extra.length === 0,
      `缺: ${missing} 多: ${extra}`);
  }

  // ---- A3 /api/modules 投影 parity ----
  const listJson = JSON.stringify(result.ctx.modules.list());
  if (empty) {
    assert("A3-empty 清单为空", listJson === "[]", listJson.slice(0, 100));
  } else {
    // manager 已注册进 modules.json 宇宙（P4 收口），module-loader 投影天然含之；
    // 若某环境 module-loader 未含 manager（清单被裁剪），回退追加其投影保 parity。
    const expected = moduleLoader.getModules().map(project);
    if (result.migrated.includes("plugin-manager") && !expected.some((m) => m.id === "plugin-manager")) {
      expected.push(MANAGER_PROJECT);
    }
    const expectedJson = JSON.stringify(expected);
    assert("A3 ctx.modules.list() == module-loader 投影（双源 parity）",
      listJson === expectedJson,
      "两源输出不一致（首个差异位 " + firstDiff(listJson, expectedJson) + "，expected " + expected.length + " 条）");
  }

  // ---- A4 探针插件：经 loader 的生产包装路径挂载（scope 生命周期与 fiber 绑定）----
  const probe = makeProbePlugin();
  const wrapped = require("./loader").wrapPlugin(probe, "__cordis_probe", result.ctx.server);
  const fiber = await result.ctx.plugin(wrapped);
  const assertNames = getAllDatabaseDefs().map((d) => d.name);
  assert("A4.1 探针 ctx.db.define 桥接可见", assertNames.includes("__cordis_probe_db"));

  const server = app.listen(0);
  const port = server.address().port;
  const before = await httpGet(port, "/__cordis_probe");
  assert("A4.2 探针路由可访问(200)", before === 200, `got ${before}`);

  await fiber.dispose();
  const after = await httpGet(port, "/__cordis_probe");
  assert("A4.3 dispose 后路由物理移除(404)", after === 404, `got ${after}`);
  // server 保持开启至 A6（manager 管理链路复用同一监听）

  assert("A4.4 探针 effect 清理生效（unregister）",
    result.ctx.modules.get("__cordis_probe") === null && probeCleaned);

  // ---- A5 inject 白名单校验（F6/P4：未知服务名 → fiber 永久 PENDING 装配死锁的防护）----
  // 白名单与 provide 侧的一致性由 A4 + A6 背书：探针注入 server/db/modules 均可就绪，
  // manager 注入 assembly 走通管理链路。
  const loader = require("./loader");
  assert("A5.1 内置集合 == {server, db, modules, assembly}（P4 演进：assembly 由 loader 装配期 provide）",
    loader.KNOWN_SERVICES instanceof Set &&
    loader.KNOWN_SERVICES.size === 4 &&
    loader.KNOWN_SERVICES.has("server") && loader.KNOWN_SERVICES.has("db") &&
    loader.KNOWN_SERVICES.has("modules") && loader.KNOWN_SERVICES.has("assembly"),
    `实际: ${[...(loader.KNOWN_SERVICES || [])].join(", ")}`);
  assert("A5.2 未知服务名被识别（拼写错 serverr）",
    JSON.stringify(loader.unknownInjects({ inject: ["server", "serverr"] })) === '["serverr"]');
  assert("A5.3 合法 inject 放行", loader.unknownInjects({ inject: ["server", "db"] }).length === 0);
  assert("A5.4 字符串形式 inject 兼容", loader.unknownInjects({ inject: "server" }).length === 0);
  assert("A5.5 未声明 inject 的插件放行", loader.unknownInjects({}).length === 0);
  assert("A5.6 provides 动态扩展：清单声明 custom 后 inject custom/assembly 合法",
    loader.providedByEntries([{ provides: ["custom"] }, { target: "modules/x" }, {}]) instanceof Set &&
    loader.unknownInjects(
      { inject: ["assembly", "custom"] },
      loader.providedByEntries([{ provides: ["custom"] }])
    ).length === 0);
  assert("A5.7 未声明的动态服务仍被拒（custom 未出现在任何 provides）",
    loader.unknownInjects({ inject: ["custom"] }).length === 1);

  // ---- A6 manager 管理链路（P4，全量清单模式，经 manager 生产路由端到端）----
  // 探针 = drag（真实迁移插件，含真实路由 /api/drag-process）；全程 toggle/reload/config
  // 操作完成后状态还原，plugins.json 最终仅多出 manager 清单条目本身。
  if (!empty) {
    const snap = await httpJson(port, "/api/plugins");
    const backend = (snap.body && snap.body.backend) || [];
    // P5a：条目数取 modules.json 宇宙数（与后端清单条目一一对应），不再硬编码 19
    const universeCount = moduleLoader.getModules().length;
    assert(`A6.1 GET /api/plugins 200，后端快照 ${universeCount} 条且 manager 已挂载`,
      snap.status === 200 && backend.length === universeCount &&
      backend.some((b) => b.id === "plugin-manager" && b.enabled && b.mounted && b.kind === "plugin"),
      `status=${snap.status} backend=${backend.length} universe=${universeCount}`);
    assert("A6.2 快照含前端条目（web/front.json 投影）",
      Array.isArray(snap.body.front) && snap.body.front.length > 0 &&
      snap.body.front.some((f) => f.id === "plugin-manager"),
      `front=${snap.body.front && snap.body.front.length}`);

    const idsBefore = result.ctx.modules.list().map((m) => m.id);

    const t1 = await httpPost(port, "/api/plugins/drag/toggle", { enabled: false });
    const off = await httpGet(port, "/api/drag-process");
    assert("A6.3 toggle drag 禁用 → 其路由物理 404",
      t1.status === 200 && t1.body && t1.body.ok === true && off === 404,
      `toggle=${t1.status}/${t1.text} drag=${off}`);
    assert("A6.4 禁用后页面注册同步移除 drag",
      !result.ctx.modules.list().some((m) => m.id === "drag"));

    const t2 = await httpPost(port, "/api/plugins/drag/toggle", { enabled: true });
    const on = await httpGet(port, "/api/drag-process");
    const idsAfter = result.ctx.modules.list().map((m) => m.id);
    const snapOn = await httpJson(port, "/api/plugins");
    const dragOn = ((snapOn.body || {}).backend || []).find((b) => b.id === "drag") || {};
    // 注：本进程刻意不初始化 DB 引擎，恢复后的路由处理器命中执行（500）恰证物理重挂；
    // 404（scope 移除）与 5xx（handler 已执行）的区分即物理存在性证明
    assert("A6.5 toggle 还原启用 → 路由恢复(非404)、fiber 重新挂载、投影顺序不变",
      t2.status === 200 && t2.body && t2.body.ok === true && on !== 404 &&
      dragOn.mounted === true && idsAfter.join(",") === idsBefore.join(","),
      `toggle=${t2.status} drag=${on} mounted=${dragOn.mounted}`);

    const rl = await httpPost(port, "/api/plugins/drag/reload");
    const on2 = await httpGet(port, "/api/drag-process");
    assert("A6.6 reload 走通（K11 逐出 + K2 先卸后挂）且路由仍物理存在",
      rl.status === 200 && rl.body && rl.body.ok === true && on2 !== 404,
      `reload=${rl.status}/${rl.text} drag=${on2}`);

    const c0 = await httpJson(port, "/api/plugins/drag/config");
    const c1 = await httpPost(port, "/api/plugins/drag/config", { config: { __selfcheck: true } });
    const c2 = await httpJson(port, "/api/plugins/drag/config");
    const c3 = await httpPost(port, "/api/plugins/drag/config", { config: c0.body ? c0.body.config : null });
    const c4 = await httpJson(port, "/api/plugins/drag/config");
    assert("A6.7 config 写读往返（写后热重装）并还原",
      c0.status === 200 && c1.status === 200 && c1.body && c1.body.ok === true &&
      c2.body && c2.body.config && c2.body.config.__selfcheck === true &&
      c3.status === 200 && c4.body &&
      JSON.stringify(c4.body.config) === JSON.stringify(c0.body.config),
      `c1=${c1.status} c2=${JSON.stringify(c2.body)} c4=${JSON.stringify(c4.body)}`);

    const selfOff = await httpPost(port, "/api/plugins/plugin-manager/toggle", { enabled: false });
    assert("A6.8 manager 自保护：禁用自身被拒（400）",
      selfOff.status === 400 && selfOff.body && selfOff.body.ok === false,
      `${selfOff.status}/${selfOff.text}`);
  }

  // ---- A6.9 请求排空（P6a 端到端铁证）----
  // 探针插件（loader 生产路径 mountPlugin/unmountPlugin，即 manager toggle/reload 的
  // 底座）路由含 300ms 慢 handler：并发慢请求 + 立即 reload → 慢请求最终 200 完成、
  // 排空期新请求 503（Retry-After）、重挂后新请求 200；toggle off 排空后 404。
  // P6b：插件一律磁盘直读，pkg 跳过分支随之退役。
  if (!empty) {
    const probeDir = path.join(__dirname, "..", "..", "modules", "__cordis_drain_probe");
    fs.mkdirSync(probeDir, { recursive: true });
    fs.writeFileSync(path.join(probeDir, "plugin.js"), DRAIN_PROBE_SRC);
    const g = globalThis;
    g.__drainProbeGen = 0;
    g.__drainProbeActive = 0;
    g.__drainProbeDisposals = 0;
    try {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const drainLoader = require("./loader");
      await drainLoader.mountPlugin("__cordis_drain_probe", null, { evict: true });
      const first = await requestJson(port, "GET", "/__cordis_drain_probe");
      assert("A6.9.1 探针挂载：300ms 慢 handler 可服务(200, gen=1)",
        first.status === 200 && first.body && first.body.gen === 1,
        `${first.status} ${first.text}`);

      // 并发：慢请求（300ms）+ 立即 reload 该插件（排空 → 卸旧 → 重挂）
      const slowReq = requestJson(port, "GET", "/__cordis_drain_probe");
      await sleep(50); // 慢请求已进入 handler
      const reloadP = drainLoader.mountPlugin("__cordis_drain_probe", null, { evict: true });
      await sleep(20); // draining 已标记，dispose 等待在飞归零
      assert("A6.9.2 排空先于 dispose：在飞未归零不卸载",
        g.__drainProbeActive === 1 && g.__drainProbeDisposals === 0,
        `active=${g.__drainProbeActive} disposals=${g.__drainProbeDisposals}`);
      const blocked = await requestJson(port, "GET", "/__cordis_drain_probe");
      assert("A6.9.3 排空期间新请求 503（错误 JSON + Retry-After:1）",
        blocked.status === 503 && blocked.body &&
        blocked.body.error === "plugin __cordis_drain_probe is reloading" &&
        String((blocked.headers || {})["retry-after"]) === "1",
        `${blocked.status} ${blocked.text}`);
      const headBlocked = await requestHead(port, "/__cordis_drain_probe");
      assert("A6.9.4 HEAD 排空期 503 无响应体",
        headBlocked.status === 503 && headBlocked.body === "",
        `${headBlocked.status} body=${JSON.stringify(headBlocked.body)}`);
      const core = await httpGet(port, "/api/plugins");
      assert("A6.9.5 排空仅限目标 scope：其他插件/核心路由不受影响", core === 200, `got ${core}`);

      await reloadP; // 在飞归零 → dispose → 重挂 → resumeScope
      const slow = await slowReq;
      assert("A6.9.6 在飞慢请求跨 reload 最终 200 完成（旧 handler 应答）",
        slow.status === 200 && slow.body && slow.body.gen === 1,
        `${slow.status} ${slow.text}`);
      const fresh = await requestJson(port, "GET", "/__cordis_drain_probe");
      assert("A6.9.7 重挂后新请求 200（新 handler 生效）",
        fresh.status === 200 && fresh.body && fresh.body.gen === 2,
        `${fresh.status} ${fresh.text}`);

      // toggle off 场景：drain → dispose → 清标记 → 路由物理 404
      await drainLoader.unmountPlugin("__cordis_drain_probe", { drain: "clear" });
      const gone = await httpGet(port, "/__cordis_drain_probe");
      assert("A6.9.8 toggle off：drain 后路由物理移除(404)", gone === 404, `got ${gone}`);
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true });
      delete g.__drainProbeGen;
      delete g.__drainProbeActive;
      delete g.__drainProbeDisposals;
    }
  }

  server.close();

  console.log(failures.length === 0 ? "SELF-CHECK: ALL PASS" : `SELF-CHECK: ${failures.length} FAILED`);
  return failures.length === 0 ? 0 : 1;
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

if (require.main === module) {
  run({ empty: process.argv.includes("--empty") })
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("SELF-CHECK 异常:", e);
      process.exit(1);
    });
}

module.exports = { run };
