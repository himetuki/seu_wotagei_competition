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
const { dbManager, initializeAllDatabases, registerModuleDatabases } = require("./server/database");
const { initModules, getModuleDatabaseDefs } = require("./server/module-loader");
const setupRoutes = require("./server/routes/index");
const { runAllTests } = require("./server/test-utils");
const musicScanner = require("./server/music-scanner"); // 导入音乐扫描模块

// 创建 Express 应用实例
const app = express();
const PORT = Number(process.env.PORT) || 3000; // 强转数字，避免字符串拼接导致端口异常

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

  // 解码路径：req.path 保持百分号编码，中文/日文文件名会查不到
  let relPath;
  try {
    relPath = decodeURIComponent(req.path);
  } catch (e) {
    relPath = req.path;
  }
  const filePath = joinPath(APP_ROOT, relPath);

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
      res.set("Accept-Ranges", "bytes");

      const fileSize = fs.statSync(filePath).size;
      const range = req.headers.range;

      if (range) {
        // 支持 Range 分片（媒体流/断点续传必需）：格式 bytes=start-end / bytes=-suffix
        const m = /^bytes=(\d*)-(\d*)?$/.exec(range);
        if (m) {
          let start, end;
          if (m[1] === "" && m[2] !== undefined) {
            // 后缀范围：bytes=-N
            start = Math.max(fileSize - parseInt(m[2], 10), 0);
            end = fileSize - 1;
          } else {
            start = m[1] ? parseInt(m[1], 10) : 0;
            end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
          }
          if (isNaN(start)) start = 0;
          if (isNaN(end) || end >= fileSize) end = fileSize - 1;

          // 无效范围
          if (start > end || start >= fileSize) {
            res.status(416).set("Content-Range", `bytes */${fileSize}`).end();
            return;
          }

          res.status(206);
          res.set({
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": end - start + 1,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }

      // 无 Range：整文件流式发送（避免大文件整包读入内存）
      res.set("Content-Length", fileSize);
      fs.createReadStream(filePath).pipe(res);
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
  const testKeys = ["modules/home/index.html", "modules/select/app.js", "favicon.ico"];
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

// 启动引导：模块初始化 + 数据库初始化（async）+ 路由 + 监听的统一封装
async function bootstrap() {
  // 初始化模块（收集各模块 server 端代码与数据库定义）——必须在数据库初始化前
  try {
    serverLog("正在初始化模块系统...");
    initModules();
    // 把模块声明的数据库定义桥接给 database.js
    registerModuleDatabases(getModuleDatabaseDefs());
    serverLog("模块系统初始化完成");
  } catch (error) {
    serverLog(`模块系统初始化失败: ${error.message}`, "error");
  }

  // 初始化数据库
  try {
    serverLog("正在初始化数据库...");
    await initializeAllDatabases(); // 使用新的统一初始化函数（async）
    serverLog("数据库初始化完成");
  } catch (error) {
    serverLog(`数据库初始化失败: ${error.message}`, "error");
    process.exit(1);
  }

  // 使dbManager全局可用于调试
  global.dbManager = dbManager;

  // 设置路由
  setupRoutes(app, APP_ROOT, dataDir);

  // 启动服务器（端口被占用时自动回退到下一个端口，最多尝试 10 次）
  let httpServer = null;

  const startServer = (port, attempt) => {
    const server = app.listen(port);

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempt < 10) {
        serverLog(`端口 ${port} 被占用，尝试端口 ${port + 1} ...`, "warn");
        startServer(port + 1, attempt + 1);
      } else {
        serverLog(`服务器启动失败: ${err.message}`, "error");
        process.exit(1);
      }
    });

    server.on("listening", () => {
      httpServer = server;
      const actualPort = server.address().port;
      serverLog(`服务器运行在 http://localhost:${actualPort}`);
      serverLog(`数据文件保存位置: ${path.join(dataDir, "winners.json")}`);
      serverLog(`尝试访问首页: http://localhost:${actualPort}`);

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

    // 调大 keep-alive 空闲超时：Node 默认 5s 会过早关闭空闲长连接，
    // 浏览器在页面操作间隔后（如轮次变换触发保存）复用已被服务端关闭的 socket，
    // 在途 POST 会被直接中止（net::ERR_ABORTED，保存静默丢失）。
    // headersTimeout 需大于 keepAliveTimeout，避免触发 431/连接重置。
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 70000;
  };

  startServer(PORT, 0);

  // 处理 SIGTERM/SIGINT 信号（优雅关闭）
  let isShuttingDown = false;
  const gracefulShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    serverLog(`收到 ${signal} 信号，正在优雅关闭服务器...`, "warn");

    if (!httpServer) {
      process.exit(0);
    }
    httpServer.close(() => {
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
}

bootstrap().catch((error) => {
  serverLog(`启动失败: ${error.message}`, "error");
  process.exit(1);
});
