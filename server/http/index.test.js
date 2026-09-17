/**
 * server/http/index.js — createApp() 集成测试（真 http.Server，listen(0) 随机端口，用完即 close）
 *
 * 覆盖：S9 listen 返回原生 http.Server；全局中间件按注册序先于路由执行（生产接线：
 * bodyParser.json → cors → 各路由，见 server.js:43-44）；坏 JSON → 500（Express 行为
 * 普查回归项，两种兜底：无错误处理器的 router 兜底 / 生产 handleErrors 接线）；
 * HEAD 按 GET；404 语义。不写死端口，不留驻留进程。
 */
const http = require("http");
const bodyParser = require("body-parser");
const cors = require("cors");
const { test, runTests, assert } = require("../test-lib");
const { createApp } = require("./index");
const { handleErrors } = require("../utils");

function start(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, method, path, { headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** 生命周期包装：finally 必 close，杜绝驻留 */
async function withServer(app, fn) {
  let server = null;
  try {
    server = await start(app);
    return await fn(server.address().port, server);
  } finally {
    if (server) await stop(server);
  }
}

test("listen(0) 返回原生 http.Server 实例且使用随机端口（S9）", async () => {
  await withServer(createApp(), (port, server) => {
    assert.ok(server instanceof http.Server);
    assert.strictEqual(typeof server.on, "function");
    assert.strictEqual(typeof server.close, "function");
    assert.ok(Number.isInteger(port) && port > 0 && port !== 3000);
    // server.js 依赖的原生属性面（server.js:175-176）
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 70000;
    assert.strictEqual(server.keepAliveTimeout, 65000);
  });
});

test("GET 路由端到端：状态/响应体/Content-Type charset", async () => {
  const app = createApp();
  app.get("/api/ping", (req, res) => res.json({ pong: 1 }));
  await withServer(app, async (port) => {
    const r = await request(port, "GET", "/api/ping");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body, '{"pong":1}');
    assert.strictEqual(r.headers["content-type"], "application/json; charset=utf-8");
  });
});

test("全局中间件按注册序执行且先于路由（cors → bodyParser → handler）", async () => {
  const app = createApp();
  const order = [];
  app.use(function corsLike(req, res, next) { order.push("cors"); next(); });
  app.use(function bodyParserLike(req, res, next) { order.push("bodyParser"); next(); });
  app.get("/order", (req, res) => { order.push("handler"); res.end("done"); });
  await withServer(app, async (port) => {
    await request(port, "GET", "/order");
    assert.deepStrictEqual(order, ["cors", "bodyParser", "handler"]);
  });
});

test("真实 cors() 最先挂载时响应带 Access-Control-Allow-Origin", async () => {
  const app = createApp();
  app.use(cors());
  app.get("/api/x", (req, res) => res.end("x"));
  await withServer(app, async (port) => {
    const r = await request(port, "GET", "/api/x");
    assert.strictEqual(r.headers["access-control-allow-origin"], "*");
  });
});

test("坏 JSON → 500：无 4 参处理器时 router 兜底 Internal Server Error（普查回归）", async () => {
  const app = createApp();
  app.use(bodyParser.json({ limit: "5mb" }));
  app.post("/api/echo", (req, res) => res.json(req.body));
  await withServer(app, async (port) => {
    const r = await request(port, "POST", "/api/echo", {
      headers: { "content-type": "application/json" },
      body: '{"broken',
    });
    assert.strictEqual(r.status, 500);
    assert.strictEqual(r.body, "Internal Server Error");
  });
});

test("坏 JSON → 500：生产接线 handleErrors 兜底（utils.js:79）", async () => {
  const app = createApp();
  app.use(bodyParser.json({ limit: "5mb" }));
  app.post("/api/echo", (req, res) => res.json(req.body));
  app.use(handleErrors); // 与 server/routes/index.js:36 相同的兜底
  await withServer(app, async (port) => {
    // handleErrors 自身会 serverLog 错误栈（预期行为），此处静默控制台保持输出干净
    const origLog = console.log;
    const origError = console.error;
    console.log = () => {};
    console.error = () => {};
    let r;
    try {
      r = await request(port, "POST", "/api/echo", {
        headers: { "content-type": "application/json" },
        body: "not-json-at-all",
      });
    } finally {
      console.log = origLog;
      console.error = origError;
    }
    assert.strictEqual(r.status, 500);
    assert.ok(r.body.startsWith("服务器出错:"), r.body);
  });
});

test("合法 JSON 经 bodyParser 后 req.body 可用（body 为对象）", async () => {
  const app = createApp();
  app.use(bodyParser.json({ limit: "5mb" }));
  let seen = null;
  app.post("/api/echo", (req, res) => { seen = req.body; res.json(req.body); });
  await withServer(app, async (port) => {
    const r = await request(port, "POST", "/api/echo", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: "中", n: 2 }),
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(seen, { a: "中", n: 2 });
  });
});

test("HEAD 按 GET 层分发，响应体由 Node 抑制为空", async () => {
  const app = createApp();
  app.get("/head-probe", (req, res) => res.end("payload"));
  await withServer(app, async (port) => {
    const r = await request(port, "HEAD", "/head-probe");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body, "");
  });
});

test("未命中端到端 404：Cannot GET <path>（剥查询）", async () => {
  const app = createApp();
  await withServer(app, async (port) => {
    const r = await request(port, "GET", "/nope?x=1");
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body, "Cannot GET /nope");
  });
});

test("handle 可直接分发 mock 对象且垫片每请求只注入一次（挂载递归不重复）", () => {
  const app = createApp();
  app.get("/probe", (req, res) => {
    res.json({ shim: req.__yshim === true });
  });
  const seen = [];
  const req = { method: "GET", url: "/probe", headers: {} };
  const res = {
    statusCode: 200, headersSent: false, writableEnded: false,
    headers: {}, setHeader() {}, getHeader() {},
    end(c) { seen.push(c); this.writableEnded = true; this.headersSent = true; },
  };
  app.handle(req, res);
  assert.strictEqual(req.__yshim, true);
  assert.strictEqual(String(seen[0]), '{"shim":true}');
});

if (require.main === module) {
  runTests("server/http/index.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
