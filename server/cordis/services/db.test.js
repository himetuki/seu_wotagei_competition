/**
 * server/cordis/services/db.js — ctx.db 单元测试
 *
 * 隔离策略（C8/任务约束）：绝不触碰 resource/sqlite/y-stage.sqlite 真实库，也不调用
 * initializeAllDatabases()。用 server/sqlite-store.js 的 createEngine 直接在 os.tmpdir()
 * 下建随机文件名引擎，配一个与 database.js dbManager 同形状的本地管理器 + 同形状的
 * registerModuleDatabases 收集器，再以真实 cordis Context 安装 ctx.db。
 *
 * 覆盖：get/define/sql/exists；define 的双态语义（引擎未初始化仅登记 / 已初始化立即
 * 补写 docs 行 + makeLowdbCompat）；write() 经兼容层落盘（换新引擎可读回）。
 * 每个用例 finally 清理临时文件。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, runTests, assert } = require("../../test-lib");
const { Context } = require("cordis");
const { createEngine, makeLowdbCompat } = require("../../sqlite-store");
const { installDb } = require("./db");

// 与 server/database.js dbManager 相同的实现形状（不引真实单例，避免指向生产库）
function makeLocalDbManager() {
  return {
    dbs: {},
    engine: null,
    sql(q, p = []) {
      if (!this.engine) throw new Error("数据库引擎尚未初始化");
      return this.engine.sql(q, p);
    },
    init(dbName, defaultValue = {}) {
      if (!this.dbs[dbName]) {
        this.dbs[dbName] = makeLowdbCompat(this.engine, dbName, defaultValue || {});
      }
      return this.dbs[dbName];
    },
    get(dbName) {
      return this.dbs[dbName] ? this.dbs[dbName] : this.init(dbName);
    },
    exists(dbName) {
      return !!this.dbs[dbName];
    },
  };
}

// 与 database.js registerModuleDatabases 相同形状的收集器
function makeRegistrar() {
  const registered = [];
  const fn = (list) => { if (Array.isArray(list)) registered.push(...list); };
  fn.registered = registered;
  return fn;
}

function tmpSqlitePath() {
  return path.join(
    os.tmpdir(),
    `y-stage-dbtest-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
  );
}

async function withEngineDir(fn) {
  const file = tmpSqlitePath();
  try {
    return await fn(file);
  } finally {
    try { fs.unlinkSync(file); } catch (e) { /* 文件可能未产生 */ }
  }
}

test("installDb 向真实 cordis Context provide 服务（get/define/sql/exists 齐备）", () => {
  const ctx = new Context();
  const service = installDb(ctx, { dbManager: makeLocalDbManager(), registerModuleDatabases: makeRegistrar() });
  assert.strictEqual(ctx.db, service);
  for (const k of ["get", "define", "sql", "exists"]) {
    assert.strictEqual(typeof service[k], "function");
  }
});

test("define：引擎未初始化时仅登记桥接（不写 docs、不建实例、不抛错）", async () => {
  await withEngineDir(async () => {
    const ctx = new Context();
    const registrar = makeRegistrar();
    const local = makeLocalDbManager(); // engine 保持 null（cordis 装配先于初始化的时序）
    const service = installDb(ctx, { dbManager: local, registerModuleDatabases: registrar });
    service.define([{ name: "early", defaultValue: { a: 1 } }]);
    assert.deepStrictEqual(registrar.registered, [{ name: "early", defaultValue: { a: 1 } }]);
    assert.strictEqual(service.exists("early"), false);
    assert.strictEqual(local.engine, null);
  });
});

test("define：引擎已初始化时立即补写 docs 行 + init 兼容实例（P4 热挂载场景）", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const registrar = makeRegistrar();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    try {
      const service = installDb(ctx, { dbManager: local, registerModuleDatabases: registrar });
      service.define([{ name: "hot", defaultValue: { items: ["x"] } }]);
      assert.strictEqual(service.exists("hot"), true);
      assert.deepStrictEqual(service.get("hot").getState(), { items: ["x"] });
      const rows = service.sql("SELECT doc FROM docs WHERE name = ?", ["hot"]);
      assert.deepStrictEqual(JSON.parse(rows[0].doc), { items: ["x"] });
      assert.deepStrictEqual(registrar.registered, [{ name: "hot", defaultValue: { items: ["x"] } }]);
    } finally {
      local.engine.close();
    }
  });
});

test("define：defaultValue 缺省落 {}（docs 行为 JSON '{}'）", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    try {
      const service = installDb(ctx, { dbManager: local, registerModuleDatabases: makeRegistrar() });
      service.define([{ name: "nodef" }]);
      assert.deepStrictEqual(service.get("nodef").getState(), {});
      const rows = service.sql("SELECT doc FROM docs WHERE name = ?", ["nodef"]);
      assert.strictEqual(rows[0].doc, "{}");
    } finally {
      local.engine.close();
    }
  });
});

test("define：空数组 / 非数组 / 无 name 条目均安全跳过", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const registrar = makeRegistrar();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    try {
      const service = installDb(ctx, { dbManager: local, registerModuleDatabases: registrar });
      service.define([]);
      service.define("not-array");
      service.define([null, { defaultValue: 1 }]);
      // 登记按原样整体转发（与 database.js registerModuleDatabases 一致），
      // 无 name 条目的过滤只发生在引擎补写循环内
      assert.deepStrictEqual(registrar.registered, [null, { defaultValue: 1 }]);
      assert.strictEqual(service.exists("undefined"), false);
      assert.strictEqual(local.engine.sql("SELECT COUNT(*) AS n FROM docs")[0].n, 0);
    } finally {
      local.engine.close();
    }
  });
});

test("get：同实例缓存（进程内幂等）；缺省自动创建为 {}", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    try {
      const service = installDb(ctx, { dbManager: local, registerModuleDatabases: makeRegistrar() });
      const a = service.get("cached");
      const b = service.get("cached");
      assert.strictEqual(a, b);
      assert.deepStrictEqual(a.getState(), {});
    } finally {
      local.engine.close();
    }
  });
});

test("write 经兼容层落盘：引擎重建后状态可读回（临时文件真实写入）", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    let service;
    try {
      service = installDb(ctx, { dbManager: local, registerModuleDatabases: makeRegistrar() });
      service.define([{ name: "persist", defaultValue: { n: 0 } }]);
      service.get("persist").setState({ n: 42 }).write();
    } finally {
      local.engine.close();
    }
    // 换全新引擎 + 全新管理器，模拟进程重启后读回
    const local2 = makeLocalDbManager();
    local2.engine = await createEngine(file);
    try {
      const db2 = makeLowdbCompat(local2.engine, "persist", { n: 0 });
      assert.deepStrictEqual(db2.getState(), { n: 42 });
    } finally {
      local2.engine.close();
    }
  });
});

test("sql 透传：SELECT 返回对象数组；exists 前后状态正确", async () => {
  await withEngineDir(async (file) => {
    const ctx = new Context();
    const local = makeLocalDbManager();
    local.engine = await createEngine(file);
    try {
      const service = installDb(ctx, { dbManager: local, registerModuleDatabases: makeRegistrar() });
      assert.strictEqual(service.exists("doc-a"), false);
      service.define([{ name: "doc-a", defaultValue: { ok: true } }]);
      const rows = service.sql("SELECT name, doc FROM docs WHERE name = ?", ["doc-a"]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].name, "doc-a");
      assert.deepStrictEqual(JSON.parse(rows[0].doc), { ok: true });
      assert.strictEqual(service.exists("doc-a"), true);
    } finally {
      local.engine.close();
    }
  });
});

test("sql：引擎未初始化时抛错（与 dbManager 契约一致，不静默）", () => {
  const ctx = new Context();
  const service = installDb(ctx, { dbManager: makeLocalDbManager(), registerModuleDatabases: makeRegistrar() });
  assert.throws(() => service.sql("SELECT 1"), /尚未初始化/);
});

if (require.main === module) {
  runTests("server/cordis/services/db.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
