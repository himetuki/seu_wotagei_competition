/**
 * y-router — 自研 Connect 兼容路由器（p1-p2-plan-v2.md §1）
 *
 * 匹配语义对照（普查 §7 / v2 §1.3）：
 *   :param      单段，值 decodeURIComponent（失败保留原值）
 *   *           零或多段（Express 4 `(.*)` 语义），params["0"] 承接（段间以 / 连接）
 *   尾斜杠      非严格匹配（匹配时忽略一个尾斜杠），req.path 保留原始路径
 *   req.path    百分号编码不解码（H1 不对称：path 原样 / params 解码）
 *   大小写      不敏感（模式与路径段 lowercase 比较，param 值取原始大小写）
 *   HEAD        按 GET 层分发，响应体由 Node 抑制
 *   OPTIONS     不自动应答（cors() 挂载最先，预检由 cors 应答，H7）
 *   前缀挂载    use("/api", subrouter)：剥前缀重写 req.url，未命中 next() 透传
 *   错误分发    next(err)/同步 throw → 跳到 4 参处理器；穷尽 → 沿 out 上抛
 *   顺序        注册序 = 匹配优先序（数组序，无优先级重排）
 *
 * per-plugin scope：createScope(name) 返回注册面（注册项全部打 scope 标），
 * removeScope(name) 物理移除该 scope 全部 layer（O(n) splice，物理热插拔核心）。
 *
 * P6a 请求排空：请求命中 scope 层时以 (请求, scope) 粒度登记在飞（res 'close'/'finish'
 * 先到者或 res.end 调用注销，同步 handler 由 end 包装覆盖）。drainScope(name) 标记
 * draining（此后命中该 scope 层的新请求立即 503 + Retry-After，不进入任何 handler）
 * 并等在飞归零后 resolve；超时（默认 15s，Y_STAGE_DRAIN_TIMEOUT_MS 可覆盖）强制继续
 * 由调用方告警。resumeScope(name) 清除标记。卸载插件 = loader 先 drainScope 再 dispose。
 */
const { pathnameOf, searchOf } = require("./shim");

// ---------- 请求排空（P6a） ----------

const DRAIN_TIMEOUT_DEFAULT_MS = 15000;

// 排空超时上限：opts.timeoutMs 优先 → Y_STAGE_DRAIN_TIMEOUT_MS → 默认 15s
function drainTimeoutMs(override) {
  if (Number.isFinite(override) && override > 0) return override;
  const env = Number(process.env.Y_STAGE_DRAIN_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : DRAIN_TIMEOUT_DEFAULT_MS;
}

// ---------- 路径编译与匹配 ----------

// "/m/:id/*" → ["m", ":id", "*"]（小写、去尾斜杠）
function compileSegments(path) {
  let segs = String(path).split("/").slice(1);
  if (segs.length && segs[segs.length - 1] === "") segs.pop();
  return segs.map((s) => s.toLowerCase());
}

// 原始 pathname → 段数组（不解码、保留编码）；"/" → []
// F4：去掉 segs.length > 1 守卫，使 "/" 与 compileSegments("/") 一致返回 []
//（旧守卫导致根路由 app.get("/") 永不命中，由模糊兜底掩盖）
function segmentsOf(pathname) {
  let segs = pathname.split("/").slice(1);
  if (segs.length && segs[segs.length - 1] === "") segs.pop();
  return segs;
}

function decodeSafe(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// 模式段 vs 路径段匹配；命中返回 params 对象，未命中返回 null
function matchSegments(pattern, segs) {
  const params = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p === "*") {
      // 零或多段（剩余全部），逐段解码后以 / 连接（等价 Express 对整个捕获组解码）
      params["0"] = segs.slice(i).map(decodeSafe).join("/");
      return params;
    }
    if (i >= segs.length) return null;
    const raw = segs[i];
    if (p.charAt(0) === ":") {
      params[p.slice(1)] = decodeSafe(raw);
    } else if (p !== raw.toLowerCase()) {
      return null;
    }
  }
  if (segs.length !== pattern.length) return null;
  return params;
}

// 前缀挂载匹配：命中返回重写后的 req.url（剩余路径+search），未命中 null
function matchPrefix(pattern, req) {
  const pathname = pathnameOf(req.url);
  const segs = segmentsOf(pathname);
  for (let i = 0; i < pattern.length; i++) {
    if (i >= segs.length || pattern[i] !== segs[i].toLowerCase()) return null;
  }
  const trailing = /\/$/.test(pathname) && pathname !== "/";
  let rest;
  if (segs.length === pattern.length) {
    rest = "/";
  } else {
    rest = "/" + segs.slice(pattern.length).join("/");
    if (trailing) rest += "/";
  }
  return rest + searchOf(req.url);
}

function flatten(arr) {
  return arr.reduce((acc, v) => acc.concat(Array.isArray(v) ? flatten(v) : [v]), []);
}

// ---------- 路由器 ----------
class YRouter {
  constructor(scope = "root") {
    this.layers = [];
    this.scope = scope; // 直接注册到本路由器的 layer 的归属 scope
    // P6a 请求排空状态（per-router：scope 名在本路由器 layers 内解析）
    this._inflight = new Map(); // scope -> 在飞请求数（(请求, scope) 去重后计数）
    this._draining = new Set(); // draining 标记：命中该 scope 层的新请求 → 503
    this._drainWaiters = new Map(); // scope -> Set<onZero>（在飞归零通知）
    // P6b 微窗口：drain 时记录 scope 路由模式，层被 removeScope 移除后、resume 前
    // （dispose→重挂间隙），命中原模式的请求在 404 兜底前拦截为 503
    this._drainPatterns = new Map(); // scope -> [{ method, pattern }]
  }

  use(path, ...fns) {
    if (typeof path === "function" || path instanceof YRouter) {
      fns.unshift(path);
      path = null;
    }
    for (const fn of flatten(fns)) {
      if (fn instanceof YRouter) {
        // 前缀子路由挂载（S4）：全方法、剥前缀、未命中透传
        this.layers.push({ kind: "mount", prefix: compileSegments(path || "/"), sub: fn, scope: this.scope });
      } else if (typeof fn === "function") {
        this.layers.push({ kind: "mw", method: null, pattern: path ? compileSegments(path) : null, handlers: [fn], scope: this.scope });
      }
    }
    return this;
  }

  _route(method, path, fns) {
    const handlers = flatten(fns).filter((f) => typeof f === "function");
    if (!handlers.length) return this;
    this.layers.push({ kind: "route", method, pattern: compileSegments(path), handlers, scope: this.scope });
    return this;
  }

  get(path, ...fns) { return this._route("GET", path, fns); }
  post(path, ...fns) { return this._route("POST", path, fns); }
  put(path, ...fns) { return this._route("PUT", path, fns); }
  delete(path, ...fns) { return this._route("DELETE", path, fns); }
  all(path, ...fns) { return this._route("ALL", path, fns); }

  // per-plugin scope：返回与 Express app 同面的注册面，注册项全部标记 scope（v2 §1.5）
  createScope(name) {
    const reg = (layer) => { layer.scope = name; this.layers.push(layer); return scopeFacade; };
    const mk = (method) => (path, ...fns) =>
      reg({ kind: "route", method, pattern: compileSegments(path), handlers: flatten(fns).filter((f) => typeof f === "function"), scope: name });
    const scopeFacade = {
      __scope: name,
      get: mk("GET"),
      post: mk("POST"),
      put: mk("PUT"),
      delete: mk("DELETE"),
      all: mk("ALL"),
      use: (path, ...fns) => {
        if (typeof path === "function") { fns.unshift(path); path = null; }
        for (const fn of flatten(fns)) {
          if (typeof fn === "function") {
            reg({ kind: "mw", method: null, pattern: path ? compileSegments(path) : null, handlers: [fn], scope: name });
          }
        }
        return scopeFacade;
      },
    };
    return scopeFacade;
  }

  // 物理移除：splice 掉该 scope 的全部 layer（卸载插件后其端点立刻 404）
  removeScope(name) {
    this.layers = this.layers.filter((l) => l.scope !== name);
  }

  // ---- P6a 请求排空 ----

  // 标记 scope draining（新请求命中该 scope 任一层 → 503，复用既有匹配逻辑判定）
  // → 等在飞归零 → resolve({ forced, timeoutMs })。超时强制 resolve({ forced: true })
  // （此时在飞请求可能失败，属有界降级；warn 告警由调用方负责——本层无 logger）。
  async drainScope(name, opts = {}) {
    const timeoutMs = drainTimeoutMs(opts.timeoutMs);
    this._draining.add(name);
    // 记录当前路由模式快照（层随后可能被 removeScope 物理移除，微窗口拦截用）
    this._drainPatterns.set(name, this._scopePatterns(name));
    if (!(this._inflight.get(name) > 0)) return { forced: false, timeoutMs };
    return new Promise((resolve) => {
      let waiters = this._drainWaiters.get(name);
      if (!waiters) {
        waiters = new Set();
        this._drainWaiters.set(name, waiters);
      }
      let settled = false;
      const settle = (forced) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        waiters.delete(onZero);
        resolve({ forced, timeoutMs });
      };
      const onZero = () => settle(false);
      waiters.add(onZero);
      const timer = setTimeout(() => settle(true), timeoutMs);
    });
  }

  // 清除 draining 标记（reload 场景重挂完成后恢复接客；idempotent）
  resumeScope(name) {
    this._draining.delete(name);
    this._drainPatterns.delete(name);
  }

  // scope 层的路由模式快照（微窗口拦截用）：只记 route / 带路径的 mw 层。
  // P6b 终审：pattern 为 null 的 pathless 中间件（scope.use(fn)）恒命中一切 URL，
  // 若纳入微窗口拦截会让该 scope 的 dispose→重挂间隙全站 503——而层移除后这些层
  // 本就不可能被路由选中（无路径锚点），故跳过；mount 层同理不记录。
  _scopePatterns(name) {
    return this.layers
      .filter((l) => l.scope === name && l.pattern)
      .map((l) => ({
        method: l.kind === "route" ? l.method : null,
        pattern: l.pattern,
      }));
  }

  // 请求是否命中一组已记录模式（微窗口拦截用；与层分发同款方法过滤 + 路径匹配）
  _matchPatternList(req, patterns) {
    const segs = segmentsOf(pathnameOf(req.url));
    for (const p of patterns) {
      if (p.method && p.method !== "ALL" && p.method !== (req.method === "HEAD" ? "GET" : req.method)) {
        continue;
      }
      if (p.pattern === null || matchSegments(p.pattern, segs)) {
        return true;
      }
    }
    return false;
  }

  // 在飞登记：(请求, scope) 粒度去重，每请求对每 scope 只登记一次。注销时机 =
  // res 'close' 与 'finish' 先到者，或 res.end 被调用（end 包装）——用 res 生命周期
  // 而非函数返回时机判定，同步 handler 与客户端中断（无 end，仅 'close'）均覆盖。
  _trackInflight(req, res, scopeName) {
    let seen = req.__yInflight;
    if (!seen) {
      seen = new Set();
      req.__yInflight = seen;
    }
    if (seen.has(scopeName)) return;
    seen.add(scopeName);
    this._inflight.set(scopeName, (this._inflight.get(scopeName) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const n = (this._inflight.get(scopeName) || 1) - 1;
      if (n > 0) {
        this._inflight.set(scopeName, n);
        return;
      }
      this._inflight.delete(scopeName);
      const waiters = this._drainWaiters.get(scopeName);
      if (waiters) {
        this._drainWaiters.delete(scopeName);
        for (const fn of waiters) fn();
      }
    };
    const rawEnd = res.end;
    res.end = (...args) => {
      try {
        return rawEnd.apply(res, args);
      } finally {
        release();
      }
    };
    if (typeof res.once === "function") {
      res.once("close", release);
      res.once("finish", release);
    }
  }

  // draining 命中 → 503（JSON + Retry-After:1；HEAD 无体），不进入任何 handler
  _respondDraining(req, res, scopeName) {
    if (res.headersSent || res.writableEnded) return;
    const id = String(scopeName).replace(/^plugin:/, "");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Retry-After", "1");
    const body = JSON.stringify({ error: `plugin ${id} is reloading` });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  // Connect 式分发。out = 父路由器的续延（前缀挂载递归用）；根调用不传。
  handle(req, res, out) {
    const layers = this.layers;
    const self = this; // P6a：step 内访问排空状态与 503 应答
    let i = 0;
    let pendingErr = null;

    // P6b 微窗口：draining scope 的层已被物理移除（dispose→重挂间隙），此时任何层都
    // 不会命中、404 兜底（handle404）会抢答——在分发入口前拦：命中 drain 时记录的
    // 路由模式 → 503（Retry-After），重挂完成 resumeScope 后自愈。层仍在场时（drain
    // 等待期）不走此检查：层内检查已覆盖，且先于 scope 注册的核心层保持优先
    // （K16：共享路由与插件路由前缀不相交）。out 非 undefined = 子路由递归，不重复拦。
    if (out === undefined && self._drainPatterns.size > 0) {
      for (const [scopeName, patterns] of self._drainPatterns) {
        if (self.layers.some((l) => l.scope === scopeName)) continue; // 层在场 → 层内检查
        if (self._matchPatternList(req, patterns)) {
          self._respondDraining(req, res, scopeName);
          return;
        }
      }
    }

    function step() {
      if (res.writableEnded) return;
      while (i < layers.length) {
        const layer = layers[i++];

        // 前缀挂载：错误态直接跳过（Express 中错误穿透 router 找 4 参处理器）
        if (layer.kind === "mount") {
          if (pendingErr) continue;
          const rest = matchPrefix(layer.prefix, req);
          if (rest === null) continue;
          // P6a：draining scope 的挂载层命中 → 503 拒新（不降入子路由）
          if (self._draining.has(layer.scope)) {
            self._respondDraining(req, res, layer.scope);
            return;
          }
          const savedUrl = req.url;
          req.url = rest;
          layer.sub.handle(req, res, (e) => {
            req.url = savedUrl;
            pendingErr = e || pendingErr;
            step();
          });
          return;
        }

        const fn = layer.handlers[0];
        const isErrHandler = typeof fn === "function" && fn.length >= 4;
        if (pendingErr && !isErrHandler) continue;
        if (!pendingErr && isErrHandler) continue;

        // 方法过滤（HEAD 按 GET 匹配）
        if (layer.method && layer.method !== "ALL") {
          const m = req.method === "HEAD" ? "GET" : req.method;
          if (layer.method !== m) continue;
        }

        // 路径匹配（pathless 中间件恒命中）
        const params = layer.pattern ? matchSegments(layer.pattern, segmentsOf(pathnameOf(req.url))) : {};
        if (!params) continue;
        // P6a：draining scope 的层命中 → 503 拒新（不进入任何 handler，不登记在飞）
        if (self._draining.has(layer.scope)) {
          self._respondDraining(req, res, layer.scope);
          return;
        }
        req.params = params;

        // 错误处理器被消费后回到正常模式（其 next() 无参 → 后续层按无错误推进）
        const errToPass = pendingErr;
        if (errToPass && isErrHandler) pendingErr = null;
        // P6a：scope 层在飞登记（root 直注册层不计数——drain 面向插件 scope）
        if (layer.scope !== self.scope) self._trackInflight(req, res, layer.scope);
        invoke(layer, 0, errToPass);
        return;
      }

      // 穷尽
      if (out) return out(pendingErr);
      if (pendingErr) {
        // 兜底（正常时 handleErrors 已在层内应答）
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
        }
        try { res.end("Internal Server Error"); } catch (e) { /* ignore */ }
        return;
      }
      // 默认 404（正常时 handle404 中间件先于此触发）
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Cannot " + req.method + " " + pathnameOf(req.originalUrl || req.url));
    }

    // 执行一层内的 handler 链（路由级中间件数组，如 router.post(p, upload.none(), h)）
    // initialErr：进入本层时待分发的错误（4 参处理器以 (err,req,res,next) 调用，S5）
    function invoke(layer, h, initialErr) {
      if (res.writableEnded) return;
      const fn = layer.handlers[h];
      let calledNext = false;
      const next = (e) => {
        if (calledNext) return;
        calledNext = true;
        if (e) { pendingErr = e; step(); return; }
        if (h + 1 < layer.handlers.length) { invoke(layer, h + 1, undefined); return; }
        step();
      };
      try {
        if (fn.length >= 4) fn(initialErr, req, res, next);
        else fn(req, res, next);
      } catch (e) {
        next(e);
      }
      // 未同步调用 next → 处理器自行负责响应（异步 next 仍可推进）
    }

    step();
  }
}

module.exports = { YRouter, drainTimeoutMs };
