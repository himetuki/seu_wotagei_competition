/**
 * 数据库管理模块（SQLite / sql.js 引擎版）
 *
 * 由 lowdb + FileSync 迁移到 sqlite-store 的 createEngine / makeLowdbCompat。
 * 保留对外契约，并对路由/模块暴露 lowdb v1 兼容对象，零改动上层调用。
 */
const fs = require("fs");
const path = require("path");
const {
  dataDir,
  sqliteFile,
  serverLog,
  joinPath,
} = require("./utils");
const { createEngine, makeLowdbCompat } = require("./sqlite-store");

// 要初始化的数据库定义（内置 + 后续模块注册合并）
const databases = [
  { name: "winners", defaultValue: {} },
  {
    name: "settings",
    defaultValue: {
      debugMode: false,
      enableAnimations: true,
      language: "zh-CN",
      configFiles: {
        player1: { path: "resource/json/player1.json", lastModified: null },
        player2: { path: "resource/json/player2.json", lastModified: null },
        tricks: { path: "resource/json/tricks.json", lastModified: null },
        musics_list: {
          path: "resource/json/musics_list.json",
          lastModified: null,
        },
        musics_list_ex: {
          path: "resource/json/musics_list_ex.json",
          lastModified: null,
        },
      },
      configBackups: {
        player1: { data: null, lastModified: null },
        player2: { data: null, lastModified: null },
        tricks: { data: null, lastModified: null },
        musics_list: { data: null, lastModified: null },
        musics_list_ex: { data: null, lastModified: null },
      },
    },
  },
  { name: "statistics", defaultValue: { games: 0, battles: 0 } },
  { name: "player1", defaultValue: [] },
  { name: "player2", defaultValue: [] },
  { name: "tricks", defaultValue: [] },
  { name: "tricks_for_group2", defaultValue: [] },
  { name: "musics_list", defaultValue: [] },
  { name: "musics_list_ex", defaultValue: [] },
  {
    name: "award",
    defaultValue: { 1: "冠军奖品", 2: "亚军奖品", 3: "季军奖品" },
  },
];

// 模块动态注册的数据库（由 server.js 桥接 module-loader 的结果）
const moduleDatabases = [];

/**
 * 注册模块声明的数据库定义（各模块 server/db.js 导出的数组）
 * 与内置 databases 去重合并：内置优先，同名模块定义被忽略
 */
function registerModuleDatabases(list) {
  if (!Array.isArray(list)) return;
  moduleDatabases.push(...list);
}

// 内置 + 模块 合并后的完整数据库定义
function getAllDatabaseDefs() {
  const map = new Map();
  databases.forEach((d) => map.set(d.name, d));
  moduleDatabases.forEach((d) => map.set(d.name, d));
  return [...map.values()];
}

// 创建一个数据库管理器，底层为单个 sqlite 引擎
const dbManager = {
  dbs: {},
  engine: null, // 初始化后指向 createEngine 返回的引擎

  /** 透传底层的任意 SQL（SELECT 系列返回对象数组，其余返回 { changes }） */
  sql(query, params = []) {
    if (!this.engine) {
      throw new Error("数据库引擎尚未初始化");
    }
    return this.engine.sql(query, params);
  },

  /** 初始化指定名称的数据库。已存在直接返回；否则创建含默认值的文档 */
  init(dbName, defaultValue = {}) {
    if (!this.dbs[dbName]) {
      this.dbs[dbName] = makeLowdbCompat(
        this.engine,
        dbName,
        defaultValue || {}
      );
    }
    return this.dbs[dbName];
  },

  /** 获取指定数据库实例（无则自动创建，默认 {}） */
  get(dbName) {
    if (!this.dbs[dbName]) {
      return this.init(dbName);
    }
    return this.dbs[dbName];
  },

  /** 检查数据库是否已在本进程初始化 */
  exists(dbName) {
    return !!this.dbs[dbName];
  },
};

/**
 * 一次性数据迁移：把 db 管理的 resource/json/<name>.json 导入 SQLite 并删除文件。
 * 仅在首次切换（__meta__.dataSource !== "v2"）时执行，迁移后以 meta 标记防止重复。
 */
function migrateFromJson(defs) {
  let migrated = 0;
  let deleted = 0;

  for (const d of defs) {
    const jp = joinPath(dataDir, `${d.name}.json`);
    if (!fs.existsSync(jp)) continue;

    let content;
    try {
      content = JSON.parse(fs.readFileSync(jp, "utf8"));
    } catch (error) {
      serverLog(
        `迁移跳过 ${d.name}：解析 ${jp} 失败（${error.message}），文件保留`,
        "warn"
      );
      continue;
    }

    // 写入引擎（saveDoc 自带 persist），并重建内存兼容对象
    dbManager.engine.saveDoc(d.name, content);
    dbManager.dbs[d.name] = makeLowdbCompat(dbManager.engine, d.name, content);
    fs.unlinkSync(jp);
    migrated += 1;
    deleted += 1;
    serverLog(`已迁移数据库 ${d.name} 并删除 JSON 文件`);
  }

  serverLog(
    `JSON → SQLite 迁移完成：迁移 ${migrated} 个库，删除 ${deleted} 个 json 文件`
  );
}

// 初始化所有数据库
async function initializeAllDatabases() {
  try {
    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      serverLog(`创建数据目录: ${dataDir}`);
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 创建 SQLite 引擎
    dbManager.engine = await createEngine(sqliteFile);
    serverLog(`SQLite 引擎已创建: ${sqliteFile}`);

    const defs = getAllDatabaseDefs();

    // 为每个 db 若 docs 行不存在则写入默认值
    for (const db of defs) {
      dbManager.engine.sql(
        "INSERT OR IGNORE INTO docs (name, doc) VALUES (?, ?)",
        [db.name, JSON.stringify(db.defaultValue)]
      );
      dbManager.dbs[db.name] = makeLowdbCompat(
        dbManager.engine,
        db.name,
        db.defaultValue
      );
    }

    // 一次性数据迁移（首次切换时导入既有 json 并删除）
    if (dbManager.engine.getMeta("dataSource") !== "v2") {
      migrateFromJson(defs);
      dbManager.engine.setMeta("dataSource", "v2");
      dbManager.engine.persist(); // setMeta 不自动落盘，必须显式 persist
    } else {
      serverLog("已迁移过（dataSource=v2），跳过 JSON 迁移");
    }

    serverLog("SQLite 数据库初始化完成");
    return true;
  } catch (error) {
    serverLog(`初始化数据库错误: ${error.message}`, "error");
    throw error;
  }
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  initializeAllDatabases().then(() => {
    console.log("SQLite 初始化完成");
  });
}

module.exports = {
  dbManager,
  initializeAllDatabases,
  databases,
  registerModuleDatabases,
  getAllDatabaseDefs,
};