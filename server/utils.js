/**
 * 工具函数模块
 */
const path = require("path");
const fs = require("fs");
const paths = require("./paths.cjs");

// 应用根目录（app 目录；pkg 快照机制已退役，dev/便携统一为真实文件路径）
const getAppRoot = () => paths.resolvePaths().appRoot;

// 路径拼接（P6b：pkg 正斜杠规范化已随 pkg 退役，纯 path.join）
const joinPath = (...segments) => path.join(...segments);

// ---- 路径安全（纵深防御）----
// 本项目的插件层（modules/**）与数据层（resource/**）在便携形态下是可写目录，
// 凡"外部输入 → 文件路径"的汇聚点一律经此校验，避免 ./.. 逃逸到目录树之外。

/** 拼出绝对路径并断言仍位于 base 之内；越界抛错。用于用户输入参与拼接的场景。 */
const safeJoin = (base, ...segments) => {
  const root = path.resolve(base);
  const resolved = path.resolve(root, ...segments);
  const rel = path.relative(root, resolved);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`路径越界（拒绝访问 base 之外）: ${segments.filter(Boolean).join("/")}`);
  }
  return resolved;
};

/** 只取纯文件名（剥离任何目录成分）；空/非法返回 null。用于"只接受文件名"的入参。 */
const safeBasename = (name) => {
  if (typeof name !== "string" || !name) return null;
  const stripped = path.basename(name);
  // basename 会剥掉路径，若结果与原值不同说明入参含目录成分 → 拒绝而非静默接受
  if (stripped !== name || stripped === "." || stripped === "..") return null;
  return stripped;
};

/** 校验模块 id 为安全 slug（小写字母/数字/连字符），非法抛错。清单/URL 入参用。 */
const assertSafeId = (id) => {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`非法模块 id: ${JSON.stringify(id)}（仅允许小写字母/数字/连字符）`);
  }
  return id;
};

const APP_ROOT = getAppRoot();

// 数据目录（resource 层可经 Y_STAGE_RESOURCE_DIR 外置，见 server/paths.cjs）
const dataDir = paths.jsonDir();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// sqlite 存储目录
const sqliteDir = paths.sqliteDir();
if (!fs.existsSync(sqliteDir)) {
  fs.mkdirSync(sqliteDir, { recursive: true });
}

// sqlite 数据库文件路径
const sqliteFile = paths.sqliteFile();

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
  safeJoin,
  safeBasename,
  assertSafeId,
  APP_ROOT,
  dataDir,
  sqliteDir,
  sqliteFile,
  handle404,
  handleErrors,
  serverLog,
};
