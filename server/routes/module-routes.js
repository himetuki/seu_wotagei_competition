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
const { APP_ROOT, serverLog } = require("../utils");
const { getModules, getModule } = require("../module-loader");
const { sendFileSafe } = require("./static-routes");

function setupModuleRoutes(app) {
  // 模块清单接口（供导航页动态渲染）
  app.get("/api/modules", (req, res) => {
    const list = getModules().map((m) => ({
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
    const mod = getModule(req.params.id);
    if (!mod) {
      return res.status(404).send(`模块 ${req.params.id} 不存在`);
    }
    if (req.path.endsWith("/")) {
      const filePath = path.join(APP_ROOT, "modules", mod.id, "index.html");
      if (!sendFileSafe(res, filePath)) {
        return res.status(404).send(`模块页面 ${mod.id} 不存在`);
      }
      return;
    }
    return res.redirect(302, `/m/${mod.id}/`);
  });

  // 服务模块资源（splat 为空 → index.html）
  app.get("/m/:id/*", (req, res, next) => {
    const mod = getModule(req.params.id);
    if (!mod) return next();
    const rest = req.params[0] || "";
    const filePath = path.join(APP_ROOT, "modules", mod.id, rest || "index.html");
    if (!sendFileSafe(res, filePath)) {
      res.status(404).send(`模块资源 ${rest || "index.html"} 不存在`);
    }
  });

  serverLog("模块路由已设置完成（/api/modules、/m/<id>/ 目录式 URL）");
}

module.exports = setupModuleRoutes;