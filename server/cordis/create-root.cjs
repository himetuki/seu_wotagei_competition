/**
 * cordis 后端内核打包入口（esbuild → server/cordis/kernel.cjs）
 *
 * D1 硬性约束：本文件与 services/ 只允许 require("cordis")（及其纯 JS 依赖），
 * 零项目相对 require —— esbuild bundle 时不得内联 database.js / http 层等任何项目设施。
 * 一切项目能力经 createBackendRoot(deps) 参数注入：
 *   deps = {
 *     app,                       // y-router createApp() 实例（app.__router 为 YRouter）
 *     dbManager,                 // server/database.js 的单例
 *     registerModuleDatabases,   // database.js 的桥接管道（ctx.db.define 走它，防双实例）
 *     serverLog,                 // server/utils.js 日志
 *     dataDir,                   // server/utils.js 数据目录
 *     joinPath, APP_ROOT,        // 路径设施
 *   }
 *
 * cordis@4.0.0-rc.9 实测 API（K1-K11 核对结论，详见 selfcheck.cjs 头注释）：
 *   K1  new Context() 即根 Context，无需 start()；根 fiber 立即 ACTIVE
 *   K3  ctx.provide(name, value) 存在，实现为根 fiber 上的 effect（随根存活，不随插件卸载）
 *   K5  ctx.effect(fn) 同步执行 fn，返回 disposer；插件卸载时按注册逆序回收
 */
const { Context } = require("cordis");
const { installServer } = require("./services/server");
const { installDb } = require("./services/db");
const { installModules } = require("./services/modules");

/**
 * 创建后端根 Context 并装上三个内置服务。
 * 服务挂在根 fiber 上（进程生命周期），插件经 ctx.server / ctx.db / ctx.modules 访问。
 * 根 Context 不提供 dispose：cordis rc.9 中根 fiber.dispose() 语义是 restart 而非卸载，
 * 内核服务本就应与进程同寿；插件级回收由各插件自己 fiber 的 effect/dispose 承担。
 */
function createBackendRoot(deps) {
  const ctx = new Context();
  installServer(ctx, deps);
  installDb(ctx, deps);
  installModules(ctx, deps);
  return { ctx };
}

module.exports = { createBackendRoot };
