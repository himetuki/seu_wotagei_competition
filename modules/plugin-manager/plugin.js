/**
 * modules/plugin-manager 后端插件（P4）—— 装配管理体验的 HTTP 出口（规格 §5）
 *
 * 本插件自身也是"插件化"示范：管理面 = 一对普通插件（本文件 + front/plugin.js），
 * 不含任何特权代码 —— 装配控制全部经内置 assembly 服务（loader 在挂载业务插件前
 * provide），本插件零 fs 依赖、不可绕过清单直接改路由。
 *
 * API（前缀 /api/plugins，全部 JSON 响应）：
 *   GET  /api/plugins                  装配快照（后端全部条目 + front.json 前端条目）
 *   POST /api/plugins/:id/toggle       { enabled } 热启用/禁用（禁用 = 排空 + await dispose → 路由物理 404）
 *   POST /api/plugins/:id/reload       热替换（K11 逐出 + K2 先卸后挂；真实文件，改盘即生效）
 *   GET  /api/plugins/:id/config       读清单条目 config
 *   POST /api/plugins/:id/config       { config } 写回并热重装该插件（null 清除）
 *   POST /api/plugins/front/:id/toggle { enabled } 前端清单开关（刷新页面后生效）
 *
 * 每次变更成功后 ctx.emit("plugins.updated", snapshot)。
 * 自保护：manager 自身的 fiber 承载着请求所在 route scope，禁用/热重载/热改 config
 * 都意味着"先卸后挂"自己在途请求的 scope（K2/K6 竞态），一律 400 拒绝。
 */
module.exports = {
  name: "plugin-manager",
  inject: ["assembly", "server", "modules"],
  apply(ctx) {
    const SELF = "plugin-manager";

    ctx.modules.registerPage({
      id: SELF,
      name: "插件管理",
      description: "插件装配管理与热替换",
      icon: "puzzle",
      nav: ["index"],
      order: 5,
    });

    // 统一响应：成功后广播快照（异步服务错误兜底 500，不让 y-router 落到文本 404/500）
    const respond = (res, promise) => {
      promise
        .then((r) => {
          if (r && r.ok) ctx.emit("plugins.updated", ctx.assembly.status());
          res.json(r);
        })
        .catch((e) => res.status(500).json({ ok: false, error: e.message }));
    };

    ctx.server.route((app) => {
      app.get("/api/plugins", (req, res) => {
        res.json(ctx.assembly.status());
      });

      // 前端清单开关（路径段数与 :id 路由不同，无匹配冲突）
      app.post("/api/plugins/front/:id/toggle", (req, res) => {
        respond(res, ctx.assembly.toggleFront(req.params.id, !!(req.body && req.body.enabled)));
      });

      app.post("/api/plugins/:id/toggle", (req, res) => {
        const id = req.params.id;
        if (id === SELF && !(req.body && req.body.enabled)) {
          return res.status(400).json({ ok: false, error: "不能禁用插件管理器自身（自保护）" });
        }
        respond(res, ctx.assembly.toggle(id, !!(req.body && req.body.enabled)));
      });

      app.post("/api/plugins/:id/reload", (req, res) => {
        const id = req.params.id;
        if (id === SELF) {
          return res.status(400).json({
            ok: false,
            error: "管理器不支持热重载自身（会拆除请求所在的 scope），请重启服务",
          });
        }
        respond(res, ctx.assembly.reload(id));
      });

      app.get("/api/plugins/:id/config", (req, res) => {
        const item = ctx.assembly.status().backend.find((b) => b.id === req.params.id);
        if (!item) {
          return res.status(404).json({ ok: false, error: `清单中不存在插件 ${req.params.id}` });
        }
        res.json({ ok: true, id: item.id, config: item.config });
      });

      app.post("/api/plugins/:id/config", (req, res) => {
        const id = req.params.id;
        if (id === SELF) {
          return res.status(400).json({
            ok: false,
            error: "管理器自身不接受 config 热更（重挂会拆除自身 scope）",
          });
        }
        if (!req.body || !("config" in req.body)) {
          return res.status(400).json({
            ok: false,
            error: '需要 JSON body { "config": ... }（config 传 null 清除）',
          });
        }
        respond(res, ctx.assembly.setConfig(id, req.body.config));
      });
    });

    ctx.effect(() => () => ctx.modules.unregister(SELF));
  },
};
