/**
 * y-router 入口：createApp() 返回 Express 同面对象
 *   use/get/post/put/delete/all（注册面）、listen(port[, cb]) → 真 http.Server（S9，server.js
 *   依赖其 .on/.address()/.close/keepAliveTimeout/headersTimeout 零改动）、handle(req,res)。
 */
const http = require("http");
const { YRouter } = require("./router");
const { applyShim } = require("./shim");

function createApp() {
  const router = new YRouter("root");
  const app = {};

  for (const m of ["use", "get", "post", "put", "delete", "all"]) {
    app[m] = (...args) => {
      router[m](...args);
      return app;
    };
  }

  // S9：listen 返回原生 http.Server 实例
  app.listen = function listen(port, cb) {
    const server = http.createServer((req, res) => app.handle(req, res));
    return server.listen(port, cb);
  };

  // 测试与未来迁移入口；垫片每请求注入一次（挂载递归不重复注入）
  app.handle = function handle(req, res) {
    applyShim(req, res);
    router.handle(req, res);
  };

  app.__router = router;
  return app;
}

module.exports = { createApp, YRouter };
