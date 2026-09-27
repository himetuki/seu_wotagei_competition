/**
 * 路由集成模块
 * （P13：config-routes 已迁入 modules/setting 插件、music-routes 已迁入
 *   modules/music-library 功能件——共享路由层只保留通用基础设施）
 */
const setupApiRoutes = require("./api-routes");
const setupModuleRoutes = require("./module-routes");
const setupStaticRoutes = require("./static-routes");
const setupTestRoutes = require("./test-routes");
const { handle404, handleErrors, serverLog } = require("../utils");

// 设置所有路由
function setupRoutes(app, APP_ROOT, dataDir) {
  // 设置API路由
  setupApiRoutes(app);

  // 设置测试路由
  setupTestRoutes(app);

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
