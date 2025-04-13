/**
 * 路由集成模块
 */
const setupApiRoutes = require("./api-routes");
const setupGameRoutes = require("./game-routes");
const setupConfigRoutes = require("./config-routes");
const setupStaticRoutes = require("./static-routes");
const setupTestRoutes = require("./test-routes");
const { handle404, handleErrors, serverLog } = require("../utils");

// 设置所有路由
function setupRoutes(app, APP_ROOT, dataDir) {
  // 设置API路由
  setupApiRoutes(app);

  // 设置游戏数据API路由
  setupGameRoutes(app);

  // 设置配置数据API路由
  setupConfigRoutes(app);

  // 设置测试路由
  setupTestRoutes(app);

  // 设置静态文件路由
  setupStaticRoutes(app, APP_ROOT, dataDir);

  // 添加404处理
  app.use(handle404);

  // 添加错误处理
  app.use(handleErrors);

  serverLog("所有路由设置完成");
}

module.exports = setupRoutes;
