/**
 * 静态文件路由模块
 */
const path = require("path");
const fs = require("fs");
const { serverLog } = require("../utils");
const { dbManager } = require("../database");

// 设置静态文件路由
function setupStaticRoutes(app, APP_ROOT, dataDir) {
  // 服务JSON文件的通用路由
  app.get("/resource/json/:jsonfile", (req, res) => {
    try {
      const jsonFile = req.params.jsonfile;
      const safeName = path.basename(jsonFile);
      const jsonPath = path.join(dataDir, safeName);

      serverLog(`请求JSON文件: ${safeName}`);

      // 首先尝试从文件系统获取
      if (fs.existsSync(jsonPath)) {
        serverLog(`提供文件系统中的JSON: ${jsonPath}`);
        const content = fs.readFileSync(jsonPath, "utf8");
        res.type("application/json").send(content);
      } else {
        // 如果文件不存在，尝试从数据库获取
        const dbName = safeName.replace(/\.json$/, "");

        if (dbManager.exists(dbName)) {
          serverLog(`提供数据库中的JSON: ${dbName}`);
          const data = dbManager.get(dbName).getState();
          res.json(data);
        } else {
          serverLog(`JSON文件未找到: ${safeName}`, "warn");
          res.status(404).send(`JSON file ${safeName} not found`);
        }
      }
    } catch (error) {
      serverLog(
        `读取JSON文件[${req.params.jsonfile}]出错: ${error.message}`,
        "error"
      );
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 首页重定向
  app.get("/", (req, res) => {
    res.sendFile(path.join(APP_ROOT, "html", "index.html"));
  });

  // HTML文件的直接路由
  app.get("/html/:page", (req, res) => {
    const page = req.params.page;
    const htmlFile = path.join(APP_ROOT, "html", `${page}.html`);

    if (fs.existsSync(htmlFile)) {
      res.sendFile(htmlFile);
    } else {
      res.status(404).send(`页面 ${page} 不存在`);
    }
  });

  // HTML文件的二级路由
  app.get("/html/:page.html", (req, res) => {
    const page = req.params.page;
    const htmlFile = path.join(APP_ROOT, "html", `${page}.html`);

    if (fs.existsSync(htmlFile)) {
      res.sendFile(htmlFile);
    } else {
      res.status(404).send(`页面 ${page} 不存在`);
    }
  });

  // 模糊匹配的重定向
  app.use((req, res, next) => {
    if (req.path === "/" || req.path === "" || req.path === "/index") {
      res.sendFile(path.join(APP_ROOT, "html", "index.html"));
    } else {
      next();
    }
  });

  serverLog("静态文件路由已设置完成");
}

module.exports = setupStaticRoutes;
