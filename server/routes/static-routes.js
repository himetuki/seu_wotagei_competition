/**
 * 静态文件路由模块
 */
const path = require("path");
const fs = require("fs");
const paths = require("../paths.cjs");
const { serverLog, safeBasename, safeJoin } = require("../utils");
const { dbManager } = require("../database");

const mimeMap = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
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

// 发送文件（P6b：inlined-assets 兜底随 pkg 退役，真实文件直读）
// P11：模块代码/页面属"随代码发布的资产"，发 no-cache + ETag/Last-Modified，
// 并支持 If-None-Match → 304——未变更时浏览器免下载，已变更立即拿到新代码
//（否则模块 front/*.js 被启发式缓存后，迁移/修复的代码到不了浏览器）。
function sendFileSafe(req, res, filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.type(mimeMap[ext] || "application/octet-stream");
    const etag = `W/"${content.length}-${Math.floor(fs.statSync(filePath).mtimeMs)}"`;
    res.set({
      "Cache-Control": "no-cache",
      ETag: etag,
      "Last-Modified": fs.statSync(filePath).mtime.toUTCString(),
    });
    if (req && req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return true;
    }
    res.send(content);
    return true;
  } catch (e) {
    return false;
  }
}

// 设置静态文件路由
function setupStaticRoutes(app, APP_ROOT, dataDir) {
  // 服务JSON文件的通用路由
  app.get("/resource/json/:jsonfile", (req, res) => {
    try {
      const jsonFile = req.params.jsonfile;
      // 只接受纯文件名：URL 段含目录成分（. / \ 等）一律拒绝，防逃逸出 json 数据目录
      const safeName = safeBasename(jsonFile);
      if (!safeName) {
        return res.status(400).send("非法文件名");
      }
      const jsonPath = safeJoin(dataDir, safeName);

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

  // 首页（直接服务 home 模块，避免存根跳转）
  app.get("/", (req, res) => {
    const filePath = path.join(paths.modulesDir(), "home", "index.html");
    if (!sendFileSafe(req, res, filePath)) {
      res.status(404).send("首页不存在");
    }
  });

  // 模糊匹配
  app.use((req, res, next) => {
    if (req.path === "/" || req.path === "" || req.path === "/index") {
      const filePath = path.join(paths.modulesDir(), "home", "index.html");
      if (!sendFileSafe(req, res, filePath)) {
        next();
      }
    } else {
      next();
    }
  });

  serverLog("静态文件路由已设置完成");
}

module.exports = setupStaticRoutes;
module.exports.sendFileSafe = sendFileSafe;
