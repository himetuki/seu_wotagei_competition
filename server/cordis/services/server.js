/**
 * 内置服务 ctx.server —— HTTP 注册面（p1-p2-plan-v2.md §1.5 / 规格 §3）
 *
 * ctx.server = {
 *   app,          // y-router createApp() 实例（bootstrap 注入，全局中间件/静态层已挂）
 *   route(cb),    // cb(app, { dbManager, serverLog, dataDir }) —— 签名与 module-loader
 *                 // 旧 applyModuleRoutes 的注入形状一致，模块 routes.js 迁入零改动；
 *                 // 注册进当前插件 scope，插件卸载时 removeScope 物理移除其全部 layer
 *   log(...args),
 * }
 *
 * scope 归属：route() 读内部 currentScope（loader 的包装插件在 apply 前经 __enterScope
 * 设定，插件 fiber 卸载时经 __exitScope 物理移除）。约束：route() 必须在插件 apply 的
 * 同步窗口内调用（与现行 routes.js 的注册时机一致）；loader 顺序 await 各插件挂载，
 * 因此单变量 currentScope 无交错风险。
 *
 * K2/K6 备注（cordis rc.9 实测）：插件卸载 = fiber.dispose()（异步）；同一插件对象
 * 重复 ctx.plugin() 不报错也不替换、而是叠加第二个 fiber —— 防双挂载由 loader 负责。
 */
function installServer(ctx, deps) {
  const router = deps.app.__router; // y-router：scope 物理移除机制挂在这里
  let currentScope = "root";
  // P4 预留：scope -> [cb]，热替换重挂时按此重放路由注册
  const routeSetups = new Map();

  const service = {
    app: deps.app,

    route(cb) {
      if (typeof cb !== "function") {
        throw new Error("ctx.server.route(cb) 需要一个 (app, ctx) => void 回调");
      }
      const scopeName = currentScope;
      const scope = router.createScope(scopeName); // 注册面与 Express app 同面，layer 全部打 scope 标
      if (!routeSetups.has(scopeName)) routeSetups.set(scopeName, []);
      routeSetups.get(scopeName).push(cb);
      cb(scope, {
        dbManager: deps.dbManager,
        serverLog: deps.serverLog,
        dataDir: deps.dataDir,
      });
    },

    log(...args) {
      deps.serverLog(args.map(String).join(" "));
    },

    // 以下两个下划线方法供 server/cordis/loader.js 的包装插件使用，不属于插件公共契约
    __enterScope(name) {
      currentScope = name;
    },
    __exitScope(name) {
      router.removeScope(name); // 物理移除：该 scope 全部 layer 立即 404
      if (currentScope === name) currentScope = "root";
    },
  };

  ctx.provide("server", service);
  return service;
}

module.exports = { installServer };
