/**
 * 路由集成模块
 */
const setupApiRoutes = require("./api-routes");
const setupConfigRoutes = require("./config-routes");
const setupModuleRoutes = require("./module-routes");
const setupStaticRoutes = require("./static-routes");
const setupTestRoutes = require("./test-routes");
const { applyModuleRoutes } = require("../module-loader");
const { handle404, handleErrors, serverLog } = require("../utils");

// 设置所有路由
function setupRoutes(app, APP_ROOT, dataDir) {
  // 设置API路由
  setupApiRoutes(app);

  // 设置配置数据API路由
  setupConfigRoutes(app);

  // 设置测试路由
  setupTestRoutes(app);

  // 注册各模块自带路由（modules/<id>/server/routes.js）
  applyModuleRoutes(app);

  // 设置模块路由（/api/modules 清单 + /m/:id）
  setupModuleRoutes(app);

  // 设置静态文件路由
  setupStaticRoutes(app, APP_ROOT, dataDir);

  // 添加404处理
  app.use(handle404);

  // 添加错误处理
  app.use(handleErrors);

  serverLog("所有路由设置完成");
}

module.exports = setupRoutes;
