/**
 * req/res 兼容垫片 — 覆盖 express-usage-survey.md §9 清单
 *   S1 res.status/set/type/json/send/end/redirect（链式、charset、Content-Length）
 *   S2 req.path（保持百分号编码+尾斜杠）/ req.query / req.body(默认{}) / req.params（解码由路由器填）
 *   S6 res.redirect(302, url)（复刻 express 4.22 res.format 协商：Vary: Accept + text/html|text/plain）
 *
 * 已拍板差异：不发 ETag（无 304）；不实现 res.send(number)、res.attachment 等未用 API。
 */
const querystring = require("querystring");

// express res.set 对带 charset 的 MIME（mime-db charsets.lookup）追加 "; charset=utf-8"。
// 此表覆盖本项目实际会输出的全部类型（以 endpoint-baseline.json 实录为准）。
const MIME_CHARSETS = {
  "text/html": "utf-8",
  "text/css": "utf-8",
  "text/plain": "utf-8",
  "application/json": "utf-8",
  "application/javascript": "utf-8",
  "image/svg+xml": "utf-8",
};

// res.type(扩展名) 查找表（完整 MIME 串直接透传）
const EXT_TYPES = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function pathnameOf(url) {
  const i = url.indexOf("?");
  return i < 0 ? url : url.slice(0, i);
}

function searchOf(url) {
  const i = url.indexOf("?");
  return i < 0 ? "" : url.slice(i);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyShim(req, res) {
  if (req.__yshim) return;
  req.__yshim = true;

  // ---- req 侧（普查 §6） ----
  req.originalUrl = req.url;
  Object.defineProperty(req, "path", {
    // 关键不对称（H1）：path 保持原始百分号编码与尾斜杠，随挂载重写的 req.url 变化
    get() { return pathnameOf(req.url); },
    configurable: true,
  });
  req.query = querystring.parse(searchOf(req.url).slice(1));
  if (req.params === undefined) req.params = {};
  if (req.body === undefined) req.body = {}; // 普查：config-routes 等依赖 GET/未匹配类型时 body 为 {}
  req.res = res;
  res.req = req;
  res.locals = {};

  // ---- res 侧（普查 §5） ----
  const rawSetHeader = res.setHeader.bind(res);

  res.set = function set(field, val) {
    if (typeof field === "string") {
      let v = val;
      if (field.toLowerCase() === "content-type" && typeof v === "string" && !/;\s*charset=/i.test(v)) {
        const base = v.split(";")[0].trim().toLowerCase();
        const cs = MIME_CHARSETS[base];
        if (cs) v = v + "; charset=" + cs;
      }
      rawSetHeader(field, typeof v === "number" ? String(v) : v);
    } else if (field && typeof field === "object") {
      for (const [k, v] of Object.entries(field)) res.set(k, v);
    }
    return res;
  };
  res.header = res.set;
  res.get = function get(field) { return res.getHeader(field); };

  res.type = function type(t) {
    const ct = String(t).includes("/") ? t : (EXT_TYPES[String(t).toLowerCase()] || "application/octet-stream");
    return res.set("Content-Type", ct);
  };

  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.send = function send(body) {
    if (typeof body === "object" && body !== null && !Buffer.isBuffer(body)) return res.json(body);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    if (!res.getHeader("Content-Type")) {
      // express 语义（H3）：字符串 → text/html；Buffer → application/octet-stream
      res.set("Content-Type", Buffer.isBuffer(body) ? "application/octet-stream" : "text/html");
    }
    res.set("Content-Length", buf.length);
    res.end(buf);
    return res;
  };

  res.json = function json(obj) {
    if (!res.getHeader("Content-Type")) res.set("Content-Type", "application/json");
    return res.send(JSON.stringify(obj));
  };

  // express 4.22 res.redirect：location → res.format({text, html, default})（Vary: Accept）→ CL → end
  res.redirect = function redirect(...args) {
    let status = 302;
    let address = args[0];
    if (args.length === 2) {
      if (typeof args[0] === "number") { status = args[0]; address = args[1]; }
      else { status = args[1]; }
    }
    rawSetHeader("Location", address);
    rawSetHeader("Vary", "Accept");
    const accept = req.headers.accept || "";
    let body, ct;
    if (/text\/html/i.test(accept)) {
      body = "<p>Found. Redirecting to " + escapeHtml(address) + "</p>";
      ct = "text/html";
    } else {
      // 无 Accept 头 / */* / json 等均落 text 分支（express req.accepts 取首键 text）
      body = "Found. Redirecting to " + address;
      ct = "text/plain";
    }
    res.statusCode = status;
    res.set("Content-Type", ct);
    res.set("Content-Length", Buffer.byteLength(body));
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return res;
  };

  // res.end() 保持原生并链式（普查：唯一 1 处 416 链式 .end()）
  const rawEnd = res.end.bind(res);
  res.end = function end(...a) { const r = rawEnd(...a); return r === undefined ? res : r; };
}

module.exports = { applyShim, pathnameOf, searchOf };
