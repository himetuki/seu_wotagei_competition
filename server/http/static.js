/**
 * 手写静态文件中间件 — 自 server.js 整体平移（普查 §4 / M3：搬家非重写）
 * 保留：/api/ 与 /resource/json/ 跳过、FS 优先、mimeMap、Range 206/416 流式、
 *       req.path 原始编码 + 手动 decodeURIComponent（H1）。
 * P6b：/resource/** 从 RESOURCE_DIR 解析（数据层可外置于便携根），/web/** 与
 *      /favicon.ico 仍从 APP_ROOT 解析；inlined-assets 兜底随 pkg 退役删除。
 */
const fs = require("fs");
const path = require("path");
const paths = require("../paths.cjs");

// URL → 文件路径别名（P3a 前端内核）：/web/kernel.js 是对外稳定 URL，
// 实际指向构建产物 web/dist/kernel.js；/web/front.json 无别名表项，由下方
// 动态供源分支读 paths.frontManifestPath()（P6 修复：便携模式下外置插件层清单）。
const WEB_PATH_ALIASES = {
  "/web/kernel.js": "/web/dist/kernel.js",
};

// P5a 最小静态白名单：页面实际引用的根路径仅 /resource/**、/web/**、/favicon.ico
// （/api/* 上方已跳过；/m/* 归 module-routes，/ 归首页路由）。其余路径不再经本中间件
// 读盘 —— /server/**、/package.json、/scripts/** 等源码/配置从此不可被静态读出。
// /resource/sqlite/ 是 SQLite 业务库落盘目录，同样禁止下载。
const STATIC_ALLOWED_PREFIXES = ["/resource/", "/web/"];
const STATIC_ALLOWED_FILES = ["/favicon.ico"];
const STATIC_DENIED_PREFIXES = ["/resource/sqlite/"];

function isStaticAllowed(relPath) {
  if (STATIC_ALLOWED_FILES.includes(relPath)) return true;
  if (!STATIC_ALLOWED_PREFIXES.some((p) => relPath.startsWith(p))) return false;
  return !STATIC_DENIED_PREFIXES.some((p) => relPath.startsWith(p));
}

// P8a HTTP 缓存协商：静态文件命中时下发 Cache-Control/ETag/Last-Modified，
// 条件请求（304）优先于 Range（206）与 200。弱 ETag 指纹 = size-mtimeMs，
// 秒级 mtime 变化即可失效；对上游/浏览器代理均为标准可协商形态。
const CACHE_CONTROL_STATIC = "public, max-age=604800"; // 7 天

/** If-None-Match 匹配：弱比较（忽略 W/ 前缀），支持逗号列表与 "*" */
function etagMatches(ifNoneMatch, etag) {
  const want = etag.replace(/^W\//, "");
  return String(ifNoneMatch).split(",").some((part) => {
    const tag = part.trim();
    return tag === "*" || tag.replace(/^W\//, "") === want;
  });
}

/** If-Modified-Since 未修改判定：HTTP-date 仅秒精度，mtime 截断到秒后 <= 请求时间 */
function notModifiedSince(ifModifiedSince, mtime) {
  const since = Date.parse(ifModifiedSince);
  if (isNaN(since)) return false;
  return Math.floor(mtime.getTime() / 1000) * 1000 <= since;
}

/** 条件请求判定：If-None-Match 存在时以其为准（RFC 7232），否则回退 If-Modified-Since */
function isNotModified(req, etag, mtime) {
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch) return etagMatches(ifNoneMatch, etag);
  const ifModifiedSince = req.headers["if-modified-since"];
  return ifModifiedSince ? notModifiedSince(ifModifiedSince, mtime) : false;
}

module.exports = function createStaticMiddleware(opts = {}) {
  // opts.APP_ROOT 供测试显式注入；生产一律走 paths（dev/便携统一解析）
  const appRoot = opts.APP_ROOT || paths.resolvePaths().appRoot;
  return function staticMiddleware(req, res, next) {
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

    // 别名表精确匹配（值均为根内安全路径，无 ".."，置于穿越防护之前不影响校验）
    if (Object.prototype.hasOwnProperty.call(WEB_PATH_ALIASES, relPath)) {
      relPath = WEB_PATH_ALIASES[relPath];
    }

    // F5 路径穿越防护（第一道）：解码后含 ".." 点段一律拒绝（/ 与 \ 分隔都算）。
    // 点段请求没有合法用例，且 ../ 可能收敛回根内（如 /m/drag/../../server/...），
    // 仅靠 resolve+根前缀校验拦不住根内逃逸。置于白名单之前：穿越形态一律 403。
    if (relPath.split(/[\\/]/).includes("..")) {
      res.status(403).end("Forbidden");
      return;
    }

    // P5a 白名单：不在允许集合内的路径交还后续路由（最终 404），不读盘。
    if (!isStaticAllowed(relPath)) {
      return next();
    }

    // P6b 终审 [P1]：/web/front.json 动态解析 frontManifestPath——前端装配清单在便携
    // 模式下位于插件层（Y_STAGE_PLUGINS_DIR/front.json），app/web/ 不保留冻结副本；
    // 管理页 toggleFront 落盘后本端点立即反映（与 /web/kernel.js 别名同款"对外 URL
    // 稳定、磁盘路径随模式解析"）。仅精确路径触发；frontManifestPath 由服务端配置
    // 解析、不含用户输入，免穿越防护。
    if (relPath === "/web/front.json") {
      const manifestPath = paths.frontManifestPath();
      try {
        if (fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile()) {
          // 可写装配清单：禁止长缓存，避免管理页 toggle 后被缓存掩盖（无 ETag/304）
          res.set("Cache-Control", "no-cache");
          res.type("application/json");
          res.send(fs.readFileSync(manifestPath));
          return;
        }
      } catch (e) { /* fall through → next() */ }
      return next();
    }

    // P6b：/resource/** 锚定 RESOURCE_DIR（数据层外置，剥去 /resource URL 前缀），
    // 其余锚定 app 目录
    const isResource = relPath.startsWith("/resource/");
    const base = isResource ? paths.resourceDir() : appRoot;
    const filePath = path.join(base, isResource ? relPath.slice("/resource".length) : relPath);

    // F5 路径穿越防护（第二道）：规范化后强制位于 base 之内（拦 /../package.json 等
    // 绝对逃逸变体）。path.relative 跨盘符安全：异盘结果为绝对路径，同盘越界以 ".." 开头；
    // 精确化（P3 复验备注）：仅段首 ".."（rel === ".." 或 "../"前缀）才算越界，
    // 避免 "..foo" 这类合法同名目录被 startsWith("..") 误杀；relToRoot 为空串 = 根目录本身。
    const relToRoot = path.relative(path.resolve(base), path.resolve(filePath));
    if (relToRoot === ".." || relToRoot.startsWith(".." + path.sep) || path.isAbsolute(relToRoot)) {
      res.status(403).end("Forbidden");
      return;
    }

    // 文件系统直读（FS 优先；P6b 起唯一来源）
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const etag = `W/"${fileSize}-${Math.floor(stat.mtimeMs)}"`;

        // P8a：缓存头先于条件判定下发（200/206/304 共用；304 亦须保留协商元数据）。
        // P11：/web/** 是随代码发布的资产（kernel.js、lib/*.mjs、components/*.css、
        // icons.mjs）——长缓存会让浏览器拿旧内核（P11 试点实际发生：组件 API 报
        // "内核未升级"）。改 no-cache：每次导航用 ETag 重验，未变即 304（局域网代价
        // 约 200B），已变更立即拿到新代码。图片/音乐仍是 7 天长缓存。
        const isWebAsset = relPath.startsWith("/web/");
        res.set({
          "Cache-Control": isWebAsset ? "no-cache" : CACHE_CONTROL_STATIC,
          ETag: etag,
          "Last-Modified": stat.mtime.toUTCString(),
        });
        // 条件请求短路：304 无 body，优先于 Range（RFC 7232 §4.1 / §3.3）
        if (isNotModified(req, etag, stat.mtime)) {
          res.status(304).end();
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
          ".html": "text/html", ".css": "text/css",
          ".js": "application/javascript", ".mjs": "application/javascript",
          ".json": "application/json",
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
          ".mp3": "audio/mpeg", ".wav": "audio/wav",
        };
        res.type(mimeMap[ext] || "application/octet-stream");
        res.set("Accept-Ranges", "bytes");

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

    next();
  };
};
