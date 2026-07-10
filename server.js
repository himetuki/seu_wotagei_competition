/**
 * Y.Stage X 服务器主入口文件
 * 负责启动各个模块化服务
 */

// 导入必要的库
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");

// 导入核心模块
const { getAppRoot, joinPath, dataDir, serverLog } = require("./server/utils");
const { dbManager, initializeAllDatabases } = require("./server/database");
const setupRoutes = require("./server/routes/index");
const { runAllTests } = require("./server/test-utils");
const musicScanner = require("./server/music-scanner"); // 导入音乐扫描模块

// 创建 Express 应用实例
const app = express();
const PORT = process.env.PORT || 3000;

// 应用根目录
const APP_ROOT = getAppRoot();
serverLog(`应用根目录: ${APP_ROOT}`);

// 使用中间件
app.use(bodyParser.json({ limit: "5mb" })); // 增加请求体限制
app.use(cors());

// pkg 环境下加载内联资源
const fs = require("fs");
let inlinedAssets = null;
try {
  inlinedAssets = require("./server/inlined-assets");
} catch (e) { /* 非构建环境 */ }

// pkg 兼容的静态文件中间件
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/resource/json/")) {
    return next();
  }

  const filePath = joinPath(APP_ROOT, req.path);

  // 1. 尝试文件系统
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        ".html": "text/html", ".css": "text/css",
        ".js": "application/javascript", ".json": "application/json",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
        ".mp3": "audio/mpeg", ".wav": "audio/wav",
      };
      res.type(mimeMap[ext] || "application/octet-stream");
      res.send(fs.readFileSync(filePath));
      return;
    }
  } catch (e) { /* fall through */ }

  // 2. 尝试内联资源
  if (inlinedAssets) {
    const asset = inlinedAssets.getAsset(filePath);
    if (asset) {
      res.type(asset.mime);
      res.send(Buffer.from(asset.data, "base64"));
      return;
    }
  }

  next();
});

// ===== 诊断 =====
serverLog("=== 诊断：检查内联资源 ===");
if (inlinedAssets) {
  const count = Object.keys(inlinedAssets.assets).length;
  serverLog(`  内联资源已加载: ${count} 个文件`);
  const testKeys = ["html/index.html", "css/index.css", "js/index.js", "favicon.ico"];
  testKeys.forEach(k => {
    const a = inlinedAssets.getAsset(k);
    if (a) {
      const size = Buffer.from(a.data, "base64").length;
      serverLog(`  ✓ ${k} (${size} bytes, ${a.mime})`);
    } else {
      serverLog(`  ✗ ${k} — 未找到`, "error");
    }
  });
} else {
  serverLog("  未加载内联资源（开发模式，使用文件系统）");
}
serverLog("=== 诊断结束 ===");

// 初始化数据库
try {
  serverLog("正在初始化数据库...");
  initializeAllDatabases(); // 使用新的统一初始化函数
  serverLog("数据库初始化完成");
} catch (error) {
  serverLog(`数据库初始化失败: ${error.message}`, "error");
}

// 使dbManager全局可用于调试
global.dbManager = dbManager;

// 设置路由
setupRoutes(app, APP_ROOT, dataDir);

// 启动服务器
const server = app.listen(PORT, () => {
  serverLog(`服务器运行在 http://localhost:${PORT}`);
  serverLog(`数据文件保存位置: ${path.join(dataDir, "winners.json")}`);
  serverLog(`尝试访问首页: http://localhost:${PORT}`);

  // 初始化音乐扫描模块
  musicScanner.initializeMusicScanner();

  // 检查命令行参数，如果有--test参数，则运行测试
  if (process.argv.includes("--test")) {
    // 延迟1秒运行测试，确保服务器已完全启动
    setTimeout(async () => {
      try {
        await runAllTests(dbManager);
      } catch (error) {
        serverLog(`运行测试时出错: ${error.message}`, "error");
      }
    }, 1000);
  } else {
    serverLog("提示: 使用 'node server.js --test' 来运行数据库操作测试");
  }
});

// 处理 SIGTERM/SIGINT 信号（优雅关闭）
let isShuttingDown = false;
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  serverLog(`收到 ${signal} 信号，正在优雅关闭服务器...`, "warn");

  server.close(() => {
    serverLog("HTTP 服务器已关闭");
    serverLog("服务器已完全关闭", "info");
    process.exit(0);
  });

  // 强制超时关闭
  setTimeout(() => {
    serverLog("强制关闭服务器", "error");
    process.exit(1);
  }, 5000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  serverLog(`未捕获的异常: ${error.message}`, "error");
  console.error(error);
});

// 处理未处理的Promise拒绝
process.on("unhandledRejection", (reason, promise) => {
  serverLog(`未处理的Promise拒绝: ${reason}`, "error");
  console.error(reason);
});

// 处理终端输入，支持运行测试和退出
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (data) => {
  const input = data.trim().toLowerCase();

  if (input === "test" || input === "t") {
    serverLog("手动触发数据库测试...");
    try {
      await runAllTests(dbManager);
    } catch (error) {
      serverLog(`运行测试时出错: ${error.message}`, "error");
    }
  } else if (input === "exit" || input === "quit" || input === "q") {
    serverLog("正在关闭服务器...");
    server.close(() => {
      serverLog("服务器已关闭");
      process.exit(0);
    });
  } else if (input === "help" || input === "h" || input === "?") {
    console.log("\n可用命令:");
    console.log("- test 或 t: 运行数据库测试");
    console.log("- exit 或 quit 或 q: 关闭服务器");
    console.log("- help 或 h 或 ?: 显示帮助信息\n");
  }
});

// 启动时打印使用说明
console.log("\n=== Y.Stage X 服务器命令行操作 ===");
console.log("- 输入 'test' 或 't' 运行数据库操作测试");
console.log("- 输入 'exit' 或 'quit' 或 'q' 关闭服务器");
console.log("- 输入 'help' 或 'h' 或 '?' 显示帮助信息");
console.log("===================================\n");
