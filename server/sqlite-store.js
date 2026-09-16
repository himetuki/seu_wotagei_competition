/**
 * 文档存储引擎 + 低配置(lowdb v1)兼容适配层
 *
 * 用 sql.js(sqle) 的 WASM 内存数据库落盘到单个 .sqlite 文件，
 * 对上层暴露 lowdb v1(path) 语义的对象，使现有 database.js / 路由零改动。
 *
 * $$Task 2-4 产物：createEngine / makeLowdbCompat / 路径工具
 */
const fs = require("fs");
const path = require("path");

// —— wasm 加载（模块级单例缓存）——
let _sqlOOT = null; // initSqlJs 初始化结果
let _initPromise = null;

/**
 * 加载 sql.js 的 sql-wasm.wasm，返回初始化好的 initSqlJs 工厂。
 * 非 pkg：读 node_modules 里的 wasm 二进制。
 * pkg：尝试从打包时内联的 assets 里解 base64。
 */
async function loadSqlJs() {
  if (_sqlOOT) return _sqlOOT;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    let wasmBinary;

    if (process.pkg) {
      // pkg 打包模式：虚拟文件系统不含原生 wasm，需用打包时内联的 base64
      let inlined = null;
      try {
        // eslint-disable-next-line global-require
        inlined = require("./inlined-assets");
      } catch (e) {
        inlined = null;
      }
      if (inlined && typeof inlined.getAsset === "function") {
        const asset = inlined.getAsset("sql-wasm.wasm");
        if (asset && asset.data) {
          wasmBinary = Buffer.from(asset.data, "base64");
        }
      }
    } else {
      // 非 pkg：直接读本项目 node_modules 中的 wasm
      wasmBinary = fs.readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"));
    }

    // 只有拿到 wasmBinary 才传 wasmBinary；否则走默认 locateFile
    // eslint-disable-next-line global-require
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs(
      wasmBinary ? { wasmBinary } : undefined
    );
    return SQL;
  })();

  _sqlOOT = _initPromise;
  return _initPromise;
}

// —— 路径工具（纯函数）——

/** 点路径 "a.b.0.c" -> ["a","b","0","c"]；空/未传 -> [] */
function parsePath(p) {
  if (p == null) return [];
  if (Array.isArray(p)) return p.slice();
  if (typeof p === "string") {
    if (p === "") return [];
    return p.split(".");
  }
  return [];
}

/** 沿路径取值；中间缺失返回 undefined；空路径返回 obj 本身 */
function getPath(obj, pathStr) {
  const tokens = parsePath(pathStr);
  if (tokens.length === 0) return obj;
  let cur = obj;
  for (const t of tokens) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[t];
  }
  return cur;
}

/** 路径是否存在（每层用 hasOwnProperty） */
function hasPath(obj, pathStr) {
  const tokens = parsePath(pathStr);
  if (tokens.length === 0) return obj != null;
  let cur = obj;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (cur == null || typeof cur !== "object") return false;
    if (!Object.prototype.hasOwnProperty.call(cur, t)) return false;
    cur = cur[t];
  }
  return true;
}

/** 就地写入值；中间缺失时创建 {} */
function setPath(obj, pathStr, value) {
  const tokens = parsePath(pathStr);
  if (tokens.length === 0) return; // 调用方不会传空 path
  let cur = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (cur[t] == null || typeof cur[t] !== "object") {
      cur[t] = {};
    }
    cur = cur[t];
  }
  cur[tokens[tokens.length - 1]] = value;
}

/** 深拷贝（数据均为 JSON 安全结构） */
function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

/** 就地递归补齐缺失键：值为 object 递归；否则仅当目标键 undefined 才赋值 */
function deepDefaults(state, def) {
  if (state == null || typeof state !== "object") return state;
  if (def == null || typeof def !== "object") return state;
  for (const k of Object.keys(def)) {
    const defVal = def[k];
    if (defVal !== null && typeof defVal === "object") {
      // 目标是 object 时递归，缺失则先建 {}；否则（如数组也当对象递归）。
      // 注意：只对"目标自身是对象"的情况递归，避免覆盖数组/非对象默认值语义。
      if (state[k] === undefined) {
        state[k] = {};
      }
      if (state[k] !== null && typeof state[k] === "object") {
        deepDefaults(state[k], defVal);
      }
    } else if (state[k] === undefined) {
      state[k] = defVal;
    }
  }
  return state;
}

// —— 引擎 ——

/**
 * 创建基于 sql.js 的文档存储引擎
 * @param {string} sqliteFile 数据库文件路径
 */
async function createEngine(sqliteFile) {
  const SQL = await loadSqlJs();
  let db;

  if (fs.existsSync(sqliteFile)) {
    const buf = fs.readFileSync(sqliteFile);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  // 幂等建表
  db.run(
    "CREATE TABLE IF NOT EXISTS docs (name TEXT PRIMARY KEY, doc TEXT)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS __meta__ (key TEXT PRIMARY KEY, value TEXT)"
  );
  // sql.js 是纯内存库，无需 WAL，落盘靠 export
  db.run("PRAGMA journal_mode = OFF");

  const engine = {
    /** 任意 SQL。SELECT 系列返回对象数组，其余返回 { changes } */
    sql(query, params = []) {
      const head = query.trim().split(/[\s(]/)[0].toUpperCase();
      if (head === "SELECT" || head === "PRAGMA" || head === "EXPLAIN") {
        const stmt = db.prepare(query);
        const rows = [];
        stmt.bind(params);
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      }
      db.run(query, params);
      return { changes: db.getRowsModified() };
    },

    /** 读取文档，JSON 解析返回；不存在返回 null */
    loadDoc(name) {
      const rows = engine.sql("SELECT doc FROM docs WHERE name = ?", [name]);
      if (!rows.length) return null;
      return JSON.parse(rows[0].doc);
    },

    /** 保存文档（整文档覆盖写），写后全量落盘 */
    saveDoc(name, obj) {
      engine.sql(
        "INSERT OR REPLACE INTO docs (name, doc) VALUES (?, ?)",
        [name, JSON.stringify(obj)]
      );
      engine.persist();
    },

    /** 从 db 导出并写盘（行为与 lowdb FileSync 一致：每次写后全量落盘） */
    persist() {
      const data = db.export();
      fs.writeFileSync(sqliteFile, Buffer.from(data));
    },

    /** 读 __meta__ 表，无则 null */
    getMeta(key) {
      const rows = engine.sql(
        "SELECT value FROM __meta__ WHERE key = ?",
        [key]
      );
      return rows.length ? rows[0].value : null;
    },

    /** 写 __meta__ 表（不触发 persist，由调用方按需触发） */
    setMeta(key, value) {
      engine.sql(
        "INSERT OR REPLACE INTO __meta__ (key, value) VALUES (?, ?)",
        [key, String(value)]
      );
    },

    /** 关闭数据库 */
    close() {
      if (db) {
        db.close();
        db = null;
      }
    },
  };

  return engine;
}

/**
 * 包装链（lowdb/lodash 语义）
 * target：当前包装的对象/数组/值。
 * rootState：指根 state 的引用，write() 时整体落盘。
 */
class Chain {
  constructor(target, rootState) {
    this._target = target;
    this._root = rootState !== undefined ? rootState : target;
  }

  value() {
    return this._target;
  }

  get(p) {
    return new Chain(getPath(this._target, p), this._root);
  }

  set(p, v) {
    setPath(this._target, p, v);
    return this;
  }

  has(p) {
    return new Chain(hasPath(this._target, p), this._root);
  }

  push(item) {
    if (Array.isArray(this._target)) {
      this._target.push(item);
    } else {
      throw new Error("push() 目标不是数组");
    }
    return this;
  }

  remove(predicate) {
    if (!Array.isArray(this._target)) {
      throw new Error("remove() 目标不是数组");
    }
    const matches = (item) => {
      if (typeof predicate === "function") return !!predicate(item);
      if (predicate && typeof predicate === "object") {
        return Object.keys(predicate).every(
          (k) => item != null && item[k] === predicate[k]
        );
      }
      // string / 其他：按简单相等（现有代码只用函数/对象）
      return item === predicate;
    };
    for (let i = this._target.length - 1; i >= 0; i--) {
      if (matches(this._target[i])) this._target.splice(i, 1);
    }
    return this;
  }

  write() {
    // 根 state 落盘
    this._root._doWrite();
    return this;
  }
}

/**
 * 创建 lowdb v1 兼容适配对象
 * @param {object} engine createEngine 返回的引擎
 * @param {string} name 文档名
 * @param {object} [defaultValue]
 */
function makeLowdbCompat(engine, name, defaultValue) {
  let state = engine.loadDoc(name);
  if (state === null) {
    state = deepClone(defaultValue || {});
  }

  const compat = {
    getState() {
      return state; // 引用返回
    },
    setState(obj) {
      state = obj;
      return this;
    },
    write() {
      engine.saveDoc(name, state);
      return this;
    },
    defaults(def) {
      deepDefaults(state, def);
      return this;
    },
    get(p) {
      return new Chain(getPath(state, p), compat);
    },
    set(p, v) {
      setPath(state, p, v);
      return this;
    },
    has(p) {
      return new Chain(hasPath(state, p), compat);
    },
  };
  // 供链 write() 落盘根 state 使用
  compat._doWrite = () => engine.saveDoc(name, state);

  return compat;
}

module.exports = {
  getPath,
  setPath,
  hasPath,
  deepClone,
  deepDefaults,
  // 引擎（异步）
  createEngine,
  // 适配
  makeLowdbCompat,
  // 内部导出（供 selfcheck / 其他模块调试）
  parsePath,
  loadSqlJs,
};