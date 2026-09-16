/**
 * 模块加载器
 *
 * 职责：
 *  1. 启动时读取 modules/modules.json（模块注册清单，单一事实来源）
 *  2. 对每个模块检查 modules/<id>/server/：
 *     - routes.js 存在 → require 并在 setupRoutes 阶段注册其 Express 路由
 *     - db.js 存在   → 合并其 lowdb 数据库定义（经 server.js 桥接给 database.js）
 *  3. 导出清单查询接口 getModules() / getModule(id)，供 module-routes 使用
 *
 * 注意（pkg 打包环境）：
 *  - 模块 server 端代码必须被 pkg 显式打包：package.json 中
 *    `pkg.scripts` 需包含 modules 子目录下 server 文件夹的全部 JS 文件。
 *  - 本模块只在启动时按清单 require 固定路径，不做运行时目录扫描。
 */
const fs = require("fs");
const { serverLog, joinPath } = require("./utils");

// 相对 __dirname 解析：开发模式 = <根>/modules；pkg 打包模式 = /snapshot/<根>/modules（虚拟快照内）。
// 统一用 joinPath（pkg 下强制正斜杠）：pkg 虚拟文件系统只认正斜杠，path.join 在 Windows 会产生反斜杠导致 require/fs 失配
const MODULES_DIR = joinPath(__dirname, "..", "modules");
const MANIFEST_PATH = joinPath(MODULES_DIR, "modules.json");

// 已加载的模块清单（module.json 数组）
let modules = [];

// 各模块的路由 setup 函数：{ id, setup(app) }
const setupFns = [];

// 各模块的数据库定义：{ name, defaultValue, ... }
const moduleDatabaseDefs = [];

// 读取模块清单
function loadManifest() {
  // 1. 磁盘读取（开发模式实时生效；pkg 下若资产被内嵌也可走这里）
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    modules = Array.isArray(parsed) ? parsed : parsed.modules || [];
    return modules;
  } catch (e) { /* fall through */ }

  if (process.pkg) {
    // 2. 从内联资产读取（server/inlined-assets.js：构建时生成、以脚本内嵌，pkg 下必定可用）
    try {
      const inlined = require("./inlined-assets");
      const asset = inlined && inlined.getAsset("modules/modules.json");
      if (asset) {
        const parsed = JSON.parse(
          Buffer.from(asset.data, "base64").toString("utf8"),
        );
        modules = Array.isArray(parsed) ? parsed : parsed.modules || [];
        if (modules.length > 0) return modules;
      }
    } catch (e) { /* fall through */ }

    // 3. 直接 require 内嵌 JSON 资产
    try {
      const parsed = require(MANIFEST_PATH);
      modules = Array.isArray(parsed) ? parsed : parsed.modules || [];
      if (modules.length > 0) return modules;
    } catch (e) { /* fall through */ }
  }

  serverLog("加载模块清单失败（开发模式请确保 modules/modules.json 存在）", "error");
  modules = [];
  return modules;
}

// 获取模块 server 端文件内容（db.js / routes.js）
// 开发模式：动态 require（保持 modules.json 修改即时生效）
// pkg 模式：读构建期注册表 server/module-servers.js（静态 require 使 pkg 自动内嵌模块后端文件）
// 返回：模块内容 / null(开发模式文件不存在) / "missing"(pkg 模式文件不存在)
function getModuleServer(modId, file) {
  if (!process.pkg) {
    const p = joinPath(MODULES_DIR, modId, "server", file);
    if (!fs.existsSync(p)) return null;
    try {
      return require(p);
    } catch (e) {
      serverLog(`模块 [${modId}] ${file} 加载失败: ${e.message}`, "error");
      return null;
    }
  }
  try {
    const reg = require("./module-servers");
    const entry = reg && reg.entries ? reg.entries[modId] : undefined;
    if (!entry) return "missing";
    const val = file === "db.js" ? entry.db : entry.routes;
    return val !== undefined ? val : "missing";
  } catch (e) {
    return "missing";
  }
}

// 加载单个模块的 server 端（routes.js / db.js）
function loadModuleServer(mod) {
  if (!mod || !mod.id) return;

  // 1. 数据库定义
  const dbExport = getModuleServer(mod.id, "db.js");
  if (dbExport && dbExport !== "missing") {
    const defs = Array.isArray(dbExport) ? dbExport : dbExport.databases;
    if (Array.isArray(defs) && defs.length > 0) {
      moduleDatabaseDefs.push(...defs);
      serverLog(`  模块 [${mod.id}] 注册数据库: ${defs.map((d) => d.name).join(", ")}`);
    }
  }

  // 2. 路由
  const routesExport = getModuleServer(mod.id, "routes.js");
  if (routesExport && routesExport !== "missing") {
    const fn = typeof routesExport === "function" ? routesExport : routesExport.setup;
    if (typeof fn === "function") {
      setupFns.push({ id: mod.id, setup: fn });
      serverLog(`  模块 [${mod.id}] 注册路由`);
    } else {
      serverLog(`模块 [${mod.id}] routes.js 未导出 setup 函数`, "warn");
    }
  }
}

// 初始化模块（读清单 + 收集 server 端代码）。在数据库初始化与路由设置之前调用。
function initModules() {
  loadManifest();
  modules.forEach(loadModuleServer);
  serverLog(
    `模块加载完成: ${modules.length} 个模块, ${setupFns.length} 个含路由, ${moduleDatabaseDefs.length} 个数据库`
  );
  return modules;
}

// 返回模块清单（引用）
function getModules() {
  return modules;
}

// 按 id 查询模块
function getModule(id) {
  return modules.find((m) => m.id === id) || null;
}

// 注册所有模块路由（由 routes/index.js 调用）
// 模块 routes.js 导出 (app, ctx) => {...}，ctx 注入共享设施，避免模块内写死相对路径深度
function applyModuleRoutes(app) {
  const ctx = {
    dbManager: require("./database").dbManager,
    serverLog,
    dataDir: require("./utils").dataDir,
  };
  setupFns.forEach(({ id, setup }) => {
    try {
      setup(app, ctx);
    } catch (e) {
      serverLog(`模块 [${id}] 路由注册失败: ${e.message}`, "error");
    }
  });
}

// 返回所有模块声明的数据库定义（由 server.js 桥接给 database.js）
function getModuleDatabaseDefs() {
  return moduleDatabaseDefs;
}

module.exports = {
  initModules,
  getModules,
  getModule,
  applyModuleRoutes,
  getModuleDatabaseDefs,
};