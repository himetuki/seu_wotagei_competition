/**
 * Y.Stage X 服务器主入口文件
 * 负责启动各个模块化服务
 */

// 导入必要的库
const { createApp } = require("./server/http"); // y-router HTTP 层（自研，Express 兼容面）
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

// 导入核心模块
const { getAppRoot, dataDir, serverLog } = require("./server/utils");
const paths = require("./server/paths.cjs");
const { dbManager, initializeAllDatabases, registerModuleDatabases } = require("./server/database");
const setupRoutes = require("./server/routes/index");
const { runAllTests } = require("./server/test-utils");
const musicScanner = require("./server/music-scanner"); // 导入音乐扫描模块

// 创建应用实例（y-router，listen 返回真 http.Server，其余监听逻辑零改动）
const app = createApp();
const PORT = Number(process.env.PORT) || 3000; // 强转数字，避免字符串拼接导致端口异常

// cordis 装配自检（C9：必须显式退出，不起 HTTP 服务器；--test-cordis 为历史关口名，语义=装配自检）
if (process.argv.includes("--test-cordis")) {
  require("./server/cordis/selfcheck.cjs")
    .run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error("selfcheck 异常:", error);
      process.exit(1);
    });
  return; // F1：自检进程内只发生一次装配（selfcheck 自带 assembleBackend），不继续 bootstrap 双重装配
}

// 应用根目录
const APP_ROOT = getAppRoot();
serverLog(`应用根目录: ${APP_ROOT}`);

// 使用中间件
app.use(bodyParser.json({ limit: "5mb" })); // 增加请求体限制
app.use(cors());

// 静态文件中间件（自本文件整体平移至 server/http/static.js：Range/416 逐行保留；
// P6b 起 /resource/** 锚定 RESOURCE_DIR，一切皆真实文件，无内联兜底）
app.use(require("./server/http/static")({ APP_ROOT }));

// ===== 诊断：运行时关键文件存在性（fs 直查，P6b 起替代内联资产诊断） =====
serverLog("=== 诊断：检查运行时关键文件 ===");
serverLog(`  模式: ${paths.isPortable() ? "便携（plugins/resource 外置）" : "开发（一切在应用根内）"}`);
[
  ["后端装配清单", paths.backendManifestPath()],
  ["前端装配清单", paths.frontManifestPath()],
  ["模块宇宙清单", paths.modulesManifestPath()],
  ["cordis 内核（npm run build:kernel 产物）", path.join(APP_ROOT, "server", "cordis", "kernel.cjs")],
  ["前端内核（npm run build:web 产物）", path.join(APP_ROOT, "web", "dist", "kernel.js")],
].forEach(([label, p]) => {
  serverLog(`  ${fs.existsSync(p) ? "✓" : "✗"} ${label}: ${p}${fs.existsSync(p) ? "" : " — 未找到"}`);
});
serverLog("=== 诊断结束 ===");

// 启动引导：插件装配 + 数据库初始化（async）+ 路由 + 监听的统一封装
async function bootstrap() {
  // cordis 插件装配（P5a 起唯一装配路径）：装配（清单读取 + 插件挂载 + 元数据投影）
  // → 数据库 → 路由。时序硬约束：装配必须先于 initializeAllDatabases()，否则
  // ctx.db.define 桥接的模块库缺 docs 行（静默以空 {} 兜底，数据形变）。
  try {
    serverLog("[cordis] 正在装配后端插件...");
    const { assembleBackend } = require("./server/cordis/loader");
    const result = await assembleBackend({ app, dbManager, registerModuleDatabases, serverLog });
    if (result.errors.length > 0) {
      // 装配错误不阻止启动（loader 已回退），但逐条上报
      result.errors.forEach((e) => serverLog(e.message, "error"));
    }
    // /api/modules 与 /m/:id 元数据源切到 ctx.modules
    const registry = require("./server/module-registry.cjs");
    registry.setSource(
      () => result.ctx.modules.list(),
      (id) => result.ctx.modules.get(id)
    );
    serverLog("模块系统初始化完成（cordis 装配）");
  } catch (error) {
    // kernel.cjs 缺失等装配失败：快速失败（唯一装配路径，无 legacy 兜底可退）
    serverLog(`[cordis] 装配失败: ${error.message}（若为产物缺失请先运行 npm run build:kernel）`, "error");
    process.exit(1);
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

      // 检查命令行参数，如果有--test参数，则运行测试（测完自动退出，避免驻留挂进程）
      if (process.argv.includes("--test")) {
        // 延迟1秒运行测试，确保服务器已完全启动
        setTimeout(async () => {
          let failed = false;
          try {
            await runAllTests(dbManager);
          } catch (error) {
            serverLog(`运行测试时出错: ${error.message}`, "error");
            failed = true;
          }
          process.exit(failed ? 1 : 0);
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
      httpServer.close(() => {
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
