/**
 * 静态文件路由模块
 */
const path = require("path");
const fs = require("fs");
const { serverLog, joinPath } = require("../utils");
const { dbManager } = require("../database");

// pkg 环境下加载内联资源（构建时由 build-inline.js 生成）
let inlinedAssets = null;
try {
  inlinedAssets = require("../inlined-assets");
  serverLog(`已加载内联资源: ${Object.keys(inlinedAssets.assets).length} 个文件`);
} catch (e) {
  // 非 pkg 环境或内联文件不存在，正常
}

const mimeMap = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// 发送文件：先试文件系统，再试内联资源
function sendFileSafe(res, filePath) {
  // 1. 尝试文件系统
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.type(mimeMap[ext] || "application/octet-stream");
    res.send(content);
    return true;
  } catch (e) {
    // 文件系统失败，继续
  }

  // 2. 尝试内联资源
  if (inlinedAssets) {
    const asset = inlinedAssets.getAsset(filePath);
    if (asset) {
      const buf = Buffer.from(asset.data, "base64");
      res.type(asset.mime);
      res.send(buf);
      return true;
    }
  }

  return false;
}

// 设置静态文件路由
function setupStaticRoutes(app, APP_ROOT, dataDir) {
  // 服务JSON文件的通用路由
  app.get("/resource/json/:jsonfile", (req, res) => {
    try {
      const jsonFile = req.params.jsonfile;
      const safeName = path.basename(jsonFile);
      const jsonPath = path.join(dataDir, safeName);

      // 首先尝试从文件系统获取
      if (fs.existsSync(jsonPath)) {
        const content = fs.readFileSync(jsonPath, "utf8");
        res.type("application/json").send(content);
      } else {
        // 如果文件不存在，尝试从数据库获取
        const dbName = safeName.replace(/\.json$/, "");
        if (dbManager.exists(dbName)) {
          const data = dbManager.get(dbName).getState();
          res.json(data);
        } else {
          res.status(404).send(`JSON file ${safeName} not found`);
        }
      }
    } catch (error) {
      serverLog(`读取JSON文件[${req.params.jsonfile}]出错: ${error.message}`, "error");
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // 首页
  app.get("/", (req, res) => {
    const filePath = joinPath(APP_ROOT, "html", "index.html");
    if (!sendFileSafe(res, filePath)) {
      res.status(404).send("首页不存在");
    }
  });

  // HTML 文件的直接路由
  app.get("/html/:page", (req, res) => {
    const page = req.params.page;
    const filePath = joinPath(APP_ROOT, "html", `${page}.html`);
    if (!sendFileSafe(res, filePath)) {
      res.status(404).send(`页面 ${page} 不存在`);
    }
  });

  // HTML 文件的二级路由
  app.get("/html/:page.html", (req, res) => {
    const page = req.params.page;
    const filePath = joinPath(APP_ROOT, "html", `${page}.html`);
    if (!sendFileSafe(res, filePath)) {
      res.status(404).send(`页面 ${page} 不存在`);
    }
  });

  // 模糊匹配
  app.use((req, res, next) => {
    if (req.path === "/" || req.path === "" || req.path === "/index") {
      const filePath = joinPath(APP_ROOT, "html", "index.html");
      if (!sendFileSafe(res, filePath)) {
        next();
      }
    } else {
      next();
    }
  });

  serverLog("静态文件路由已设置完成");
}

module.exports = setupStaticRoutes;
