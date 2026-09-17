/**
 * server/http/router.js — YRouter 单元测试（不占端口，走 applyShim + handle 同步分发）
 *
 * 覆盖：:param 解码 / * 通配零或多段 / 尾斜杠宽容 / 大小写不敏感 / HEAD 按 GET /
 * OPTIONS 不自动应答 / 前缀挂载剥前缀与还原 / 4 参错误分发 / 404 兜底 /
 * createScope/removeScope 物理移除。
 * 回归语义（Express 行为普查）：H1 中文段 params 解码 vs req.path 原始编码不对称；
 * /m/:id 与 /m/:id/* 五态匹配。
 */
const { test, runTests, assert, dispatch, mockReq, mockRes } = require("../test-lib");
const { YRouter, drainTimeoutMs } = require("./router");

// 常用 handler：把 params 回显为 JSON，便于断言解码结果
function echoParams(req, res) {
  res.setHeader("X-Echo-Path", req.path);
  res.json(req.params);
}
function ok(text) {
  return (req, res) => res.end(text || "ok");
}

test(":param 匹配单段并解码 URL 编码（/m/:id）", () => {
  const r = new YRouter();
  r.get("/m/:id", echoParams);
  const { res } = dispatch(r, "GET", "/m/drag-game");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "drag-game" });
});

test("H1 回归：中文路径段在 params 中解码，req.path 保持原始百分号编码", () => {
  const r = new YRouter();
  r.get("/m/:id", echoParams);
  const encoded = encodeURIComponent("中文");
  const { req, res } = dispatch(r, "GET", "/m/" + encoded);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body()).id, "中文");
  assert.strictEqual(req.path, "/m/%E4%B8%AD%E6%96%87");
});

test(":param 解码失败时保留原值（非法编码 %ZZ）", () => {
  const r = new YRouter();
  r.get("/m/:id", echoParams);
  const { res } = dispatch(r, "GET", "/m/%ZZ");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "%ZZ" });
});

test(":param 只匹配单段：/m/a/b 不命中 /m/:id（404）", () => {
  const r = new YRouter();
  r.get("/m/:id", ok());
  const { res } = dispatch(r, "GET", "/m/a/b");
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body(), "Cannot GET /m/a/b");
});

test("* 通配匹配零段：/api/x 命中 /api/x/* 且 params['0']==='' ", () => {
  const r = new YRouter();
  r.get("/api/x/*", echoParams);
  const { res } = dispatch(r, "GET", "/api/x");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body()), { "0": "" });
});

test("* 通配匹配多段：剩余段以 / 连接进 params['0']", () => {
  const r = new YRouter();
  r.get("/api/x/*", echoParams);
  const { res } = dispatch(r, "GET", "/api/x/a/b/c");
  assert.deepStrictEqual(JSON.parse(res.body()), { "0": "a/b/c" });
});

test("* 通配逐段解码：编码斜杠 %2F 展开为真实斜杠", () => {
  const r = new YRouter();
  r.get("/api/x/*", echoParams);
  const { res } = dispatch(r, "GET", "/api/x/a%2Fb/c%20d");
  assert.deepStrictEqual(JSON.parse(res.body()), { "0": "a/b/c d" });
});

test("尾斜杠宽容：/m/:id 命中 /m/drag/，req.path 保留尾斜杠", () => {
  const r = new YRouter();
  r.get("/m/:id", echoParams);
  const { req, res } = dispatch(r, "GET", "/m/drag/");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body()).id, "drag");
  assert.strictEqual(req.path, "/m/drag/");
});

test("大小写不敏感：/API/Users 命中 /api/users", () => {
  const r = new YRouter();
  r.get("/api/users", ok("users"));
  const { res } = dispatch(r, "GET", "/API/Users");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "users");
});

test("param 值保留原始大小写：/m/DRAG → id='DRAG'", () => {
  const r = new YRouter();
  r.get("/m/:id", echoParams);
  const { res } = dispatch(r, "GET", "/m/DRAG");
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "DRAG" });
});

test("HEAD 按 GET 层分发（handler 收到原始 method='HEAD'）", () => {
  const r = new YRouter();
  let seen = null;
  r.get("/probe", (req, res) => { seen = req.method; res.end("ok"); });
  const { res } = dispatch(r, "HEAD", "/probe");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(seen, "HEAD");
});

test("OPTIONS 不自动应答：无 OPTIONS 层 → 404 Cannot OPTIONS", () => {
  const r = new YRouter();
  r.get("/x", ok());
  const { res } = dispatch(r, "OPTIONS", "/x");
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body(), "Cannot OPTIONS /x");
});

test("404 兜底：404 + text/plain + Cannot GET <originalUrl 的 pathname（剥查询）>", () => {
  const r = new YRouter();
  const { res } = dispatch(r, "GET", "/nope?x=1");
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.getHeader("Content-Type"), "text/plain; charset=utf-8");
  assert.strictEqual(res.body(), "Cannot GET /nope");
});

test("注册序即匹配优先序：先注册者先命中", () => {
  const r = new YRouter();
  r.get("/dup", ok("first"));
  r.get("/dup", ok("second"));
  const { res } = dispatch(r, "GET", "/dup");
  assert.strictEqual(res.body(), "first");
});

test("同步 throw → 跳到 4 参错误处理器", () => {
  const r = new YRouter();
  r.get("/boom", () => { throw new Error("boom-sync"); });
  r.use((err, req, res, next) => { res.statusCode = 500; res.end("E:" + err.message); });
  const { res } = dispatch(r, "GET", "/boom");
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body(), "E:boom-sync");
});

test("next(err) → 错误传递到 4 参处理器", () => {
  const r = new YRouter();
  r.use((req, res, next) => next(new Error("boom-next")));
  r.use((err, req, res, next) => { res.statusCode = 502; res.end("Z:" + err.message); });
  const { res } = dispatch(r, "GET", "/any");
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.body(), "Z:boom-next");
});

test("错误穷尽且无 4 参处理器 → 兜底 500 Internal Server Error", () => {
  const r = new YRouter();
  r.get("/boom", () => { throw new Error("x"); });
  const { res } = dispatch(r, "GET", "/boom");
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.getHeader("Content-Type"), "text/plain; charset=utf-8");
  assert.strictEqual(res.body(), "Internal Server Error");
});

test("4 参处理器 next() 无参 → 消费错误后回到正常分发", () => {
  const r = new YRouter();
  r.use((req, res, next) => next(new Error("boom")));
  r.use((err, req, res, next) => { req.seen = err.message; next(); });
  r.get("/x", (req, res) => res.end("ok:" + req.seen));
  const { res } = dispatch(r, "GET", "/x");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "ok:boom");
});

test("错误态跳过前缀挂载：挂载子路由不参与错误分发", () => {
  const r = new YRouter();
  const sub = new YRouter();
  let subHit = false;
  sub.get("/deep", (req, res) => { subHit = true; res.end("sub"); });
  r.use((req, res, next) => next(new Error("e")));
  r.use("/api", sub);
  const { res } = dispatch(r, "GET", "/api/deep");
  assert.strictEqual(subHit, false);
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.body(), "Internal Server Error");
});

test("前缀挂载剥前缀：子路由 :param 在剥前缀后的路径上取值", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/:id", echoParams);
  r.use("/m", sub);
  const { res } = dispatch(r, "GET", "/m/drag");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "drag" });
});

// F4 修复回归：segmentsOf("/") 与 compileSegments("/") 一致返回 []（原 segs.length > 1
// 守卫导致根路由 get("/") 永不命中、前缀挂载精确命中 404，曾以 test.skip 留档）
test("根路由：get('/') 应命中 GET /", () => {
  const r = new YRouter();
  r.get("/", ok("home"));
  const { res } = dispatch(r, "GET", "/");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "home");
});

test("前缀挂载：挂载点自身命中（GET /api 与 /api/ → 子路由 '/'）", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/", ok("api-root"));
  r.use("/api", sub);
  assert.strictEqual(dispatch(r, "GET", "/api").res.body(), "api-root");
  assert.strictEqual(dispatch(r, "GET", "/api/").res.body(), "api-root");
});

test("前缀挂载未命中透传：req.url 原样，后续层可继续匹配", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/only", ok());
  r.use("/api", sub);
  let seenUrl = null;
  r.get("/other", (req, res) => { seenUrl = req.url; res.end("other"); });
  const { res } = dispatch(r, "GET", "/other");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "other");
  assert.strictEqual(seenUrl, "/other");
});

test("前缀挂载：子路由穷尽 → 404 消息使用原始 URL", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/known", ok());
  r.use("/api", sub);
  const { res } = dispatch(r, "GET", "/api/missing?x=1");
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body(), "Cannot GET /api/missing");
});

test("前缀挂载：子路由抛错沿 out 上抛，由父层 4 参处理器处理且 req.url 已还原", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/x", () => { throw new Error("sub-boom"); });
  r.use("/api", sub);
  let seenUrl = null;
  r.use((err, req, res, next) => {
    seenUrl = req.url;
    res.statusCode = 503;
    res.end("handled:" + err.message);
  });
  const { res } = dispatch(r, "GET", "/api/x");
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body(), "handled:sub-boom");
  assert.strictEqual(seenUrl, "/api/x");
});

// ---- /m/:id 与 /m/:id/* 五态匹配（普查回归） ----
test("五态-1：/m/drag 精确命中 :id 路由", () => {
  const r = new YRouter();
  r.get("/m/:id", ok("page"));
  r.get("/m/:id/*", ok("asset"));
  const { res } = dispatch(r, "GET", "/m/drag");
  assert.strictEqual(res.body(), "page");
});

test("五态-2：/m/drag/ 尾斜杠仍命中 :id 路由（不落入 * 路由）", () => {
  const r = new YRouter();
  r.get("/m/:id", ok("page"));
  r.get("/m/:id/*", ok("asset"));
  const { res } = dispatch(r, "GET", "/m/drag/");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "page");
});

test("五态-3：/m/drag/style.css 命中 * 路由且通配含点号段", () => {
  const r = new YRouter();
  r.get("/m/:id", ok("page"));
  r.get("/m/:id/*", echoParams);
  const { res } = dispatch(r, "GET", "/m/drag/style.css");
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "drag", "0": "style.css" });
});

test("五态-4：/m/drag/a/b/c 多段全入通配，:id 保留单段值", () => {
  const r = new YRouter();
  r.get("/m/:id", ok("page"));
  r.get("/m/:id/*", echoParams);
  const { res } = dispatch(r, "GET", "/m/drag/a/b/c");
  assert.deepStrictEqual(JSON.parse(res.body()), { id: "drag", "0": "a/b/c" });
});

test("五态-5：裸前缀 /m 与 /m/ 不命中任何一层（404）", () => {
  const r = new YRouter();
  r.get("/m/:id", ok("page"));
  r.get("/m/:id/*", ok("asset"));
  assert.strictEqual(dispatch(r, "GET", "/m").res.statusCode, 404);
  assert.strictEqual(dispatch(r, "GET", "/m/").res.statusCode, 404);
});

// ---- createScope / removeScope ----
test("createScope：scope 注册的层立即可服务", () => {
  const r = new YRouter();
  const scope = r.createScope("plugin:p1");
  scope.get("/probe", ok("scoped"));
  const { res } = dispatch(r, "GET", "/probe");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "scoped");
});

test("removeScope：物理移除后立即 404，非 scope 层不受影响", () => {
  const r = new YRouter();
  r.get("/keep", ok("kept"));
  const scope = r.createScope("plugin:p1");
  scope.get("/probe", ok("scoped"));
  r.removeScope("plugin:p1");
  assert.strictEqual(dispatch(r, "GET", "/probe").res.statusCode, 404);
  assert.strictEqual(dispatch(r, "GET", "/keep").res.body(), "kept");
});

test("removeScope：同时移除 scope 内 use 注册的中间件层", () => {
  const r = new YRouter();
  const scope = r.createScope("plugin:p1");
  let mwHit = false;
  scope.use((req, res, next) => { mwHit = true; next(); });
  scope.get("/probe", ok("scoped"));
  r.removeScope("plugin:p1");
  const { res } = dispatch(r, "GET", "/probe");
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(mwHit, false);
});

test("removeScope：双插件 scope 互不影响", () => {
  const r = new YRouter();
  r.createScope("plugin:a").get("/a", ok("A"));
  r.createScope("plugin:b").get("/b", ok("B"));
  r.removeScope("plugin:b");
  assert.strictEqual(dispatch(r, "GET", "/a").res.body(), "A");
  assert.strictEqual(dispatch(r, "GET", "/b").res.statusCode, 404);
});

test("removeScope：未知 scope 名为 no-op，不抛错", () => {
  const r = new YRouter();
  r.get("/keep", ok());
  r.removeScope("plugin:never-existed");
  assert.strictEqual(dispatch(r, "GET", "/keep").res.statusCode, 200);
});

test("scopeFacade 链式：get/use 返回 facade 自身", () => {
  const r = new YRouter();
  const scope = r.createScope("plugin:chain");
  const got = scope.get("/a", ok());
  const used = scope.use((req, res, next) => next());
  assert.strictEqual(got, scope);
  assert.strictEqual(used, scope);
  assert.strictEqual(scope.__scope, "plugin:chain");
});

// ---- P6a 请求排空：drainScope / resumeScope / 在飞登记 / 503 拒新 ----

const tick = () => new Promise((resolve) => setImmediate(resolve));

// drainTimeoutMs：opts.timeoutMs 优先 → Y_STAGE_DRAIN_TIMEOUT_MS → 默认 15000
test("drainTimeoutMs：opts 优先 → env 覆盖 → 默认 15s（非法值回退默认）", () => {
  delete process.env.Y_STAGE_DRAIN_TIMEOUT_MS;
  assert.strictEqual(drainTimeoutMs(), 15000);
  assert.strictEqual(drainTimeoutMs(42), 42);
  process.env.Y_STAGE_DRAIN_TIMEOUT_MS = "1234";
  assert.strictEqual(drainTimeoutMs(), 1234);
  process.env.Y_STAGE_DRAIN_TIMEOUT_MS = "bogus";
  assert.strictEqual(drainTimeoutMs(), 15000);
  delete process.env.Y_STAGE_DRAIN_TIMEOUT_MS;
});

test("drainScope：在飞未归零时等待，res.end 注销后 resolve（forced=false）", async () => {
  const r = new YRouter();
  let finish;
  r.createScope("plugin:p").get("/slow", (req, res) => { finish = () => res.end("done"); });
  const { res } = dispatch(r, "GET", "/slow"); // handler 已执行、响应挂起
  assert.strictEqual(res.writableEnded, false);
  let settled = null;
  const p = r.drainScope("plugin:p").then((v) => { settled = v; });
  await tick();
  assert.strictEqual(settled, null); // 在飞等待中
  finish();
  await p;
  assert.strictEqual(settled.forced, false);
});

test("同步 handler：res.end 即注销在飞，drainScope 立即 resolve", async () => {
  const r = new YRouter();
  r.createScope("plugin:p").get("/fast", (req, res) => res.end("ok"));
  dispatch(r, "GET", "/fast"); // 同步完成
  const out = await r.drainScope("plugin:p");
  assert.strictEqual(out.forced, false);
});

test("draining 期间命中 scope 层的新请求 → 503 JSON + Retry-After:1，不进入 handler", () => {
  const r = new YRouter();
  let hit = 0;
  r.createScope("plugin:drag").get("/x", (req, res) => { hit += 1; res.end("x"); });
  r.drainScope("plugin:drag"); // 无在飞 → 立即 resolve，但标记保留（重挂窗口语义）
  const { res } = dispatch(r, "GET", "/x");
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.getHeader("Retry-After"), "1");
  assert.strictEqual(res.getHeader("Content-Type"), "application/json; charset=utf-8");
  assert.strictEqual(res.body(), JSON.stringify({ error: "plugin drag is reloading" }));
  assert.strictEqual(hit, 0);
});

test("HEAD 排空期 503 无响应体", () => {
  const r = new YRouter();
  r.createScope("plugin:drag").get("/x", (req, res) => res.end("x"));
  r.drainScope("plugin:drag");
  const { res } = dispatch(r, "HEAD", "/x");
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.body(), "");
});

test("resumeScope：清除标记后恢复 200（无 503/404 残留）", () => {
  const r = new YRouter();
  r.createScope("plugin:p").get("/x", ok("back"));
  r.drainScope("plugin:p");
  assert.strictEqual(dispatch(r, "GET", "/x").res.statusCode, 503);
  r.resumeScope("plugin:p");
  const { res } = dispatch(r, "GET", "/x");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body(), "back");
});

test("排空仅限目标 scope：其他 scope 与 root 直注册层不受影响", () => {
  const r = new YRouter();
  r.createScope("plugin:a").get("/a", ok("A"));
  r.createScope("plugin:b").get("/b", ok("B"));
  r.get("/core", ok("core"));
  r.drainScope("plugin:a");
  assert.strictEqual(dispatch(r, "GET", "/a").res.statusCode, 503);
  assert.strictEqual(dispatch(r, "GET", "/b").res.body(), "B");
  assert.strictEqual(dispatch(r, "GET", "/core").res.body(), "core");
  // 不命中 draining scope 层的路径保持既有 404 语义（不被 503 拦截）
  assert.strictEqual(dispatch(r, "GET", "/missing").res.statusCode, 404);
});

test("超时强制路径：timeoutMs 到点 resolve（forced=true），标记仍生效直至 resume", async () => {
  const r = new YRouter();
  let finish;
  r.createScope("plugin:p").get("/hang", (req, res) => { finish = () => res.end(); });
  dispatch(r, "GET", "/hang");
  const t0 = Date.now();
  const out = await r.drainScope("plugin:p", { timeoutMs: 30 });
  assert.strictEqual(out.forced, true);
  assert.ok(Date.now() - t0 >= 25);
  assert.strictEqual(dispatch(r, "GET", "/hang").res.statusCode, 503); // 标记未清
  finish();
  r.resumeScope("plugin:p");
  assert.strictEqual(dispatch(r, "GET", "/hang").res.statusCode, 200);
});

test("同请求多 scope 层（middleware+route）只登记一次：单次注销即归零", async () => {
  const r = new YRouter();
  let finish;
  const s = r.createScope("plugin:dup");
  s.use((req, res, next) => next());
  s.get("/x", (req, res) => { finish = () => res.end("ok"); });
  dispatch(r, "GET", "/x");
  finish(); // 唯一一次注销
  const out = await r.drainScope("plugin:dup", { timeoutMs: 80 });
  // 若重复登记成 2，单次注销后仍 >0，只能靠超时 forced=true
  assert.strictEqual(out.forced, false);
});

test("res 'close' 注销（客户端中断、无 end）：drain 归零 resolve", async () => {
  const r = new YRouter();
  r.createScope("plugin:p").get("/abort", (req, res) => { /* 永不 end */ });
  // 事件版 mock res（真实 http.ServerResponse 具备 once；test-lib mock 无事件，就地补齐）
  const req = mockReq("GET", "/abort");
  const res = mockRes();
  const listeners = { close: [], finish: [] };
  res.once = (ev, fn) => listeners[ev].push(fn);
  res.emit = (ev) => { for (const fn of listeners[ev].splice(0)) fn(); };
  r.handle(req, res);
  const p = r.drainScope("plugin:p");
  await tick();
  res.emit("finish"); // 先到者注销；close 再到被 released 标记挡住
  res.emit("close");
  const out = await p;
  assert.strictEqual(out.forced, false);
});

test("draining 前缀挂载层命中 → 503（不降入子路由），resume 后恢复", () => {
  const r = new YRouter();
  const sub = new YRouter();
  sub.get("/deep", ok("sub"));
  r.use("/p", sub); // 挂载层 scope = "root"
  r.drainScope("root");
  assert.strictEqual(dispatch(r, "GET", "/p/deep").res.statusCode, 503);
  r.resumeScope("root");
  assert.strictEqual(dispatch(r, "GET", "/p/deep").res.body(), "sub");
});

// ---- P6b 微窗口：dispose（removeScope）→ 重挂间隙的 503 前置拦截 ----

test("微窗口：层移除后标记仍在 → 命中原路由模式的请求 503（非 404），resume 后恢复 404", async () => {
  const r = new YRouter();
  let finish;
  const s = r.createScope("plugin:p");
  s.get("/slow", (req, res) => { finish = () => res.end("ok"); });
  dispatch(r, "GET", "/slow"); // 在飞
  const drainP = r.drainScope("plugin:p"); // 记录路由模式快照
  r.removeScope("plugin:p"); // 模拟 dispose：物理移除层，在飞 handler 仍持有响应
  assert.strictEqual(dispatch(r, "GET", "/slow").res.statusCode, 503); // 微窗口拦截
  assert.strictEqual(dispatch(r, "GET", "/never-had-scope").res.statusCode, 404); // 无关路径不受影响
  finish();
  await drainP;
  r.resumeScope("plugin:p");
  assert.strictEqual(dispatch(r, "GET", "/slow").res.statusCode, 404); // 标记清后恢复既有语义
});

test("微窗口：核心层与 scope 模式同路径时，层在场核心优先；层移除后 scope 拦截生效", async () => {
  const r = new YRouter();
  r.get("/dual", ok("core")); // 核心层先注册
  r.createScope("plugin:p").get("/dual", ok("plugin"));
  r.get("/only-plugin", ok("p-only"));
  const s = r.createScope("plugin:p");
  s.get("/only-plugin", ok("p-only-2"));
  r.drainScope("plugin:p");
  // 层在场：核心层照常优先（层内检查只在选中 scope 层时触发）
  assert.strictEqual(dispatch(r, "GET", "/dual").res.body(), "core");
  r.removeScope("plugin:p");
  // 层移除后：/dual 仍由核心层服务（分发入口检查只拦"仅 scope 曾覆盖"的路径形态……
  // 注：/dual 同样命中已记录模式 → 入口前置拦截按"该 URL 空间归属 draining scope"
  // 处理，这与插件排空的语义一致；但核心层在场时层内检查未触发，此处验证入口拦截）
  const dual = dispatch(r, "GET", "/dual");
  assert.strictEqual(dual.res.statusCode, 503);
  assert.strictEqual(dispatch(r, "GET", "/only-plugin").res.statusCode, 503);
  r.resumeScope("plugin:p");
  assert.strictEqual(dispatch(r, "GET", "/dual").res.body(), "core");
});

test("微窗口：pathless scope 中间件（pattern null）不参与拦截——不引发全站 503", () => {
  const r = new YRouter();
  const s = r.createScope("plugin:mw");
  s.use((req, res, next) => next()); // pathless：API 允许，但无路径锚点
  s.get("/real", ok("real"));
  r.get("/core", ok("core"));
  r.drainScope("plugin:mw"); // 记录模式快照（pathless 层应被跳过）
  r.removeScope("plugin:mw"); // 模拟 dispose 微窗口
  // 若 pathless 层被记录（恒命中），此处 /core 与 /anything 都会被 503
  assert.strictEqual(dispatch(r, "GET", "/core").res.body(), "core");
  assert.strictEqual(dispatch(r, "GET", "/anything").res.statusCode, 404);
  r.resumeScope("plugin:mw");
  assert.strictEqual(dispatch(r, "GET", "/real").res.statusCode, 404);
});

if (require.main === module) {
  runTests("server/http/router.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
