/**
 * 内置服务 ctx.db —— 封装 server/database.js 的 dbManager（C8：不得绕过 lowdb 兼容层）
 *
 * ctx.db = {
 *   get(name),        // → { setState, getState, write, set, push, ... } lowdb v1 兼容对象
 *   define(defs),     // defs: [{ name, defaultValue }] —— 桥接进 database.js 既有管道
 *   sql(q, p), exists(name),
 * }
 *
 * define() 语义（与默认路径产出同一 docs 表内容）：
 *  - 引擎未初始化（正常装配时序：cordis 装配 → initializeAllDatabases）：仅经
 *    deps.registerModuleDatabases 登记，INSERT OR IGNORE 由 initializeAllDatabases 统一执行；
 *  - 引擎已初始化（P4 热挂载场景）：立即补写 docs 行 + makeLowdbCompat（照抄
 *    database.js initializeAllDatabases 的逐库逻辑，经 dbManager.init 走兼容层）。
 */
function installDb(ctx, deps) {
  const service = {
    get(name) {
      return deps.dbManager.get(name);
    },

    define(defs) {
      if (!Array.isArray(defs) || defs.length === 0) return;
      deps.registerModuleDatabases(defs);
      if (deps.dbManager.engine) {
        for (const d of defs) {
          if (!d || !d.name) continue;
          const defaultValue = d.defaultValue === undefined ? {} : d.defaultValue;
          deps.dbManager.engine.sql(
            "INSERT OR IGNORE INTO docs (name, doc) VALUES (?, ?)",
            [d.name, JSON.stringify(defaultValue)]
          );
          deps.dbManager.init(d.name, defaultValue);
        }
      }
    },

    sql(query, params = []) {
      return deps.dbManager.sql(query, params);
    },

    exists(name) {
      return deps.dbManager.exists(name);
    },
  };

  ctx.provide("db", service);
  return service;
}

module.exports = { installDb };
