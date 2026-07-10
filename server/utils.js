/**
 * 工具函数模块
 */
const path = require("path");
const fs = require("fs");

// 获取应用根目录(兼容打包和非打包环境)
const getAppRoot = () => {
  // 当使用pkg打包时，process.pkg会存在
  // pkg 虚拟文件系统用正斜杠，Windows 反斜杠可能导致匹配失败
  if (process.pkg) {
    return path.dirname(process.execPath).replace(/\\/g, "/");
  }
  return path.join(__dirname, "..");
};

// pkg 兼容的路径拼接（pkg 环境下强制正斜杠）
const joinPath = (...segments) => {
  const joined = path.join(...segments);
  return process.pkg ? joined.replace(/\\/g, "/") : joined;
};

const APP_ROOT = getAppRoot();

// 定义数据目录
const dataDir = joinPath(APP_ROOT, "resource", "json");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 服务端日志函数
const serverLog = (message, type = "info") => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(logMessage);

  // 对于错误类型，也输出到错误流
  if (type === "error") {
    console.error(logMessage);
  }

  return logMessage;
};

// 404处理中间件
const handle404 = (req, res) => {
  serverLog(`404 Not Found: ${req.originalUrl}`, "warn");
  res.status(404).send(`
    <html>
      <head>
        <title>404 - 页面未找到</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
          a { color: #3498db; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>404 - 页面未找到</h1>
        <p>抱歉，您请求的页面不存在。</p>
        <p>URL: ${req.originalUrl}</p>
        <p><a href="/">返回首页</a></p>
      </body>
    </html>
  `);
};

// 错误处理中间件
const handleErrors = (err, req, res, next) => {
  serverLog(`服务器错误: ${err.stack}`, "error");
  res.status(500).send("服务器出错: " + err.message);
};

module.exports = {
  getAppRoot,
  joinPath,
  APP_ROOT,
  dataDir,
  handle404,
  handleErrors,
  serverLog,
};
