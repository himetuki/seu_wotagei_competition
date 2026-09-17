/**
 * server/http/shim.js — req/res 兼容垫片单元测试（mock 对象，不占端口）
 *
 * 覆盖：S1 链式与 charset/Content-Length；send(string)→text/html、send(Buffer)→octet-stream
 * 保型；json 投影；redirect 的 Vary:Accept 协商（express 4.22 复刻）；H1 不对称
 * （req.path 原始编码 vs params 由路由器解码）；applyShim 幂等。
 */
const { test, runTests, assert, shimmedReq } = require("../test-lib");
const { applyShim } = require("./shim");

function freshRes() {
  const { res } = shimmedReq("GET", "/");
  return res;
}

test("链式：status/set/type/json/send/end 均返回 res 自身", () => {
  const res = freshRes();
  assert.strictEqual(res.status(201), res);
  assert.strictEqual(res.set("X-A", "1"), res);
  assert.strictEqual(res.type("json"), res);
  assert.strictEqual(res.json({ ok: 1 }), res);
  assert.strictEqual(res.send("hi"), res);
  assert.strictEqual(res.end(), res);
});

test("res.status(code) 设置 statusCode", () => {
  const res = freshRes();
  res.status(404);
  assert.strictEqual(res.statusCode, 404);
});

test("res.set 对象形式批量设置；数值转字符串；res.get 读取", () => {
  const res = freshRes();
  res.set({ "X-A": "1", "X-N": 7 });
  assert.strictEqual(res.get("X-A"), "1");
  assert.strictEqual(res.get("x-n"), "7");
});

test("res.set Content-Type 自动补 charset=utf-8", () => {
  const res = freshRes();
  res.set("Content-Type", "text/html");
  assert.strictEqual(res.get("Content-Type"), "text/html; charset=utf-8");
});

test("res.set 已带 charset 时不重复追加", () => {
  const res = freshRes();
  res.set("Content-Type", "text/html; charset=gbk");
  assert.strictEqual(res.get("Content-Type"), "text/html; charset=gbk");
});

test("res.set 非文本类型（image/png）不追加 charset", () => {
  const res = freshRes();
  res.set("Content-Type", "image/png");
  assert.strictEqual(res.get("Content-Type"), "image/png");
});

test("res.type 按扩展名查表（css→text/css）并补 charset", () => {
  const res = freshRes();
  res.type("css");
  assert.strictEqual(res.get("Content-Type"), "text/css; charset=utf-8");
});

test("res.type 完整 MIME 透传且不加 charset（application/xml）", () => {
  const res = freshRes();
  res.type("application/xml");
  assert.strictEqual(res.get("Content-Type"), "application/xml");
});

test("res.type 未知扩展名兜底 application/octet-stream", () => {
  const res = freshRes();
  res.type("xyz");
  assert.strictEqual(res.get("Content-Type"), "application/octet-stream");
});

test("res.send(string) → text/html 语义 + Content-Length 按字节数（中文 6 字节）", () => {
  const res = freshRes();
  res.send("中文");
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.get("Content-Type"), "text/html; charset=utf-8");
  assert.strictEqual(res.get("Content-Length"), "6");
  assert.strictEqual(res.body(), "中文");
});

test("res.send(Buffer) → application/octet-stream 且保型（原 Buffer 直达 res.end）", () => {
  const res = freshRes();
  const buf = Buffer.from([0, 1, 2, 255]);
  res.send(buf);
  assert.strictEqual(res.get("Content-Type"), "application/octet-stream");
  assert.strictEqual(res.get("Content-Length"), "4");
  assert.strictEqual(res.chunks.length, 1);
  assert.ok(Buffer.isBuffer(res.chunks[0]));
  assert.ok(res.chunks[0].equals(buf));
});

test("res.send(object) 委托 json（application/json + stringify）", () => {
  const res = freshRes();
  res.send({ a: 1 });
  assert.strictEqual(res.get("Content-Type"), "application/json; charset=utf-8");
  assert.strictEqual(res.body(), '{"a":1}');
});

test("res.json → application/json；已设 Content-Type 时不覆盖", () => {
  const res = freshRes();
  res.json({ a: "中" });
  assert.strictEqual(res.get("Content-Type"), "application/json; charset=utf-8");
  assert.strictEqual(res.body(), '{"a":"中"}');
  const res2 = freshRes();
  res2.set("Content-Type", "application/json; charset=gbk");
  res2.json({});
  assert.strictEqual(res2.get("Content-Type"), "application/json; charset=gbk");
});

test("res.redirect 默认 302：Location + Vary:Accept + 无 Accept 落 text/plain 分支", () => {
  const res = freshRes();
  res.redirect("/to");
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.get("Location"), "/to");
  assert.strictEqual(res.get("Vary"), "Accept");
  assert.strictEqual(res.get("Content-Type"), "text/plain; charset=utf-8");
  assert.strictEqual(res.body(), "Found. Redirecting to /to");
});

test("res.redirect Accept:*/* 仍落 text/plain 分支（req.accepts 取首键 text）", () => {
  const { res } = shimmedReq("GET", "/", { Accept: "*/*" });
  res.redirect("/to");
  assert.strictEqual(res.get("Content-Type"), "text/plain; charset=utf-8");
  assert.strictEqual(res.body(), "Found. Redirecting to /to");
});

test("res.redirect Accept:text/html → html 分支且地址 HTML 转义", () => {
  const { res } = shimmedReq("GET", "/", { accept: "text/html" }); // Node 入站头一律小写
  res.redirect('/to?next="/a"<b>');
  assert.strictEqual(res.get("Content-Type"), "text/html; charset=utf-8");
  assert.strictEqual(
    res.body(),
    '<p>Found. Redirecting to /to?next=&quot;/a&quot;&lt;b&gt;</p>'
  );
});

test("res.redirect(301, url) 覆写状态码", () => {
  const res = freshRes();
  res.redirect(301, "/moved");
  assert.strictEqual(res.statusCode, 301);
  assert.strictEqual(res.get("Location"), "/moved");
});

test("res.redirect HEAD 请求不写响应体（Location/Vary 照设）", () => {
  const { res } = shimmedReq("HEAD", "/");
  res.redirect("/to");
  assert.strictEqual(res.statusCode, 302);
  assert.strictEqual(res.get("Location"), "/to");
  assert.strictEqual(res.chunks.length, 0);
});

test("H1 不对称：req.path 保持原始百分号编码并剥查询；req.query 解析；req.originalUrl 原样", () => {
  const { req } = shimmedReq("GET", "/m/%E4%B8%AD%E6%96%87/?q=%20&x=1");
  assert.strictEqual(req.path, "/m/%E4%B8%AD%E6%96%87/");
  assert.strictEqual(Object.getPrototypeOf(req.query), null); // 与 express 查询对象一致
  assert.strictEqual(req.query.q, " ");
  assert.strictEqual(req.query.x, "1");
  assert.strictEqual(req.originalUrl, "/m/%E4%B8%AD%E6%96%87/?q=%20&x=1");
});

test("req.body / req.params 缺省为 {}（GET / 未匹配类型时 body 可用）", () => {
  const { req } = shimmedReq("GET", "/a");
  assert.deepStrictEqual(req.body, {});
  assert.deepStrictEqual(req.params, {});
});

test("applyShim 幂等：重复注入不叠加包装（res.set 引用不变）", () => {
  const req = { method: "GET", url: "/", headers: {} };
  const res = {
    statusCode: 200, headersSent: false, writableEnded: false,
    headers: {}, chunks: [],
    setHeader() {}, getHeader() {}, end() {},
  };
  applyShim(req, res);
  const setFn = res.set;
  const jsonFn = res.json;
  applyShim(req, res);
  assert.strictEqual(req.__yshim, true);
  assert.strictEqual(res.set, setFn);
  assert.strictEqual(res.json, jsonFn);
});

if (require.main === module) {
  runTests("server/http/shim.test.js").then((code) => process.exit(code));
}
module.exports = { runTests };
