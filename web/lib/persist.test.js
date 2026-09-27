/**
 * web/lib/persist.mjs 单测 —— P11-B0/B2（依赖注入形态的核心收益：无 fetch/localStorage 也能全流程验证）
 *
 * 覆盖：双写顺序（先 local 后 server）、POST 体带 lastUpdate、server 优先恢复链、
 * server 失败/空响应回退 local、两端皆空回退 initNewGame、重置清两端、
 * 远端失败不 reject（remote:false）、本地写失败仍走远端、自定义 isValid/now/onError。
 */
const { test, runTests, assert } = require("../../server/test-lib");

const importPersist = () => import("./persist.mjs");

/** 记录调用顺序的 storage 假件（接口同 Storage） */
function fakeStorage(initial = {}, opts = {}) {
  const map = new Map(Object.entries(initial));
  const log = [];
  return {
    log,
    map,
    getItem(k) {
      log.push(`storage:get:${k}`);
      if (opts.readError) throw new Error("read boom");
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      log.push(`storage:set:${k}`);
      if (opts.writeError) throw new Error("quota exceeded");
      map.set(k, String(v));
    },
    removeItem(k) {
      log.push(`storage:remove:${k}`);
      if (opts.removeError) throw new Error("remove boom");
      map.delete(k);
    },
  };
}

/** 记录调用顺序的 api 假件（接口同 ctx.api：get/post） */
function fakeApi(handlers = {}, log = []) {
  return {
    log,
    async get(path) {
      log.push(`api:get:${path}`);
      if (handlers.getError) throw handlers.getError;
      return handlers.getResult;
    },
    async post(path, body) {
      log.push(`api:post:${path}`);
      if (handlers.postError) throw handlers.postError;
      return handlers.postResult !== undefined ? handlers.postResult : { ok: true };
    },
  };
}

const KEY = "dragBattleState2_player1";
const EP = "/api/drag-process";
const CLEAR = "/api/clear-drag-process";

test("save：双写顺序 = 先 localStorage 后服务端；POST 体带 lastUpdate（now 可注入）", async () => {
  const { createPersistence } = await importPersist();
  const storage = fakeStorage();
  const api = fakeApi({}, storage.log);
  const posted = [];
  const persist = createPersistence({
    key: KEY,
    storage,
    api: { get: api.get, post: (p, b) => (posted.push([p, b]), api.post(p, b)) },
    endpoint: EP,
    now: () => "2026-09-17T00:00:00.000Z",
  });
  const res = await persist.save({ phase: "playing", n: 3 });

  assert.deepStrictEqual(storage.log, [`storage:set:${KEY}`, `api:post:${EP}`], "顺序必须本地先、远端后");
  assert.strictEqual(res.local, true);
  assert.strictEqual(res.remote, true);
  assert.deepStrictEqual(posted, [[EP, { phase: "playing", n: 3, lastUpdate: "2026-09-17T00:00:00.000Z" }]]);
  assert.deepStrictEqual(JSON.parse(storage.map.get(KEY)), { phase: "playing", n: 3 }, "本地存的是原始数据（无 lastUpdate）");
});

test("load：server 优先（命中即返回，不读本地）", async () => {
  const { createPersistence } = await importPersist();
  const storage = fakeStorage({ [KEY]: JSON.stringify({ from: "local" }) });
  const api = fakeApi({ getResult: { from: "server", nodes: [1] } });
  const persist = createPersistence({ key: KEY, storage, api, endpoint: EP, initNewGame: () => ({ from: "new" }) });

  const { data, source } = await persist.load();
  assert.strictEqual(source, "server");
  assert.deepStrictEqual(data, { from: "server", nodes: [1] });
  assert.ok(!storage.log.includes(`storage:get:${KEY}`), "server 命中时不应再读 localStorage");
});

test("load：server 抛错/空响应（null、{}、仅 lastUpdate）→ 回退 localStorage", async () => {
  const { createPersistence } = await importPersist();
  const empties = [null, undefined, {}, { lastUpdate: "x" }];
  for (const empty of empties) {
    const storage = fakeStorage({ [KEY]: JSON.stringify({ from: "local" }) });
    const persist = createPersistence({
      key: KEY,
      storage,
      api: fakeApi({ getResult: empty }),
      endpoint: EP,
      initNewGame: () => ({ from: "new" }),
    });
    assert.deepStrictEqual(await persist.load(), { data: { from: "local" }, source: "local" }, `空响应 ${JSON.stringify(empty)} 应回退本地`);
  }

  const errors = [];
  const storage = fakeStorage({ [KEY]: JSON.stringify({ from: "local" }) });
  const persist = createPersistence({
    key: KEY,
    storage,
    api: fakeApi({ getError: new Error("HTTP 500") }),
    endpoint: EP,
    onError: (e, phase) => errors.push(`${phase}:${e.message}`),
  });
  const { source } = await persist.load();
  assert.strictEqual(source, "local", "server 失败必须静默回退本地（不 reject）");
  assert.deepStrictEqual(errors, ["load:server:HTTP 500"], "失败经 onError 上报");
});

test("load：两端皆空 → initNewGame；无 initNewGame → { data:null, source:'none' }", async () => {
  const { createPersistence } = await importPersist();
  const fresh = createPersistence({
    key: KEY,
    storage: fakeStorage(),
    api: fakeApi({ getResult: null }),
    endpoint: EP,
    initNewGame: () => ({ phase: "fresh" }),
  });
  assert.deepStrictEqual(await fresh.load(), { data: { phase: "fresh" }, source: "new" });

  const bare = createPersistence({ key: KEY, storage: fakeStorage(), api: fakeApi({ getResult: null }), endpoint: EP });
  assert.deepStrictEqual(await bare.load(), { data: null, source: "none" });

  const localOnly = createPersistence({ key: KEY, storage: fakeStorage(), initNewGame: () => ({ ok: 1 }) });
  assert.deepStrictEqual(await localOnly.load(), { data: { ok: 1 }, source: "new" }, "api 缺省 = 本地单写模式");
});

test("load：本地 JSON 损坏 → 视为无存档并回退 init（经 onError 上报）", async () => {
  const { createPersistence } = await importPersist();
  const errors = [];
  const persist = createPersistence({
    key: KEY,
    storage: fakeStorage({ [KEY]: "{oops" }),
    initNewGame: () => ({ phase: "fresh" }),
    onError: (e, phase) => errors.push(phase),
  });
  assert.deepStrictEqual(await persist.load(), { data: { phase: "fresh" }, source: "new" });
  assert.deepStrictEqual(errors, ["load:local-parse"]);
});

test("save：远端失败不 reject（remote:false，本地已写）+ 本地写失败仍走远端", async () => {
  const { createPersistence } = await importPersist();
  const errors = [];
  const storage = fakeStorage();
  const remoteFail = createPersistence({
    key: KEY,
    storage,
    api: fakeApi({ postError: new Error("offline") }),
    endpoint: EP,
    onError: (e, phase) => errors.push(phase),
  });
  const r1 = await remoteFail.save({ a: 1 });
  assert.deepStrictEqual(r1, { local: true, remote: false });
  assert.ok(storage.map.has(KEY), "本地仍应写入（离线优先）");
  assert.deepStrictEqual(errors, ["save:remote"]);

  const localFail = createPersistence({
    key: KEY,
    storage: fakeStorage({}, { writeError: true }),
    api: fakeApi({}),
    endpoint: EP,
    onError: (e, phase) => errors.push(phase),
  });
  const r2 = await localFail.save({ a: 2 });
  assert.deepStrictEqual(r2, { local: false, remote: true }, "本地失败仍应尝试远端");
  assert.deepStrictEqual(errors, ["save:remote", "save:local"]);
});

test("save：数组/原始值按原值发（不展开，不注入 lastUpdate）", async () => {
  const { createPersistence } = await importPersist();
  const sent = [];
  const persist = createPersistence({
    key: KEY,
    storage: fakeStorage(),
    api: { get: async () => null, post: async (p, b) => (sent.push(b), { ok: true }) },
    endpoint: EP,
    now: () => "T",
  });
  await persist.save([1, 2, 3]);
  await persist.save("text");
  assert.deepStrictEqual(sent, [[1, 2, 3], "text"]);
});

test("reset：清 localStorage + POST clearEndpoint，双失败也不 reject", async () => {
  const { createPersistence } = await importPersist();
  const storage = fakeStorage({ [KEY]: JSON.stringify({ a: 1 }) });
  const api = fakeApi({}, []);
  const persist = createPersistence({ key: KEY, storage, api, endpoint: EP, clearEndpoint: CLEAR });

  assert.deepStrictEqual(await persist.reset(), { local: true, remote: true });
  assert.ok(!storage.map.has(KEY), "本地存档必须清除");
  assert.deepStrictEqual(storage.log.slice(-1), [`storage:remove:${KEY}`]);
  assert.ok(api.log.includes(`api:post:${CLEAR}`), "必须调用 clear 端点");

  const errors = [];
  const broken = createPersistence({
    key: KEY,
    storage: fakeStorage({}, { removeError: true }),
    api: fakeApi({ postError: new Error("down") }),
    endpoint: EP,
    clearEndpoint: CLEAR,
    onError: (e, phase) => errors.push(phase),
  });
  const r = await broken.reset();
  assert.deepStrictEqual(r, { local: false, remote: false }, "reset 不得 reject");
  assert.deepStrictEqual(errors, ["reset:local", "reset:remote"], "上报顺序跟随执行顺序（先本地后远端）");
});

test("reset：无 clearEndpoint → 仅清本地", async () => {
  const { createPersistence } = await importPersist();
  const storage = fakeStorage({ [KEY]: "{}" });
  const api = fakeApi({}, storage.log);
  const persist = createPersistence({ key: KEY, storage, api, endpoint: EP });
  assert.deepStrictEqual(await persist.reset(), { local: true, remote: false });
  assert.deepStrictEqual(storage.log, [`storage:remove:${KEY}`]);
});

test("isValid：模块自定义判定被采纳（缺省拒绝空对象）", async () => {
  const { createPersistence } = await importPersist();
  const storage = fakeStorage({ [KEY]: JSON.stringify({ nodes: [] }) });
  const persist = createPersistence({
    key: KEY,
    storage,
    initNewGame: () => ({ nodes: "fresh" }),
    // 模块判定：nodes 非空才算有存档
    isValid: (d) => !!(d && Array.isArray(d.nodes) && d.nodes.length > 0),
  });
  assert.deepStrictEqual(await persist.load(), { data: { nodes: "fresh" }, source: "new" });

  const ok = createPersistence({
    key: KEY,
    storage: fakeStorage({ [KEY]: JSON.stringify({ nodes: [1] }) }),
    isValid: (d) => !!(d && d.nodes && d.nodes.length > 0),
  });
  assert.deepStrictEqual(await ok.load(), { data: { nodes: [1] }, source: "local" });
});

test("createPersistence：缺 key 直接抛（fail fast）；createMemoryStorage 可独立使用", async () => {
  const { createPersistence, createMemoryStorage } = await importPersist();
  assert.throws(() => createPersistence({}), /key/);

  const mem = createMemoryStorage();
  assert.strictEqual(mem.getItem("k"), null);
  mem.setItem("k", 42);
  assert.strictEqual(mem.getItem("k"), "42", "同 Storage：取值为字符串");
  mem.removeItem("k");
  assert.strictEqual(mem.getItem("k"), null);
});

if (require.main === module) {
  runTests("web/lib/persist.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
