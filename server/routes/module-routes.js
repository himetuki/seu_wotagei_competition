/**
 * 模块路由：/api/modules 清单接口 + /m/:id 静态页面服务
 *
 * URL 语义（重要）：
 *   /m/<id>        → 302 到 /m/<id>/（保证页面内相对资源 style.css 等解析正确）
 *   /m/<id>/       → 服务 modules/<id>/index.html
 *   /m/<id>/*      → 服务 modules/<id>/ 下的子资源/子页面
 *
 * 注意：Express 4 中 /m/:id/* 的 * 通配是可选的（可匹配 /m/setting），
 * 因此必须把精确的 /m/:id 放在资源通配之前注册。
 */
const path = require("path");
const paths = require("../paths.cjs");
const { serverLog } = require("../utils");
const registry = require("../module-registry.cjs");
const { sendFileSafe } = require("./static-routes");

function setupModuleRoutes(app) {
  // 模块清单接口（供导航页动态渲染）
  app.get("/api/modules", (req, res) => {
    const list = registry.listModules().map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description || "",
      icon: m.icon || "",
      nav: m.nav || [],
      order: m.order || 0,
      route: `/m/${m.id}/`,
    }));
    res.json(list);
  });

  // /m/<id> 模块页面入口
  // 无尾斜杠 → 302 补尾斜杠（保证相对资源解析正确）；带尾斜杠 → 直接服务 index.html
  app.get("/m/:id", (req, res) => {
    const mod = registry.getModule(req.params.id);
    if (!mod) {
      return res.status(404).send(`模块 ${req.params.id} 不存在`);
    }
    if (req.path.endsWith("/")) {
      const filePath = path.join(paths.modulesDir(), mod.id, "index.html");
      if (!sendFileSafe(res, filePath)) {
        return res.status(404).send(`模块页面 ${mod.id} 不存在`);
      }
      return;
    }
    return res.redirect(302, `/m/${mod.id}/`);
  });

  // 服务模块资源（splat 为空 → index.html）
  app.get("/m/:id/*", (req, res, next) => {
    const mod = registry.getModule(req.params.id);
    if (!mod) return next();
    const rest = req.params[0] || "";
    // F5 路径穿越防护（第一道）：rest 自 URL 逐段解码，含 ".." 点段（/ 或 \ 分隔，如
    // /m/drag/../../server/database.js、%2e%2e、..%5c 变体）一律拒绝。
    if (rest.split(/[\\/]/).includes("..")) {
      return res.status(403).send("Forbidden");
    }
    // F5 防护（第二道）：resolve 规范化后强制位于 modules/<id>/ 之内
    //（path.relative 判定跨盘符安全：异盘结果为绝对路径）。startsWith("..") 精确化为
    // 段首 ".."（P3 复验备注），"..foo" 这类合法同名目录不再被误杀。
    const moduleDir = path.join(paths.modulesDir(), mod.id);
    const filePath = path.resolve(moduleDir, rest || "index.html");
    const relToModule = path.relative(moduleDir, filePath);
    if (relToModule === ".." || relToModule.startsWith(".." + path.sep) || path.isAbsolute(relToModule)) {
      return res.status(403).send("Forbidden");
    }
    if (!sendFileSafe(res, filePath)) {
      res.status(404).send(`模块资源 ${rest || "index.html"} 不存在`);
    }
  });

  serverLog("模块路由已设置完成（/api/modules、/m/<id>/ 目录式 URL）");
}

module.exports = setupModuleRoutes;