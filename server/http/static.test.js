/**
 * F5 路径穿越防护测试 — server/http/static.js 与 server/routes/module-routes.js
 *
 * 覆盖：/../package.json 绝对逃逸、%2e%2e 与 ..%2f / ..%5c 编码变体、
 *       /m/<id>/../../ 根内逃逸（static 层、module-routes 层各自独立拦截）、
 *       回归：合法静态文件与模块资源不受影响（无误伤 403）。
 * 静态层/双层用例一律走真 http.Server（mock res 缺 pipe 所需方法会意外改变分发路径，
 * 产生假阳性）；module-routes 守卫可单独以 dispatch 验证（403 分支不触碰文件流）。
 */
const http = require("http");
const { test, runTests, assert, dispatch } = require("../test-lib");
const { createApp } = require("./index");
const createStaticMiddleware = require("./static");
const setupModuleRoutes = require("../routes/module-routes");
const registry = require("../module-registry.cjs");
const { APP_ROOT } = require("../utils");

// 假模块源：不依赖 module-loader 初始化，只注册一个 id=drag 的模块
registry.setSource(
  () => [{ id: "drag", name: "拖拽" }],
  (id) => (id === "drag" ? { id: "drag", name: "拖拽" } : null)
)

/** 仅静态中间件（server.js 同款接线） */
function staticOnlyApp() {
  const app = createApp();
  app.use(createStaticMiddleware({ APP_ROOT }));
  return app;
}

/** 仅模块路由（隔离验证 module-routes 守卫；生产中 static 在前，双层防御各自独立成立） */
function moduleRoutesOnlyApp() {
  const app = createApp();
  setupModuleRoutes(app);
  return app;
}

async function withServer(app, fn) {
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0);
    s.once("listening", () => resolve(s));
    s.once("error", reject);
  });
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function get(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    }).on("error", reject);
  });
}

/** 以 tmp 外置资源目录起纯静态服务（Y_STAGE_RESOURCE_DIR 每次请求读 env），finally 清理 */
async function withResourceDir(files, fn) {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-cache-"));
  const prev = process.env.Y_STAGE_RESOURCE_DIR;
  process.env.Y_STAGE_RESOURCE_DIR = dir;
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      // fixture 键均为测试内硬编码字面量；仍显式限定写入范围，键含 .. 时立即失败而非越出 tmp
      const relToDir = path.relative(dir, abs);
      if (relToDir.startsWith("..") || path.isAbsolute(relToDir)) {
        throw new Error(`withResourceDir: fixture 键越出临时目录：${rel}`);
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.Y_STAGE_RESOURCE_DIR;
    else process.env.Y_STAGE_RESOURCE_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- static 层（真实 HTTP） ----

test("穿越：GET /../package.json → 403（static 层）", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    assert.strictEqual((await get(port, "/../package.json")).status, 403);
  });
});

test("穿越：编码变体 /%2e%2e/package.json → 403", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    assert.strictEqual((await get(port, "/%2e%2e/package.json")).status, 403);
  });
});

test("穿越：混合编码 /..%2fpackage.json → 403", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    assert.strictEqual((await get(port, "/..%2fpackage.json")).status, 403);
  });
});

// ---- module-routes 层（dispatch：403 分支不触碰文件流，结果确定） ----

test("穿越：/m/drag/../../server/database.js → 403（module-routes 守卫）", () => {
  const { res } = dispatch(moduleRoutesOnlyApp(), "GET", "/m/drag/../../server/database.js");
  assert.strictEqual(res.statusCode, 403);
});

test("穿越：编码变体 /m/drag/%2e%2e/%2e%2e/server/database.js → 403", () => {
  const { res } = dispatch(moduleRoutesOnlyApp(), "GET", "/m/drag/%2e%2e/%2e%2e/server/database.js");
  assert.strictEqual(res.statusCode, 403);
});

test("穿越：反斜杠变体 /m/drag/..%5c..%5cserver/database.js → 403", () => {
  const { res } = dispatch(moduleRoutesOnlyApp(), "GET", "/m/drag/..%5c..%5cserver/database.js");
  assert.strictEqual(res.statusCode, 403);
});

// ---- 双层（生产接线：static 在前）真实 HTTP 端到端 ----

test("双层（生产接线）：/m 穿越端到端 403", async () => {
  const app = staticOnlyApp();
  setupModuleRoutes(app);
  await withServer(app, async (port) => {
    for (const p of [
      "/m/drag/../../server/database.js",
      "/m/drag/%2e%2e/%2e%2e/server/database.js",
      "/m/drag/..%5c..%5cserver/database.js",
    ]) {
      const r = await get(port, p);
      assert.strictEqual(r.status, 403, p + " → " + r.status);
    }
  });
});

// ---- 回归：P5a 最小白名单（static.js）——白名单内可达，源码/配置不可读 ----

test("回归：白名单内 /web/front.json、/resource/images、/favicon.ico 仍为 200", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    const web = await get(port, "/web/front.json");
    assert.strictEqual(web.status, 200);
    assert.ok(web.body.startsWith("{"), "应为 JSON 文件内容");
    // /resource/json/ 本就被 static 中间件跳过（归 /resource/json/:file 路由），用 images 验白名单
    const img = await get(port, "/resource/images/bg.jpg");
    assert.strictEqual(img.status, 200);
    const ico = await get(port, "/favicon.ico");
    assert.strictEqual(ico.status, 200);
  });
});

test("回归：白名单外源码 /package.json、/server/database.js 不再静态可读（404）", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    assert.strictEqual((await get(port, "/package.json")).status, 404);
    assert.strictEqual((await get(port, "/server/database.js")).status, 404);
  });
});

test("回归：/resource/sqlite/ 业务库目录被白名单排除（404）", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    assert.strictEqual((await get(port, "/resource/sqlite/y-stage.sqlite")).status, 404);
  });
});

test("回归：合法模块资源 /m/drag/index.html 仍为 200", async () => {
  await withServer(moduleRoutesOnlyApp(), async (port) => {
    const r = await get(port, "/m/drag/index.html");
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.includes("<!doctype html") || r.body.includes("<!DOCTYPE html"), "应为 HTML 页面");
  });
});


// ---- P6b 终审 [P1]：/web/front.json 动态解析 frontManifestPath（便携 env） ----

test('P6b [P1]：设 Y_STAGE_PLUGINS_DIR 后 /web/front.json 服务外置清单，toggle 落盘即时反映', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'front-manifest-'));
  const manifestPath = path.join(pluginsDir, 'front.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    provider: { ui: 'dom', marker: 'portable-p1' },
    plugins: [{ target: 'modules/x', enabled: true }],
  }));
  process.env.Y_STAGE_PLUGINS_DIR = pluginsDir;
  try {
    await withServer(staticOnlyApp(), async (port) => {
      const r1 = await get(port, '/web/front.json');
      assert.strictEqual(r1.status, 200);
      assert.ok(r1.body.includes('portable-p1'), '应返回外置清单内容（而非 app/web 冻结副本）');
      // 模拟管理页 toggleFront 落盘：改写外置清单 → 同一服务进程内立即反映（无需重启）
      fs.writeFileSync(manifestPath, JSON.stringify({
        provider: { ui: 'dom', marker: 'portable-p1' },
        plugins: [{ target: 'modules/x', enabled: false }],
      }));
      const r2 = await get(port, '/web/front.json');
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(JSON.parse(r2.body).plugins[0].enabled, false, 'toggle 后立即反映');
    });
  } finally {
    delete process.env.Y_STAGE_PLUGINS_DIR;
    fs.rmSync(pluginsDir, { recursive: true, force: true });
  }
});

// ---- P8a：静态资源 HTTP 缓存协商（条件请求优先于 Range，304 无 body） ----

const CACHE_FIXTURE = { "images/a.jpg": "x".repeat(300) };

test("P8a：静态 200 带 Cache-Control/ETag/Last-Modified", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r = await get(port, "/resource/images/a.jpg");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers["cache-control"], "public, max-age=604800");
      assert.match(r.headers.etag, /^W\/"\d+-\d+"$/, "应为 size-mtimeMs 弱指纹");
      assert.ok(r.headers["last-modified"], "应有 Last-Modified");
      assert.ok(!isNaN(Date.parse(r.headers["last-modified"])), "Last-Modified 应为 HTTP-date");
      assert.strictEqual(r.body.length, 300);
    });
  });
});

test("P8a：匹配 If-None-Match → 304 无 body 且保留缓存协商头", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r1 = await get(port, "/resource/images/a.jpg");
      const r2 = await get(port, "/resource/images/a.jpg", { "if-none-match": r1.headers.etag });
      assert.strictEqual(r2.status, 304);
      assert.strictEqual(r2.body, "", "304 不得携带 body");
      assert.strictEqual(r2.headers.etag, r1.headers.etag);
      assert.strictEqual(r2.headers["cache-control"], "public, max-age=604800");
      assert.strictEqual(r2.headers["last-modified"], r1.headers["last-modified"]);
    });
  });
});

test("P8a：不匹配 If-None-Match → 200", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r = await get(port, "/resource/images/a.jpg", { "if-none-match": 'W/"1-1"' });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 300);
    });
  });
});

test("P8a：If-Modified-Since 回退（秒精度）→ 304", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r1 = await get(port, "/resource/images/a.jpg");
      const r2 = await get(port, "/resource/images/a.jpg", {
        "if-modified-since": r1.headers["last-modified"],
      });
      assert.strictEqual(r2.status, 304);
      assert.strictEqual(r2.body, "");
    });
  });
});

test("P8a 回归：Range 仍 206 且 Content-Range 正确，缓存头同在", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r = await get(port, "/resource/images/a.jpg", { range: "bytes=0-99" });
      assert.strictEqual(r.status, 206);
      assert.strictEqual(r.headers["content-range"], "bytes 0-99/300");
      assert.strictEqual(r.headers["cache-control"], "public, max-age=604800");
      assert.ok(r.headers.etag);
    });
  });
});

test("P8a：Range + 命中缓存条件时 304 优先于 206", async () => {
  await withResourceDir(CACHE_FIXTURE, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r1 = await get(port, "/resource/images/a.jpg");
      const r2 = await get(port, "/resource/images/a.jpg", {
        "if-none-match": r1.headers.etag,
        range: "bytes=0-99",
      });
      assert.strictEqual(r2.status, 304);
      assert.strictEqual(r2.body, "");
    });
  });
});

test("P8a 回归：/resource/sqlite/* 仍被拒且不发缓存头", async () => {
  await withResourceDir({ "sqlite/y-stage.sqlite": "SQLite format 3" }, async () => {
    await withServer(staticOnlyApp(), async (port) => {
      const r = await get(port, "/resource/sqlite/y-stage.sqlite");
      assert.strictEqual(r.status, 404);
      assert.strictEqual(r.headers["cache-control"], undefined);
    });
  });
});

test("P8a：/web/front.json 动态清单不发长缓存", async () => {
  await withServer(staticOnlyApp(), async (port) => {
    const r = await get(port, "/web/front.json");
    assert.strictEqual(r.status, 200);
    assert.ok(!/max-age/.test(r.headers["cache-control"] || ""), "可写清单不得长缓存");
  });
});

if (require.main === module) {
  runTests("server/http/static.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
