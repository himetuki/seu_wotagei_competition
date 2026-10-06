/**
 * cordis 后端装配器 —— 普通 CJS 文件，不进 kernel bundle（v1 计划 D1）
 *
 * 需要动态 require 模块 plugin.js / 读 plugins.json / 访问 module-loader，
 * 因此留在 bundle 外；经 require("./kernel.cjs") 使用打包后的 cordis 内核。
 *
 * assembleBackend(deps) -> Promise<{ ctx, migrated, legacy, disabled, errors }>
 *   deps = { app, dbManager, registerModuleDatabases, serverLog }
 *   （joinPath/APP_ROOT/dataDir 由本文件从 utils 补全后整体传给内核）
 *
 * 装配流程（P5a：cordis 为唯一装配路径）：
 *   1. 读装配清单（P6b：server/paths.cjs 解析——dev = server/plugins.json，便携 =
 *      Y_STAGE_PLUGINS_DIR/plugins.json；真实文件直读，pkg 快照机制已退役）
 *   2. 按 target 分类：migrated（有 modules/<id>/plugin.js 且 enabled）/
 *      legacy（无 plugin.js 且 enabled，纯前端模块）/ disabled（enabled:false）
 *   3. 填充 module-loader 清单（module-registry 兜底源 + selfcheck A3 投影依赖）
 *   4. 创建根 Context（三内置服务），把 legacy 条目投影进 ctx.modules
 *   4.5 P4：provide 装配控制服务 assembly（status/toggle/reload/setConfig/toggleFront，
 *       供 plugin-manager 插件构成 /api/plugins 管理面；热重装 = await 旧 fiber
 *       dispose（K6）→ require.cache 逐出（K11，真实文件完全生效）→ ctx.plugin 重挂，
 *       K2 防叠加）
 *   5. migrated 插件经包装插件挂载（route scope 生命周期与插件 fiber 绑定）
 *   6. 任何错误只收集进 errors，不 throw —— 绝不阻止服务器启动
 */
const fs = require("fs");
const path = require("path");
const { joinPath, APP_ROOT, dataDir } = require("../utils");
const paths = require("../paths.cjs");

// F6/P4：已知服务集合 = 内置四服务 + 清单条目 provides 动态声明。
// 内置：server/db/modules（create-root.cjs provide）+ assembly（本 loader 在挂载任何
// 业务插件之前 provide）。KNOWN_SERVICES 演进选定方案 A：assembly 作为内置集合成员
// 静态加入（它由 loader 自身装配期 provide，与 server/db/modules 同级），保证 A5
// 可静态断言；清单 provides 仅用于"先挂插件给后挂插件供服务"的场景。
// cordis K4：inject 引用未提供的服务时 fiber 永久 PENDING，await ctx.plugin() 无超时无报错 →
// 插件名拼写错（如 "serverr"）会让装配死锁。挂载前校验，非法条目跳过并收集进 errors。
const KNOWN_SERVICES = new Set(["server", "db", "modules", "assembly"]);

// 从清单条目集合提取 provides 声明（string 数组，忽略非法项）
function providedByEntries(entries) {
  const set = new Set();
  for (const entry of entries || []) {
    if (entry && Array.isArray(entry.provides)) {
      for (const s of entry.provides) if (typeof s === "string" && s) set.add(s);
    }
  }
  return set;
}

// 返回 exported.inject 中不在白名单内的服务名（inject 兼容 string 与 array 两种 cordis 形式）。
// extraServices：动态扩展集合（清单 provides 声明，Set/数组均可），可选。
function unknownInjects(exported, extraServices) {
  const inject = exported && exported.inject;
  const list = Array.isArray(inject) ? inject : inject ? [inject] : [];
  const extra = extraServices ? new Set(extraServices) : null;
  const known = extra && extra.size ? new Set([...KNOWN_SERVICES, ...extra]) : KNOWN_SERVICES;
  return list.filter((s) => !known.has(s));
}

// 条目 target "modules/<id>"（或纯字符串条目）→ id；非法 → null
function entryIdOf(entry) {
  const target = typeof entry === "string" ? entry : entry && entry.target;
  return typeof target === "string" ? target.replace(/^modules\//, "") : null;
}

// 读 JSON 文件（真实文件直读；解析/读取失败 → null）
function readManifestFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return null;
  }
}

// 读装配清单。overridePath 供 selfcheck --empty 传入临时清单。
function readPluginsJson(serverLog, overridePath) {
  return readManifestFile(overridePath || paths.backendManifestPath());
}

// 写回清单（2 空格缩进 + 尾换行，与既有文件格式逐字节一致）。
// runtime.pluginsPath（deps.pluginsPath，selfcheck 注入）：装配清单写盘改道临时副本，
// 自检的 toggle/config 持久化不落真实清单，非受控中断零残留。
// P6b：便携模式下这里是真实文件（plugins/plugins.json），persisted:true 常态化。
// 原子写（v6.3.1）：先写 .tmp 再 rename 覆盖，写盘中断不再截断清单
// （清单损坏 = 后端全部 /api/* 消失或前端全站装配为空，后果与写入窗口不成比例）；
// rename 失败退回直写并清理 tmp，成功/失败语义与原实现一致（true/false）。
function persistJson(data, target) {
  const payload = JSON.stringify(data, null, 2) + "\n";
  try {
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, payload, "utf8");
    try {
      fs.renameSync(tmp, target);
    } catch (e) {
      fs.writeFileSync(target, payload, "utf8");
      try { fs.unlinkSync(tmp); } catch (_) { /* 清理失败不影响结果 */ }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// F7：后端清单持久化 = 读-改-写（与 toggleFront 同纪律）。旧实现把启动内存快照
// runtime.manifest 整包写回——运行期手改 plugins/plugins.json（便携热替换工作流）后
// 任一 toggle/config 会整包回滚手工编辑。改为：写前重读磁盘清单（解析失败退回内存
// 快照兜底并留痕，行为不劣于旧实现）、只对目标条目应用字段变更、整包写回（未知字段
// 与其他条目保留）。全程同步 IO，事件循环内不可交错，无需额外锁。
// 成功后 runtime.manifest 刷新为刚写盘的副本（status/findEntry 后续读它，内存与磁盘同源）。
function mutateBackendManifest(id, mutateEntry) {
  const file = runtime.pluginsPath || paths.backendManifestPath();
  let manifest = readManifestFile(file);
  if (!manifest || !Array.isArray(manifest.plugins)) {
    console.error("[cordis] 后端清单磁盘重读失败，退回内存快照整包写（手改可能被覆盖）");
    manifest = runtime.manifest;
  }
  if (!manifest || !Array.isArray(manifest.plugins)) {
    return { ok: false, error: "装配清单不可用（读取失败且无内存快照）" };
  }
  const idx = manifest.plugins.findIndex((e) => entryIdOf(e) === id);
  if (idx < 0) {
    return { ok: false, error: `清单中不存在插件 ${id}` };
  }
  // 字符串条目升级为对象（原始 string 上写属性会静默丢失）
  if (typeof manifest.plugins[idx] === "string") {
    manifest.plugins[idx] = { target: `modules/${id}` };
  }
  mutateEntry(manifest.plugins[idx]);
  const persisted = persistJson(manifest, file);
  runtime.manifest = manifest;
  return { ok: true, persisted };
}

function persistFrontManifest(data) {
  return persistJson(data, paths.frontManifestPath());
}

// 模块 id 白名单校验：id 来自装配清单（文件），而插件层在便携形态下是可写目录，
// 故在拼路径/require 之前一律断言其为安全 slug——id 含 ".."、"/" 等会逃出模块根。
function assertId(id) {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`[cordis] 非法模块 id: ${JSON.stringify(id)}（仅允许小写字母/数字/连字符）`);
  }
  return id;
}

// 模块是否已提供后端插件（真实磁盘探测；P6b：plugin-registry.cjs 静态注册表退役）
function hasPluginFile(id) {
  return fs.existsSync(joinPath(paths.modulesDir(), assertId(id), "plugin.js"));
}

// 加载插件导出（直接 require 磁盘路径）。
// K11（P4 已实现）：重挂前必须先经 evictPluginCache 逐出旧模块对象，否则拿到旧导出。
function loadPluginExport(id) {
  const p = joinPath(paths.modulesDir(), id, "plugin.js");
  if (!fs.existsSync(p)) {
    throw new Error(`插件 ${id} 无 plugin.js（${p}）`);
  }
  return require(p);
}

// K11：重挂前逐出 require 缓存（P6b：dev 与便携皆为真实文件，逐出后重读即新代码）。
// F4：逐出范围 = 该插件目录内的全部模块——plugin.js 的兄弟模块（如 music-library
// require 的 ./scanner、./routes）与主文件同享 require.cache，只逐出 plugin.js 会让
// "热重载成功"后仍命中兄弟模块旧缓存跑旧代码。遍历缓存键，resolved 路径落在插件
// 目录内（path.relative 不以 ".." 开头且非绝对——绝对值出现在跨盘符场景，同时规避
// Windows 盘符大小写差异下字符串前缀比较的误判）即逐出；相邻插件目录的条目相对路径
// 以 ".." 开头，天然不越界误删。plugin.js 本身位于目录内，原逐出逻辑被天然覆盖。
function evictPluginCache(id) {
  try {
    const pluginDir = path.dirname(joinPath(paths.modulesDir(), id, "plugin.js"));
    for (const key of Object.keys(require.cache)) {
      // 缓存键非绝对路径（Node 内置模块名等）不参与目录归属判定
      if (!path.isAbsolute(key)) continue;
      let rel;
      try {
        rel = path.relative(pluginDir, key);
      } catch (e) {
        continue;
      }
      if (rel === "" || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
        continue;
      }
      delete require.cache[key];
    }
  } catch (e) { /* 目录推导失败 → 无需逐出 */ }
}

// P4 装配运行时：assembly 控制面的操作对象。单进程单装配为常态（selfcheck 末段的
// 二次装配也复用本状态，且不影响其之前的断言）。fibers 是 K2 防双挂载的唯一事实源。
const runtime = {
  ctx: null,
  manifest: null, // 原始清单对象（无损回写；读取失败为 null → 控制面只读报错）
  universe: [], // modules.json 元数据（legacy 页面重注册与名称兜底）
  legacyIds: new Set(),
  fibers: new Map(), // id -> fiber
  errors: new Map(), // id -> 最近一次挂载/操作错误消息
  baseOrder: [], // 装配完成时的 /api/modules 投影序（toggle 循环后恢复原位）
  baseLayerCount: 0, // 装配完成时的路由 layer 数（热重挂层序修正的插入基准）
  pluginsPath: null, // 装配清单写盘改道路径（selfcheck 用 tmp 副本；正常为 null = 真实清单）
  serverLog: null, // 装配期注入（assembleBackend），排空超时 warn 用
};

// 卸载插件：P6a 请求排空后 await fiber.dispose()（K6 异步），scope 路由物理移除 +
// effect 清理完成后才返回。opts.drain：
//   "clear" — disable 场景：排空 → dispose → 清 draining 标记（路由已物理移除，
//             后续 404 是正确语义）
//   "keep"  — reload/重挂场景：draining 标记保留，由 mountPlugin 重挂完成后
//             resumeScope（重挂窗口期新请求 503 Retry-After 而非 404）
//   缺省    — boot 装配路径：无在飞可言，直接 dispose 不排空
async function unmountPlugin(id, opts = {}) {
  const fiber = runtime.fibers.get(id);
  runtime.fibers.delete(id);
  if (!fiber) return;
  if (!opts.drain) {
    await fiber.dispose();
    return;
  }
  const router = runtime.ctx.server.app.__router;
  const scopeName = `plugin:${id}`;
  const drained = await router.drainScope(scopeName);
  if (drained.forced) {
    (runtime.serverLog || console.error)(
      `[cordis] 插件 ${id} 排空超时(${drained.timeoutMs}ms)，强制继续卸载（在飞请求可能失败）`,
      "warn"
    );
  }
  await fiber.dispose();
  if (opts.drain === "clear") router.resumeScope(scopeName);
}

// 禁用→启用循环（以及一切重挂）会因 Map 重插把 /api/modules 条目移到末尾；按装配
// 时基准序（baseOrder）unregister+registerPage 恢复投影顺序（registerPage 幂等按 id
// 覆盖，投影字段回填无损；baseOrder 之外新出现的 id 兜底追加在尾部）
function preserveProjectionOrder() {
  const current = runtime.ctx.modules.list();
  const currentIds = current.map((m) => m.id);
  const order = [...runtime.baseOrder];
  for (const id of currentIds) if (!order.includes(id)) order.push(id);
  if (currentIds.join("\n") === order.join("\n")) return;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const mid of currentIds) runtime.ctx.modules.unregister(mid);
  for (const mid of order) {
    const meta = byId.get(mid);
    if (meta) runtime.ctx.modules.registerPage(meta);
  }
}

// 热重装层序修正（y-router：注册序 = 匹配优先序）。setupRoutes 的尾部中间件
// （handle404 等）在装配完成后注册，热重挂的 scope layer 若追加在数组尾会被
// handle404 先行应答 404。装配完成时记录 baseLayerCount，重挂后将该 scope 的
// layer 搬回该位置（共享路由与插件路由前缀不相交，先序变化无语义影响）。
function relocateScopeLayers(router, scopeName) {
  const layers = router.layers;
  const inScope = layers.filter((l) => l.scope === scopeName);
  if (!runtime.baseLayerCount || inScope.length === 0) return;
  const outScope = layers.filter((l) => l.scope !== scopeName);
  const at = Math.min(runtime.baseLayerCount, outScope.length);
  router.layers = [...outScope.slice(0, at), ...inScope, ...outScope.slice(at)];
}

// 挂载插件（生产包装路径）。opts.evict：重挂场景先逐出 require 缓存（K11），
// 并在挂载后做层序修正（热重挂路由必须排在 handle404 之前）。
// K2 防双挂载：runtime.fibers 已有 fiber 必先 await 卸载，同一插件永不叠加。
// P6a：重挂路径卸旧 fiber 前先排空（draining 标记保留到重挂完成/失败，finally 中
// resumeScope——成功 = 恢复接客，失败 = 标记必须清（路由已移除，404 为正确语义）。
// P6b 终审：卸旧（含 drainScope 标记 keep）整体纳入 try——dispose/drain 任一环节
// reject 时 keep 标记也在 finally 清除，杜绝该 scope 永久 503。
async function mountPlugin(id, config, opts = {}) {
  try {
    await unmountPlugin(id, opts.evict ? { drain: "keep" } : {});
    if (opts.evict) evictPluginCache(id);
    const ctx = runtime.ctx;
    const exported = loadPluginExport(id);
    const extra = providedByEntries(runtime.manifest && runtime.manifest.plugins);
    const bad = unknownInjects(exported, extra);
    if (bad.length > 0) {
      throw new Error(
        `插件 ${id} inject 引用未知服务: ${bad.join(", ")}（已知: ${[...KNOWN_SERVICES, ...extra].join(", ")}）`
      );
    }
    const fiber = await ctx.plugin(wrapPlugin(exported, id, ctx.server), config);
    if (opts.evict) {
      // 重挂路径专属修正：boot 挂载无需（基准序/基准层数即由 boot 产出）
      relocateScopeLayers(ctx.server.app.__router, `plugin:${id}`);
      preserveProjectionOrder();
    }
    runtime.fibers.set(id, fiber);
    runtime.errors.delete(id);
    return fiber;
  } finally {
    if (opts.evict && runtime.ctx) {
      runtime.ctx.server.app.__router.resumeScope(`plugin:${id}`);
    }
  }
}

// P4：装配控制服务（§5 管理体验）。由 assembleBackend 在根 ctx 创建后、任何业务
// 插件挂载前 provide（manager inject: ["assembly", ...]）。纯内存状态 + 清单回写，
// 前端清单（web/front.json）的读写也在此收口，使 manager 插件本体零 fs 依赖。
// 注：manager 每次变更成功后 ctx.emit("plugins.updated", snapshot) —— 当前无前端
// 订阅者，作为未来跨插件协作的预留事件保留（P5a 主持人拍板）。
function createAssemblyService(deps) {
  const { serverLog } = deps;

  // P6b 终审：per-id 操作串行。并发 toggle/reload/config 对同一插件按提交顺序排队
  // 执行——否则 "off 侧 drainScope 等在飞（最长 15s）期间 on 侧 mountPlugin 见 fibers
  // 为空直接重挂并 resumeScope，off 侧随后旧 fiber.dispose → removeScope 把新挂载的
  // 路由一并物理移除"，形成清单 enabled、fibers 有 fiber、路由全无的三态不一致。
  const ops = new Map(); // id -> 最近一次操作 Promise（链尾）
  const serialized = (id, run) => {
    const next = (ops.get(id) || Promise.resolve()).catch(() => {}).then(run);
    ops.set(id, next);
    return next;
  };

  const pluginsOf = () => (runtime.manifest && runtime.manifest.plugins) || [];
  const findEntry = (id) => pluginsOf().find((e) => entryIdOf(e) === id) || null;

  const metaOf = (id) => {
    const page = runtime.ctx && runtime.ctx.modules.get(id);
    if (page) return { name: page.name, icon: page.icon || "puzzle" };
    const mod = runtime.universe.find((m) => m.id === id);
    return { name: (mod && mod.name) || id, icon: (mod && mod.icon) || "puzzle" };
  };

  function status() {
    const front = readManifestFile(paths.frontManifestPath());
    return {
      backend: pluginsOf().map((e) => {
        const id = entryIdOf(e);
        const meta = metaOf(id);
        return {
          id,
          name: meta.name,
          icon: meta.icon,
          kind: runtime.legacyIds.has(id) ? "legacy" : "plugin",
          enabled: !(e && e.enabled === false),
          mounted: runtime.fibers.has(id),
          error: runtime.errors.get(id) || null,
          config: e && e.config !== undefined ? e.config : null,
        };
      }),
      front: ((front && Array.isArray(front.plugins) && front.plugins) || []).map((e) => {
        const id = entryIdOf(e);
        const meta = metaOf(id);
        // P11：kind 为前端条目的可选元数据（如 "component"），供管理页分类展示；
        // 既有字段与顺序不变，纯增量追加（后端 kind 语义不同：legacy/plugin，见上）。
        return {
          id,
          name: meta.name,
          icon: meta.icon,
          enabled: !(e && e.enabled === false),
          kind: e && typeof e === "object" && e.kind !== undefined ? e.kind : null,
        };
      }),
    };
  }

  async function toggle(id, enabled) {
    // F7：读-改-写——重读磁盘清单，只改本条 enabled 后整包写回（手改的其他条目/字段不被回滚）
    const mut = mutateBackendManifest(id, (entry) => {
      entry.enabled = !!enabled;
    });
    if (!mut.ok) return { ok: false, error: mut.error };
    const persisted = mut.persisted;
    const entry = findEntry(id); // 读-改-写后与磁盘同源的条目（成功路径必存在）

    if (runtime.legacyIds.has(id)) {
      // legacy：无 fiber 可卸；页面元数据即时增删，静态注册的路由重启后才彻底消失
      if (enabled) {
        const mod = runtime.universe.find((m) => m.id === id);
        if (mod) runtime.ctx.modules.registerPage(mod);
      } else {
        runtime.ctx.modules.unregister(id);
      }
      return { ok: true, persisted, hint: "legacy 模块：页面即时生效，路由重启后彻底移除" };
    }

    try {
      // P6b 终审：挂/卸段经 per-id 串行（见 serialized 注释）
      const result = await serialized(id, async () => {
        if (enabled) {
          await mountPlugin(id, entry && entry.config, { evict: true }); // 内部先排空卸旧 fiber（K2 防叠加）+ 层序/投影序修正
        } else {
          await unmountPlugin(id, { drain: "clear" }); // P6a 排空 + K6 await dispose：路由物理 404 + effect 清理
        }
        return { ok: true, persisted };
      });
      return result;
    } catch (e) {
      runtime.errors.set(id, e.message);
      serverLog(`[cordis] 插件 ${id} toggle 失败: ${e.message}`, "error");
      return { ok: false, error: e.message };
    }
  }

  async function reload(id) {
    const entry = findEntry(id);
    if (!entry) return { ok: false, error: `清单中不存在插件 ${id}` };
    if (runtime.legacyIds.has(id)) {
      return { ok: false, error: "legacy 模块无插件 fiber，reload 不适用（重启生效）" };
    }
    if (entry.enabled === false) return { ok: false, error: `插件 ${id} 已禁用，启用后再重载` };
    try {
      await serialized(id, () =>
        mountPlugin(id, entry.config, { evict: true })
      ); // K11 逐出 + K2 先卸后挂（真实文件，逐出即新代码）
      return { ok: true };
    } catch (e) {
      runtime.errors.set(id, e.message);
      serverLog(`[cordis] 插件 ${id} reload 失败: ${e.message}`, "error");
      return { ok: false, error: e.message };
    }
  }

  async function setConfig(id, config) {
    // F7：读-改-写——重读磁盘清单，只改本条 config 后整包写回（手改的其他条目/字段不被回滚）
    const mut = mutateBackendManifest(id, (entry) => {
      if (config === undefined || config === null) delete entry.config;
      else entry.config = config;
    });
    if (!mut.ok) return { ok: false, error: mut.error };
    const persisted = mut.persisted;
    const entry = findEntry(id); // 读-改-写后与磁盘同源的条目（成功路径必存在）
    if (runtime.legacyIds.has(id) || (entry && entry.enabled === false)) return { ok: true, persisted };
    try {
      await serialized(id, () => mountPlugin(id, entry && entry.config, { evict: true })); // 写后热重装该插件
      return { ok: true, persisted };
    } catch (e) {
      runtime.errors.set(id, e.message);
      serverLog(`[cordis] 插件 ${id} setConfig 重挂失败: ${e.message}`, "error");
      return { ok: false, error: e.message };
    }
  }

  async function toggleFront(id, enabled) {
    // 读-改-写串行（v6.3.1，与后端 toggle 同纪律）：每次调用都是「重读 front.json →
    // 改单条 → 整包写回」，并发提交（多标签/多机；组级整组停用的连续序列有 groupBusy
    // 锁但锁不跨客户端）会让后写者以旧快照整包覆盖，先写者的变更静默丢失。前端清单
    // 是单一文件，全部写入共用一把锁（专用键 "__front__"）即可。
    return serialized("__front__", async () => {
      const front = readManifestFile(paths.frontManifestPath());
      if (!front || !Array.isArray(front.plugins)) {
        return { ok: false, error: "front.json 读取失败" };
      }
      const idx = front.plugins.findIndex((e) => entryIdOf(e) === id);
      if (idx < 0) return { ok: false, error: `前端清单中不存在 ${id}` };
      if (typeof front.plugins[idx] === "string") front.plugins[idx] = { target: `modules/${id}` };
      front.plugins[idx].enabled = !!enabled;
      const persisted = persistFrontManifest(front);
      // 前端插件生命周期 = 页面生命周期（kernel 按 front.json 决定是否 import），刷新后生效
      return { ok: true, persisted, hint: "前端插件：刷新页面后生效" };
    });
  }

  return { status, toggle, reload, setConfig, toggleFront };
}

// 包装插件：把 route scope 的生命周期绑到本插件 fiber 上。
// effect 立即执行 → __enterScope 先于 real.apply（route() 由此归入本插件 scope）；
// 插件卸载（fiber.dispose）→ disposer → __exitScope → removeScope 物理移除路由。
// inject/Config/provide 透传原插件声明，cordis 依赖等待与 config 语义不变。
function wrapPlugin(exported, id, server) {
  const scopeName = `plugin:${id}`;
  return {
    name: exported.name || id,
    inject: exported.inject,
    Config: exported.Config,
    provide: exported.provide,
    intercept: exported.intercept,
    apply(ctx, config) {
      ctx.effect(() => {
        server.__enterScope(scopeName);
        return () => server.__exitScope(scopeName);
      }, "route-scope");
      return exported.apply(ctx, config);
    },
  };
}

// 读模块清单（modules.json）——取"宇宙集合"用（真实文件直读，路径经 paths.cjs）。
function readModulesJson(serverLog) {
  const parsed = readManifestFile(paths.modulesManifestPath());
  if (!parsed) {
    serverLog("[cordis] modules/modules.json 读取失败", "error");
    return [];
  }
  return Array.isArray(parsed) ? parsed : parsed.modules || [];
}

async function assembleBackend(deps) {
  const { serverLog } = deps;
  const errors = [];
  const moduleLoader = require("../module-loader");
  const { createBackendRoot } = require("./kernel.cjs");

  // 0. 模块宇宙集合（modules.json）
  const universe = readModulesJson(serverLog).filter((m) => m && m.id);

  // 1. 读装配清单；损坏/缺失 → 回退全 legacy（基线行为），服务器照常启动。
  //    清单为"白名单"语义：未列出的模块 = 不挂载（/api/modules 与路由同步消失）。
  const manifest = readPluginsJson(serverLog, deps.pluginsPath);
  const entries = manifest && Array.isArray(manifest.plugins) ? manifest.plugins : null;
  if (!entries) {
    serverLog("[cordis] 装配清单读取失败或无 plugins 数组，回退全 legacy 装配", "error");
  }

  // 2. 分类：migrated（有 plugin.js 且 enabled）/ legacy（无 plugin.js 且 enabled）/
  //    disabled（enabled:false）。entry 可为字符串（纯 target）。
  const migrated = [];
  const legacy = [];
  const disabled = [];
  const listed = new Set();
  for (const entry of entries || []) {
    const id = typeof entry === "string" ? entry : entry && String(entry.target || "").replace(/^modules\//, "");
    if (!id || listed.has(id)) continue;
    // 信任边界校验：清单是外部输入（便携形态下 plugins/ 目录可写），id 必须是安全
    // slug 才能用于拼插件路径与 require；非法条目记录错误并跳过，不中断整体装配。
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      errors.push(new Error(`[cordis] 清单条目 id 非法（仅允许小写字母/数字/连字符）: ${JSON.stringify(id)}`));
      continue;
    }
    listed.add(id);
    if (entry && entry.enabled === false) {
      disabled.push(id);
    } else if (hasPluginFile(id)) {
      migrated.push({ id, config: entry && entry.config });
    } else if (universe.some((m) => m.id === id)) {
      legacy.push(id);
    } else {
      errors.push(new Error(`[cordis] 清单条目 ${id} 既无 plugin.js 也不在 modules.json 中`));
    }
  }
  // 未列出的模块 = 不挂载（路由与投影同步消失）
  // 清单损坏/缺失的回退：全宇宙投影为 legacy 页面（服务器照常启动）。
  // P5a 注：legacy 路由/数据库供养已随 modules/<id>/server/ 删除而移除——
  // 全部带后端的模块均已插件化，插件 API 一律由 plugin.js 的 ctx.db.define /
  // ctx.server.route 提供；本回退仅保留页面投影可见性。
  if (!entries) {
    for (const m of universe) if (!legacy.includes(m.id)) legacy.push(m.id);
  }

  // 3. 填充 module-loader 清单（module-registry 兜底源与 selfcheck A3 投影依赖）
  moduleLoader.loadManifest();

  // 4. 根 Context + 三内置服务，按 modules.json 序投影全部启用条目（P3c 迁移序守恒）：
  //    legacy 与 migrated 一并投影，migrated 插件挂载时 registerPage 按 id 原位覆盖
  //    （Map 保持首次插入位置），保证 /api/modules 顺序与默认模式逐字节一致；
  //    disabled / 未列出条目不投影（清单白名单语义不变）。universe 即 modules.json
  //    解析结果，legacy/migrated 均为其子集，无空引用风险。
  const { ctx } = createBackendRoot({ ...deps, joinPath, APP_ROOT, dataDir });
  const enabledIds = new Set([...legacy, ...migrated.map((m) => m.id)]);
  for (const mod of universe) {
    if (!enabledIds.has(mod.id)) continue;
    ctx.modules.registerPage(mod);
  }

  // 4.5 P4：装配控制服务 —— 必须先于业务插件挂载 provide（manager inject 依赖，
  // KNOWN_SERVICES 内置集合成员）。runtime 同步复位，fibers 成为 K2 防双挂载事实源。
  runtime.ctx = ctx;
  runtime.manifest = entries ? manifest : null;
  runtime.universe = universe;
  runtime.legacyIds = new Set(legacy);
  runtime.fibers.clear();
  runtime.errors.clear();
  runtime.baseOrder = [];
  runtime.baseLayerCount = 0;
  runtime.pluginsPath = deps.pluginsPath || null;
  runtime.serverLog = deps.serverLog || null;
  ctx.provide("assembly", createAssemblyService(deps));

  // 5. 挂载已迁移插件（顺序 await，单变量 scope 归属无交错）
  for (const { id, config } of migrated) {
    try {
      await mountPlugin(id, config); // F6 校验 + K2 防双挂载均在 mountPlugin 内
    } catch (e) {
      serverLog(`[cordis] 插件 ${id} 挂载失败: ${e.message}`, "error");
      runtime.errors.set(id, e.message);
      errors.push(e);
    }
  }

  // 基准投影序：toggle 禁用→启用循环后据此恢复 /api/modules 原序（K16）
  runtime.baseOrder = ctx.modules.list().map((m) => m.id);
  // 基准 layer 数：此时尚无 setupRoutes 尾部中间件（handle404 等），热重挂路由
  // relocate 到该位置即保证排在 404 兜底之前
  runtime.baseLayerCount = ctx.server.app.__router.layers.length;

  serverLog(
    `[cordis] 装配完成: 迁移插件 ${migrated.length} 个, legacy 模块 ${legacy.length} 个, 停用 ${disabled.length} 个, 错误 ${errors.length} 个`
  );
  return {
    ctx,
    migrated: migrated.map((m) => m.id),
    legacy,
    disabled,
    errors,
  };
}

module.exports = {
  assembleBackend,
  wrapPlugin,
  readPluginsJson,
  KNOWN_SERVICES,
  unknownInjects,
  providedByEntries,
  mountPlugin,
  unmountPlugin,
};
